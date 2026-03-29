import { useState, useEffect } from 'react';
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
} from 'date-fns';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DatePreset = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  preset: DatePreset;
}

export interface RevenuePeriod {
  date: string;     // formatted for display e.g. "Mar 29"
  revenue: number;
  liters: number;
}

export interface RevenueData {
  periods: RevenuePeriod[];
  totalRevenue: number;
  totalLiters: number;
  avgPerLiter: number;
}

export interface ProfitMarginData {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
}

export interface TopClientData {
  name: string;
  totalLiters: number;
  totalRevenue: number;
  revenuePercent: number;
}

export interface SettlementBucket {
  count: number;
  amount: number;
}

export interface SettlementData {
  settled: SettlementBucket;
  unsettled: SettlementBucket;
  void: SettlementBucket;
  totalCount: number;
  totalAmount: number;
}

export interface ProcurementData {
  totalSpent: number;
  totalLiters: number;
  avgCostPerLiter: number;
  grCount: number;
}

export interface FinanceReportsResult {
  revenue: RevenueData | null;
  profitMargin: ProfitMarginData | null;
  topClients: TopClientData[];
  settlementRate: SettlementData | null;
  procurementCosts: ProcurementData | null;
  loading: boolean;
  error: string | null;
}

// ─── Date range helper ────────────────────────────────────────────────────────

export function getPresetDateRange(preset: Exclude<DatePreset, 'custom'>): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case 'daily':
      return {
        from: format(startOfDay(now), 'yyyy-MM-dd'),
        to: format(endOfDay(now), 'yyyy-MM-dd'),
      };
    case 'weekly':
      return {
        from: format(startOfDay(subDays(now, 6)), 'yyyy-MM-dd'),
        to: format(endOfDay(now), 'yyyy-MM-dd'),
      };
    case 'monthly':
      return {
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    case 'yearly':
      return {
        from: format(startOfYear(now), 'yyyy-MM-dd'),
        to: format(endOfYear(now), 'yyyy-MM-dd'),
      };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFinanceReports(dateRange: DateRange): FinanceReportsResult {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [profitMargin, setProfitMargin] = useState<ProfitMarginData | null>(null);
  const [topClients, setTopClients] = useState<TopClientData[]>([]);
  const [settlementRate, setSettlementRate] = useState<SettlementData | null>(null);
  const [procurementCosts, setProcurementCosts] = useState<ProcurementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, [dateRange.from, dateRange.to]);

  async function fetchAll() {
    setLoading(true);
    setError(null);

    // Convert YYYY-MM-DD to ISO timestamps covering full days
    const fromISO = startOfDay(new Date(dateRange.from)).toISOString();
    const toISO = endOfDay(new Date(dateRange.to)).toISOString();

    const [
      revenueResult,
      lineItemsResult,
      clientInvoicesResult,
      settlementResult,
      procurementResult,
    ] = await Promise.all([
      // 1. Revenue — raw invoice rows, grouped client-side
      supabase
        .from('invoices')
        .select('created_at, total_amount, liters_sold')
        .neq('status', 'void')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })
        .limit(50000),

      // 2. Profit margin — line items with inner-joined invoice for filtering
      supabase
        .from('invoice_line_items')
        .select('liters_from_item, cost_per_liter, selling_price_per_liter, invoices!inner(created_at, status)')
        .gte('invoices.created_at', fromISO)
        .lte('invoices.created_at', toISO)
        .neq('invoices.status', 'void')
        .limit(50000),

      // 3. Top clients — invoices with client name
      supabase
        .from('invoices')
        .select('total_amount, liters_sold, client:client_id(name)')
        .neq('status', 'void')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .limit(50000),

      // 4. Settlement rate — all invoices in range grouped by status client-side
      supabase
        .from('invoices')
        .select('status, total_amount')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .limit(50000),

      // 5. Procurement costs — goods_received rows in range
      supabase
        .from('goods_received')
        .select('liters_received, cost_per_liter, created_at')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .limit(50000),
    ]);

    // ── 1. Revenue ────────────────────────────────────────────────────────────
    if (revenueResult.error) {
      console.error('Revenue query error:', revenueResult.error);
    } else {
      const rows = revenueResult.data || [];

      // Build a date-keyed map for every day in the range
      const revenueMap: Record<string, { revenue: number; liters: number }> = {};
      const cursor = new Date(dateRange.from);
      const end = new Date(dateRange.to);
      while (cursor <= end) {
        const key = format(cursor, 'yyyy-MM-dd');
        revenueMap[key] = { revenue: 0, liters: 0 };
        cursor.setDate(cursor.getDate() + 1);
      }

      rows.forEach((inv) => {
        const key = format(new Date(inv.created_at), 'yyyy-MM-dd');
        if (revenueMap[key]) {
          revenueMap[key].revenue += Number(inv.total_amount) || 0;
          revenueMap[key].liters += Number(inv.liters_sold) || 0;
        }
      });

      const periods: RevenuePeriod[] = Object.entries(revenueMap).map(([date, val]) => ({
        date: format(new Date(date), 'MMM dd'),
        revenue: val.revenue,
        liters: val.liters,
      }));

      const totalRevenue = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const totalLiters = rows.reduce((s, r) => s + (Number(r.liters_sold) || 0), 0);

      setRevenue({
        periods,
        totalRevenue,
        totalLiters,
        avgPerLiter: totalLiters > 0 ? totalRevenue / totalLiters : 0,
      });
    }

    // ── 2. Profit margin ──────────────────────────────────────────────────────
    if (lineItemsResult.error) {
      console.error('Profit margin query error:', lineItemsResult.error);
      // Fallback: compute from invoices revenue vs GR cost
      setProfitMargin(null);
    } else {
      const rows = lineItemsResult.data || [];
      let totalRevenue = 0;
      let totalCost = 0;

      rows.forEach((item: any) => {
        const liters = Number(item.liters_from_item) || 0;
        totalRevenue += liters * (Number(item.selling_price_per_liter) || 0);
        totalCost += liters * (Number(item.cost_per_liter) || 0);
      });

      const grossProfit = totalRevenue - totalCost;
      const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      setProfitMargin({ totalRevenue, totalCost, grossProfit, marginPercent });
    }

    // ── 3. Top clients ────────────────────────────────────────────────────────
    if (clientInvoicesResult.error) {
      console.error('Top clients query error:', clientInvoicesResult.error);
    } else {
      const rows = clientInvoicesResult.data || [];
      const clientMap: Record<string, { name: string; totalLiters: number; totalRevenue: number }> = {};

      rows.forEach((inv: any) => {
        const name: string = inv.client?.name || 'Unknown';
        if (!clientMap[name]) {
          clientMap[name] = { name, totalLiters: 0, totalRevenue: 0 };
        }
        clientMap[name].totalLiters += Number(inv.liters_sold) || 0;
        clientMap[name].totalRevenue += Number(inv.total_amount) || 0;
      });

      const sorted = Object.values(clientMap)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);

      const grandTotal = sorted.reduce((s, c) => s + c.totalRevenue, 0);

      setTopClients(
        sorted.map((c) => ({
          ...c,
          revenuePercent: grandTotal > 0 ? (c.totalRevenue / grandTotal) * 100 : 0,
        }))
      );
    }

    // ── 4. Settlement rate ────────────────────────────────────────────────────
    if (settlementResult.error) {
      console.error('Settlement query error:', settlementResult.error);
    } else {
      const rows = settlementResult.data || [];
      const buckets: Record<string, SettlementBucket> = {
        settled: { count: 0, amount: 0 },
        unsettled: { count: 0, amount: 0 },
        void: { count: 0, amount: 0 },
      };

      rows.forEach((inv) => {
        const key = inv.status in buckets ? inv.status : 'unsettled';
        buckets[key].count += 1;
        buckets[key].amount += Number(inv.total_amount) || 0;
      });

      setSettlementRate({
        settled: buckets.settled,
        unsettled: buckets.unsettled,
        void: buckets.void,
        totalCount: rows.length,
        totalAmount: rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0),
      });
    }

    // ── 5. Procurement costs ──────────────────────────────────────────────────
    if (procurementResult.error) {
      console.error('Procurement query error:', procurementResult.error);
    } else {
      const rows = procurementResult.data || [];
      const totalLiters = rows.reduce((s, r) => s + (Number(r.liters_received) || 0), 0);
      const totalSpent = rows.reduce(
        (s, r) => s + (Number(r.liters_received) || 0) * (Number(r.cost_per_liter) || 0),
        0
      );

      setProcurementCosts({
        totalSpent,
        totalLiters,
        avgCostPerLiter: totalLiters > 0 ? totalSpent / totalLiters : 0,
        grCount: rows.length,
      });
    }

    setLoading(false);
  }

  return { revenue, profitMargin, topClients, settlementRate, procurementCosts, loading, error };
}
