import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OshaliLoader from '../../components/OshaliLoader';
import Card from '../../components/ui/Card';
import RevenueTrendChart from '../../components/RevenueTrendChart';
import HorizontalBarList from '../../components/charts/HorizontalBarList';
import Select from '../../components/ui/Select';
import { DollarSign, Receipt, FileText, TrendingUp, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';

interface DashboardStats {
  monthRevenue: number;
  settledInvoices: number;
  unsettledInvoices: number;
  totalPurchases: number;
}

interface RecentPO {
  id: string;
  po_number: string;
  total_amount: number;
  status: string;
  supplier_name: string;
  created_at: string;
  liters_ordered: number;
}

type DatePreset = 'today' | 'this_month';

export default function FinanceDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    monthRevenue: 0,
    settledInvoices: 0,
    unsettledInvoices: 0,
    totalPurchases: 0,
  });
  const [recentPOs, setRecentPOs] = useState<RecentPO[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<{ label: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');

  useEffect(() => {
    loadDashboardData();
  }, [datePreset]);

  async function loadDashboardData() {
    try {
      const now = new Date();
      const { start, end } = datePreset === 'today'
        ? { start: startOfDay(now), end: endOfDay(now) }
        : { start: startOfMonth(now), end: endOfMonth(now) };

      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [
        invoicesResult,
        settledInvoicesResult,
        unsettledInvoicesResult,
        posResult,
        purchasesResult,
        recentRevenueResult
      ] = await Promise.all([
        supabase
          .from('invoices')
          .select('total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50000),
        supabase
          .from('invoices')
          .select('id')
          .eq('status', 'settled')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50000),
        supabase
          .from('invoices')
          .select('id')
          .eq('status', 'unsettled')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50000),
        supabase
          .from('purchase_orders')
          .select('id, po_number, total_amount, status, supplier_name, created_at, liters_ordered')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('purchase_orders')
          .select('total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('invoices')
          .select('created_at, total_amount')
          .gte('created_at', subDays(now, 6).toISOString())
          .lte('created_at', endOfDay(now).toISOString())
          .neq('status', 'void')
          .order('created_at', { ascending: true })
          .limit(50000)
      ]);

      const monthRevenue = invoicesResult.data?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const totalPurchases = purchasesResult.data?.reduce((sum, po) => sum + po.total_amount, 0) || 0;

      const dailyRevenueMap: { [key: string]: number } = {};
      for (let i = 0; i < 7; i++) {
        const date = subDays(now, 6 - i);
        const dateKey = format(date, 'MMM dd');
        dailyRevenueMap[dateKey] = 0;
      }

      recentRevenueResult.data?.forEach((invoice) => {
        const dateKey = format(new Date(invoice.created_at), 'MMM dd');
        if (dailyRevenueMap.hasOwnProperty(dateKey)) {
          dailyRevenueMap[dateKey] += invoice.total_amount;
        }
      });

      const dailyRevenueData = Object.entries(dailyRevenueMap).map(([label, value]) => ({ label, value }));

      setStats({
        monthRevenue,
        settledInvoices: settledInvoicesResult.data?.length || 0,
        unsettledInvoices: unsettledInvoicesResult.data?.length || 0,
        totalPurchases,
      });

      setRecentPOs(posResult.data || []);
      setDailyRevenue(dailyRevenueData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  const periodLabel = datePreset === 'today' ? "Today's" : "This Month's";

  const statCards = [
    {
      label: `${periodLabel} Revenue`,
      value: formatCurrency(stats.monthRevenue),
      icon: <DollarSign strokeWidth={1} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: `${periodLabel} Purchases`,
      value: formatCurrency(stats.totalPurchases),
      icon: <TrendingUp strokeWidth={1} />,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Settled Invoices',
      value: stats.settledInvoices.toString(),
      icon: <Receipt strokeWidth={1} />,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Unsettled Invoices',
      value: stats.unsettledInvoices.toString(),
      icon: <FileText strokeWidth={1} />,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  const netIncome = stats.monthRevenue - stats.totalPurchases;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light mb-2">Finance Dashboard</h1>
          <p className="text-sm font-light text-gray-500">
            Welcome back, {profile?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
          <Select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            className="w-40"
          >
            <option value="today">Today</option>
            <option value="this_month">This Month</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <OshaliLoader variant="inline" />
      ) : (
        <div className="space-y-6">

          {/* Zone 1 — Unsettled Invoice Queue */}
          {stats.unsettledInvoices > 0 ? (
            <Card className="border-2 border-amber-300 bg-amber-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-amber-800">
                      {stats.unsettledInvoices} unsettled invoice{stats.unsettledInvoices > 1 ? 's' : ''} pending
                    </div>
                    <div className="text-xs font-light text-amber-700">Requires payment collection or follow-up</div>
                  </div>
                </div>
                <Link to="/sales" className="text-sm font-light text-amber-700 hover:text-amber-900 whitespace-nowrap">
                  Settle invoices →
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="border border-emerald-200 bg-emerald-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-light text-emerald-700">All invoices settled — no outstanding payments</div>
              </div>
            </Card>
          )}

          {/* Zone 2 — Financial Summary */}
          <Card>
            <div className="space-y-4">
              <h3 className="text-sm font-light text-gray-500">{periodLabel} Financial Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                  <span className="text-xs font-light text-gray-600">Total Revenue</span>
                  <span className="text-lg font-light text-emerald-600">{formatCurrency(stats.monthRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                  <span className="text-xs font-light text-gray-600">Total Purchases</span>
                  <span className="text-lg font-light text-red-600">-{formatCurrency(stats.totalPurchases)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border-2 border-blue-200">
                  <span className="text-sm font-medium text-gray-700">Net Income</span>
                  <span className={`text-xl font-light ${netIncome >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Zone 3 — Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Daily Revenue (Last 7 Days)</h3>
                {dailyRevenue.length > 0 ? (
                  <HorizontalBarList data={dailyRevenue} />
                ) : (
                  <div className="text-center py-8 text-sm font-light text-gray-400">
                    No revenue data for this period
                  </div>
                )}
              </div>
            </Card>
            <RevenueTrendChart />
          </div>

          {/* Zone 4 — Recent Purchase Orders */}
          <Card>
            <div className="space-y-4">
              <h3 className="text-sm font-light text-gray-500">Recent Purchase Orders</h3>
              {recentPOs.length === 0 ? (
                <div className="text-center py-8 text-sm font-light text-gray-400">
                  No purchase orders yet
                </div>
              ) : (
                <div className="space-y-2">
                  {recentPOs.map((po) => (
                    <div key={po.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-light">{po.po_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-light ${
                            po.status === 'paid' ? 'bg-green-100 text-green-700' :
                            po.status === 'sent_to_supplier' ? 'bg-blue-100 text-blue-700' :
                            po.status === 'goods_received' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {po.status === 'sent_to_supplier' ? 'Sent' : po.status === 'goods_received' ? 'Received' : po.status}
                          </span>
                        </div>
                        <div className="text-xs font-light text-gray-500 mt-1">
                          {po.supplier_name} • {formatNumber(po.liters_ordered)}L
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-light">{formatCurrency(po.total_amount)}</div>
                        <div className="text-xs font-light text-gray-500">{format(new Date(po.created_at), 'MMM d')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Stat cards — supporting context at bottom */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-light text-gray-500 mb-2">{stat.label}</div>
                    <div className="text-2xl font-light">{stat.value}</div>
                  </div>
                  <div className={`${stat.color} ${stat.bg} w-12 h-12 rounded-xl flex items-center justify-center`}>
                    {stat.icon}
                  </div>
                </div>
              </Card>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
