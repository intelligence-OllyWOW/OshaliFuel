import { useState, useEffect, useMemo } from 'react';
import OshaliLoader from './OshaliLoader';
import Card from './ui/Card';
import Select from './ui/Select';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatNumber } from '../lib/utils';
import { format, subDays, startOfDay, endOfDay, startOfMonth, eachDayOfInterval } from 'date-fns';
import { DollarSign, TrendingUp, Receipt, Percent, Clock, CreditCard, Banknote, Building2 } from 'lucide-react';

async function fetchAllInvoices(
  startDate: Date,
  endDate: Date
): Promise<Invoice[]> {
  const PAGE_SIZE = 1000;
  let allInvoices: Invoice[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, client_id, liters_sold, total_amount,
        status, payment_method, invoice_date,
        client:client_id (name)
      `)
      .gte('invoice_date', format(startDate, 'yyyy-MM-dd'))
      .lte('invoice_date', format(endDate, 'yyyy-MM-dd'))
      .order('invoice_date', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allInvoices = allInvoices.concat(data as Invoice[]);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allInvoices;
}

async function fetchAllUnsettledInvoices(): Promise<{ id: string; total_amount: number }[]> {
  const PAGE_SIZE = 1000;
  let allInvoices: { id: string; total_amount: number }[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, total_amount')
      .eq('status', 'unsettled')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allInvoices = allInvoices.concat(data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allInvoices;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  liters_sold: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  invoice_date: string;
  client?: { name: string } | null;
}

interface StatisticsData {
  totalRevenue: number;
  totalLiters: number;
  totalInvoices: number;
  settledInvoices: number;
  unsettledInvoices: number;
  voidInvoices: number;
  avgInvoiceValue: number;
  settlementRate: number;
  outstandingAmount: number;
  paymentMethods: { card: number; cash: number; eft: number };
  topClients: { name: string; revenue: number; invoiceCount: number }[];
  dailyData: { date: string; revenue: number; liters: number; count: number }[];
}

type DateRange = '7days' | '30days' | '90days' | 'this_month' | 'this_year';

export default function SalesStatistics() {
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allUnsettledCount, setAllUnsettledCount] = useState(0);
  const [allUnsettledAmount, setAllUnsettledAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, [dateRange]);

  function getDateRange(): { start: Date; end: Date } {
    const now = new Date();
    switch (dateRange) {
      case '7days':
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case '30days':
        return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case '90days':
        return { start: startOfDay(subDays(now, 89)), end: endOfDay(now) };
      case 'this_month':
        return { start: startOfMonth(now), end: endOfDay(now) };
      case 'this_year':
        return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
      default:
        return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    }
  }

  async function loadStatistics() {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [periodInvoices, unsettledInvoices] = await Promise.all([
        fetchAllInvoices(start, end),
        fetchAllUnsettledInvoices()
      ]);

      setInvoices(periodInvoices);
      setAllUnsettledCount(unsettledInvoices.length);
      setAllUnsettledAmount(unsettledInvoices.reduce((sum, inv) => sum + inv.total_amount, 0));
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  }

  const stats: StatisticsData = useMemo(() => {
    const validInvoices = invoices.filter(inv => inv.status !== 'void');
    const settledInvoices = invoices.filter(inv => inv.status === 'settled');

    const totalRevenue = validInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalLiters = validInvoices.reduce((sum, inv) => sum + inv.liters_sold, 0);
    const settledRevenue = settledInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

    const paymentMethods = { card: 0, cash: 0, eft: 0 };
    settledInvoices.forEach(inv => {
      if (inv.payment_method === 'card') paymentMethods.card += inv.total_amount;
      else if (inv.payment_method === 'cash') paymentMethods.cash += inv.total_amount;
      else if (inv.payment_method === 'eft') paymentMethods.eft += inv.total_amount;
    });

    const clientRevenue: Record<string, { name: string; revenue: number; invoiceCount: number }> = {};
    validInvoices.forEach(inv => {
      const clientName = inv.client?.name || 'Walk-in';
      if (!clientRevenue[clientName]) {
        clientRevenue[clientName] = { name: clientName, revenue: 0, invoiceCount: 0 };
      }
      clientRevenue[clientName].revenue += inv.total_amount;
      clientRevenue[clientName].invoiceCount += 1;
    });
    const topClients = Object.values(clientRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const { start, end } = getDateRange();
    const days = eachDayOfInterval({ start, end });
    const dailyData = days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayInvoices = validInvoices.filter(inv =>
        inv.invoice_date === dayStr
      );
      return {
        date: dayStr,
        revenue: dayInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
        liters: dayInvoices.reduce((sum, inv) => sum + inv.liters_sold, 0),
        count: dayInvoices.length,
      };
    });

    return {
      totalRevenue,
      totalLiters,
      totalInvoices: validInvoices.length,
      settledInvoices: settledInvoices.length,
      unsettledInvoices: allUnsettledCount,
      voidInvoices: invoices.filter(inv => inv.status === 'void').length,
      avgInvoiceValue: validInvoices.length > 0 ? totalRevenue / validInvoices.length : 0,
      settlementRate: validInvoices.length > 0 ? (settledInvoices.length / validInvoices.length) * 100 : 0,
      outstandingAmount: allUnsettledAmount,
      paymentMethods,
      topClients,
      dailyData,
    };
  }, [invoices, dateRange, allUnsettledCount, allUnsettledAmount]);

  const maxDailyRevenue = Math.max(...stats.dailyData.map(d => d.revenue), 1);

  if (loading) return <OshaliLoader variant="inline" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-40"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-light text-gray-500 mb-2">Total Revenue</div>
              <div className="text-2xl font-light">{formatCurrency(stats.totalRevenue)}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" strokeWidth={1.5} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-light text-gray-500 mb-2">Total Liters Sold</div>
              <div className="text-2xl font-light">{formatNumber(stats.totalLiters)}L</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" strokeWidth={1.5} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-light text-gray-500 mb-2">Avg Invoice Value</div>
              <div className="text-2xl font-light">{formatCurrency(stats.avgInvoiceValue)}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-600" strokeWidth={1.5} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-light text-gray-500 mb-2">Settlement Rate</div>
              <div className="text-2xl font-light">{stats.settlementRate.toFixed(1)}%</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Percent className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-light text-gray-500">Revenue Trend</h3>
          </div>
          <div className="h-64 flex items-end gap-1">
            {stats.dailyData.slice(-30).map((day, index) => {
              const height = maxDailyRevenue > 0 ? (day.revenue / maxDailyRevenue) * 100 : 0;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-200 hover:from-blue-600 hover:to-blue-500 min-h-[2px]"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    <div>{format(new Date(day.date), 'MMM d')}</div>
                    <div>{formatCurrency(day.revenue)}</div>
                    <div>{formatNumber(day.liters)}L</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs font-light text-gray-400">
            <span>{stats.dailyData.length > 0 ? format(new Date(stats.dailyData[Math.max(0, stats.dailyData.length - 30)].date), 'MMM d') : ''}</span>
            <span>{stats.dailyData.length > 0 ? format(new Date(stats.dailyData[stats.dailyData.length - 1].date), 'MMM d') : ''}</span>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="text-sm font-light text-gray-500">Invoice Status (Period)</h3>
          </div>
          <div className="flex justify-center mb-6">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                {(() => {
                  const periodUnsettled = invoices.filter(inv => inv.status === 'unsettled').length;
                  const total = stats.settledInvoices + periodUnsettled + stats.voidInvoices || 1;
                  const settledPct = (stats.settledInvoices / total) * 100;
                  const unsettledPct = (periodUnsettled / total) * 100;
                  const settledDash = settledPct * 2.51327;
                  const unsettledDash = unsettledPct * 2.51327;
                  const settledOffset = 0;
                  const unsettledOffset = -settledDash;

                  return (
                    <>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                      {stats.settledInvoices > 0 && (
                        <circle
                          cx="50" cy="50" r="40" fill="none"
                          stroke="#22c55e" strokeWidth="12"
                          strokeDasharray={`${settledDash} 251.327`}
                          strokeDashoffset={settledOffset}
                        />
                      )}
                      {periodUnsettled > 0 && (
                        <circle
                          cx="50" cy="50" r="40" fill="none"
                          stroke="#f59e0b" strokeWidth="12"
                          strokeDasharray={`${unsettledDash} 251.327`}
                          strokeDashoffset={unsettledOffset}
                        />
                      )}
                    </>
                  );
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-light">{stats.totalInvoices}</div>
                <div className="text-xs font-light text-gray-500">Invoices</div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-light">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Settled</span>
              </div>
              <span>{stats.settledInvoices}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-light">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span>Unsettled</span>
              </div>
              <span>{invoices.filter(inv => inv.status === 'unsettled').length}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-light">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-200"></div>
                <span>Void</span>
              </div>
              <span>{stats.voidInvoices}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="mb-4">
            <h3 className="text-sm font-light text-gray-500">Outstanding Balance (All Time)</h3>
          </div>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center">
              <Clock className="w-7 h-7 text-red-500" strokeWidth={1.5} />
            </div>
            <div>
              <div className="text-3xl font-light text-red-600">{formatCurrency(stats.outstandingAmount)}</div>
              <div className="text-sm font-light text-gray-500">{stats.unsettledInvoices.toLocaleString()} unpaid invoices</div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-light text-gray-500">Payment Methods</h3>
          </div>
          <div className="space-y-3">
            {[
              { key: 'card', label: 'Card', icon: CreditCard, value: stats.paymentMethods.card, color: 'bg-blue-500' },
              { key: 'cash', label: 'Cash', icon: Banknote, value: stats.paymentMethods.cash, color: 'bg-green-500' },
              { key: 'eft', label: 'EFT', icon: Building2, value: stats.paymentMethods.eft, color: 'bg-amber-500' },
            ].map((method) => {
              const totalPayments = stats.paymentMethods.card + stats.paymentMethods.cash + stats.paymentMethods.eft || 1;
              const percentage = (method.value / totalPayments) * 100;
              return (
                <div key={method.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm font-light">
                      <method.icon className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                      <span>{method.label}</span>
                    </div>
                    <span className="text-sm font-light">{formatCurrency(method.value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${method.color} rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="text-sm font-light text-gray-500">Top Clients</h3>
          </div>
          {stats.topClients.length === 0 ? (
            <div className="text-center py-8 text-sm font-light text-gray-400">
              No client data available
            </div>
          ) : (
            <div className="space-y-3">
              {stats.topClients.map((client, index) => {
                const maxRevenue = stats.topClients[0]?.revenue || 1;
                const percentage = (client.revenue / maxRevenue) * 100;
                return (
                  <div key={client.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-light text-gray-600">
                          {index + 1}
                        </div>
                        <span className="text-sm font-light truncate max-w-[150px]">{client.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-light">{formatCurrency(client.revenue)}</div>
                        <div className="text-xs font-light text-gray-400">{client.invoiceCount} invoices</div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-8">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4">
          <h3 className="text-sm font-light text-gray-500">Daily Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-light">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-normal">Date</th>
                <th className="text-right py-3 px-4 text-gray-500 font-normal">Invoices</th>
                <th className="text-right py-3 px-4 text-gray-500 font-normal">Liters</th>
                <th className="text-right py-3 px-4 text-gray-500 font-normal">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stats.dailyData.slice(-10).reverse().map((day) => (
                <tr key={day.date} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">{format(new Date(day.date), 'EEE, MMM d')}</td>
                  <td className="py-3 px-4 text-right">{day.count}</td>
                  <td className="py-3 px-4 text-right">{formatNumber(day.liters)}L</td>
                  <td className="py-3 px-4 text-right font-medium">{formatCurrency(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
