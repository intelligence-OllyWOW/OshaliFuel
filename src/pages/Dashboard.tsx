import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import Card from '../components/ui/Card';
import TankVisualization from '../components/TankVisualization';
import Analytics from '../components/Analytics';
import RevenueTrendChart from '../components/RevenueTrendChart';
import HorizontalBarList from '../components/charts/HorizontalBarList';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Package, Receipt, FileText, TrendingUp, DollarSign, TrendingDown, AlertCircle, Calendar, ChevronLeft, ChevronRight, Users, Bell, Shield, Settings, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatNumber } from '../lib/utils';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  periodSales: number;
  pendingPRs: number;
  periodRevenue: number;
  buyingPrice: number;
  sellingPrice: number;
  settledInvoices: number;
  unsettledInvoices: number;
}

interface Tank {
  id: string;
  tank_name: string;
  capacity_liters: number;
  current_liters: number;
  items: any[];
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

interface SystemSettings {
  tank_low_level_threshold: number;
  tank_high_level_threshold: number;
  tank_critical_level_threshold: number;
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

function getDateRangeFromPreset(preset: DatePreset, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last_week':
      const lastWeek = subDays(now, 7);
      return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_month':
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom':
      return {
        start: customStart ? startOfDay(new Date(customStart)) : startOfDay(now),
        end: customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now),
      };
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    periodSales: 0,
    pendingPRs: 0,
    periodRevenue: 0,
    buyingPrice: 0,
    sellingPrice: 0,
    settledInvoices: 0,
    unsettledInvoices: 0,
  });
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [recentPOs, setRecentPOs] = useState<RecentPO[]>([]);
  const [dailyRevenue, setDailyRevenue] = useState<{ label: string; value: number }[]>([]);
  const [selectedWeekOffset, setSelectedWeekOffset] = useState<number>(0);
  const [settings, setSettings] = useState<SystemSettings>({
    tank_low_level_threshold: 20,
    tank_high_level_threshold: 90,
    tank_critical_level_threshold: 10,
  });
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadDashboardData();
  }, [datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    loadDailyRevenueData();
  }, [selectedWeekOffset]);

  async function loadDashboardData() {
    try {
      const { start, end } = getDateRangeFromPreset(datePreset, customStartDate, customEndDate);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [
        tanksResult,
        invoicesResult,
        settledInvoicesResult,
        unsettledInvoicesResult,
        prsResult,
        latestPriceResult,
        latestPOResult,
        posResult,
        settingsResult
      ] = await Promise.all([
        supabase.from('inventory_tanks').select('*').order('tank_name'),
        supabase
          .from('invoices')
          .select('liters_sold, total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('invoices')
          .select('id')
          .eq('status', 'settled')
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('invoices')
          .select('id')
          .eq('status', 'unsettled')
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase.from('purchase_requisitions').select('id').in('status', ['submitted', 'under_review']),
        supabase.from('pricing_settings').select('price_per_liter').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('purchase_orders').select('price_per_liter').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('purchase_orders').select('id, po_number, total_amount, status, supplier_name, created_at, liters_ordered').order('created_at', { ascending: false }).limit(5),
        supabase.from('system_settings').select('tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold').maybeSingle()
      ]);

      const totalInventory = tanksResult.data?.reduce((sum, tank) => sum + tank.current_liters, 0) || 0;
      const periodSales = invoicesResult.data?.reduce((sum, inv) => sum + inv.liters_sold, 0) || 0;
      const periodRevenue = invoicesResult.data?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;
      const pendingPRs = prsResult.data?.length || 0;

      for (const tank of tanksResult.data || []) {
        const { data: items } = await supabase
          .from('inventory_items')
          .select('id, remaining_liters, cost_per_liter, gr_id, goods_received(gr_number)')
          .eq('tank_id', tank.id)
          .gt('remaining_liters', 0)
          .order('entry_date');

        tank.items = items?.map((item: any) => ({
          id: item.id,
          gr_number: item.goods_received?.gr_number || 'N/A',
          remaining_liters: item.remaining_liters,
          cost_per_liter: item.cost_per_liter,
        })) || [];
      }

      setStats({
        totalInventory,
        periodSales,
        pendingPRs,
        periodRevenue,
        buyingPrice: latestPOResult.data?.price_per_liter || 0,
        sellingPrice: latestPriceResult.data?.price_per_liter || 0,
        settledInvoices: settledInvoicesResult.data?.length || 0,
        unsettledInvoices: unsettledInvoicesResult.data?.length || 0,
      });

      setTanks(tanksResult.data || []);
      setRecentPOs(posResult.data || []);

      if (settingsResult.data) {
        setSettings({
          tank_low_level_threshold: settingsResult.data.tank_low_level_threshold,
          tank_high_level_threshold: settingsResult.data.tank_high_level_threshold,
          tank_critical_level_threshold: settingsResult.data.tank_critical_level_threshold,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyRevenueData() {
    try {
      const now = new Date();
      const weekStart = subDays(now, 6 + (selectedWeekOffset * 7));
      const weekEnd = subDays(now, selectedWeekOffset * 7);

      const { data: recentInvoices } = await supabase
        .from('invoices')
        .select('created_at, total_amount')
        .gte('created_at', startOfDay(weekStart).toISOString())
        .lte('created_at', endOfDay(weekEnd).toISOString())
        .neq('status', 'void')
        .order('created_at', { ascending: true });

      const dailyRevenueMap: { [key: string]: number } = {};

      for (let i = 0; i < 7; i++) {
        const date = subDays(weekEnd, 6 - i);
        const dateKey = format(date, 'MMM dd');
        dailyRevenueMap[dateKey] = 0;
      }

      recentInvoices?.forEach((invoice) => {
        const dateKey = format(new Date(invoice.created_at), 'MMM dd');
        if (dailyRevenueMap.hasOwnProperty(dateKey)) {
          dailyRevenueMap[dateKey] += invoice.total_amount;
        }
      });

      const dailyRevenueData = Object.entries(dailyRevenueMap)
        .map(([label, value]) => ({ label, value }));

      setDailyRevenue(dailyRevenueData);
    } catch (error) {
      console.error('Error loading daily revenue data:', error);
    }
  }

  function getWeekLabel(offset: number): string {
    if (offset === 0) return 'Recent Daily Revenue (Last 7 Days)';
    if (offset === 1) return 'Daily Revenue (Previous Week)';
    return `Daily Revenue (${offset} weeks ago)`;
  }

  const periodLabel = datePreset === 'today' ? "Today's" :
    datePreset === 'yesterday' ? "Yesterday's" :
    datePreset === 'this_week' ? "This Week's" :
    datePreset === 'last_week' ? "Last Week's" :
    datePreset === 'this_month' ? "This Month's" :
    datePreset === 'last_month' ? "Last Month's" :
    datePreset === 'this_year' ? "This Year's" : "Period";

  const statCards = [
    {
      label: 'Total Inventory',
      value: `${formatNumber(stats.totalInventory)}L`,
      icon: <Package strokeWidth={1} />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: `${periodLabel} Sales`,
      value: `${formatNumber(stats.periodSales)}L`,
      icon: <Receipt strokeWidth={1} />,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: `${periodLabel} Revenue`,
      value: formatCurrency(stats.periodRevenue),
      icon: <DollarSign strokeWidth={1} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Pending PRs',
      value: stats.pendingPRs.toString(),
      icon: <FileText strokeWidth={1} />,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  const profitMargin = stats.sellingPrice && stats.buyingPrice
    ? ((stats.sellingPrice - stats.buyingPrice) / stats.sellingPrice * 100).toFixed(1)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light mb-2">Dashboard</h1>
          <p className="text-sm font-light text-gray-500">
            Welcome back, {profile?.full_name}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
            <Select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-40"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </Select>
          </div>
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-36"
              />
              <span className="text-gray-400 text-sm">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-36"
              />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <OshaliLoader variant="inline" />
      ) : (
        <div className="space-y-6">

          {/* System Health Strip */}
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-light text-gray-500 uppercase tracking-wide">System Health</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
                  <span className="text-xs font-light text-amber-700">Portal Access</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
                  <span className="text-xs font-light text-amber-700">Document Numbers</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
                  <span className="text-xs font-light text-emerald-700">Core Services</span>
                </div>
              </div>
            </div>
          </Card>

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

          {/* Quick Admin Actions */}
          <div className="grid grid-cols-4 gap-3">
            <Link to="/users" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-amber-400">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">Manage Users</div>
                    <div className="text-xs font-light text-gray-500">Accounts & roles</div>
                  </div>
                </div>
              </Card>
            </Link>
            {/* TODO: Portal switcher not implemented — no dedicated route exists */}
            <div className="block opacity-50 cursor-not-allowed">
              <Card className="border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">Switch Portal</div>
                    <div className="text-xs font-light text-gray-500">Not yet available</div>
                  </div>
                </div>
              </Card>
            </div>
            <Link to="/settings" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <Settings className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">System Settings</div>
                    <div className="text-xs font-light text-gray-500">Config & thresholds</div>
                  </div>
                </div>
              </Card>
            </Link>
            {/* TODO: Notifications now available via bell dropdown — this button can be removed or linked to a future /notifications page */}
            <div className="block opacity-50 cursor-not-allowed">
              <Card className="border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">Notifications</div>
                    <div className="text-xs font-light text-gray-500">Not yet available</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700">{getWeekLabel(selectedWeekOffset)}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedWeekOffset(prev => prev + 1)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                      title="Previous week"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSelectedWeekOffset(prev => Math.max(0, prev - 1))}
                      disabled={selectedWeekOffset === 0}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Next week"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <div className="space-y-4">
                <h3 className="text-sm font-light text-gray-500">Current Pricing</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-600" strokeWidth={1.5} />
                      <span className="text-xs font-light text-gray-600">Buying Price</span>
                    </div>
                    <span className="text-lg font-light text-red-600">{formatCurrency(stats.buyingPrice)}/L</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-600" strokeWidth={1.5} />
                      <span className="text-xs font-light text-gray-600">Selling Price</span>
                    </div>
                    <span className="text-lg font-light text-green-600">{formatCurrency(stats.sellingPrice)}/L</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                    <span className="text-xs font-light text-gray-600">Profit Margin</span>
                    <span className="text-lg font-light text-blue-600">{profitMargin}%</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
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
          </div>

          <Card>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-light text-gray-500">Tank Inventory</h3>
                <div className="text-xs font-light text-gray-400">
                  Total: {formatNumber(stats.totalInventory)}L / {formatNumber(tanks.reduce((sum, t) => sum + t.capacity_liters, 0))}L
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {tanks.map((tank) => (
                  <TankVisualization
                    key={tank.id}
                    tankName={tank.tank_name}
                    capacity={tank.capacity_liters}
                    currentLiters={tank.current_liters}
                    items={tank.items}
                    lowThreshold={settings.tank_low_level_threshold}
                    highThreshold={settings.tank_high_level_threshold}
                    criticalThreshold={settings.tank_critical_level_threshold}
                  />
                ))}
              </div>
            </div>
          </Card>

          {stats.pendingPRs > 0 && (
            <Card>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" strokeWidth={1.5} />
                <div>
                  <div className="text-sm font-light">
                    You have {stats.pendingPRs} purchase requisition{stats.pendingPRs > 1 ? 's' : ''} pending review
                  </div>
                  <Link to="/procurement" className="text-xs font-light text-blue-600 hover:text-blue-700">
                    View all requisitions →
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {profile?.role === 'super_admin' && (
            <>
              <div className="pt-6">
                <h2 className="text-xl font-light mb-6">Analytics</h2>
              </div>
              <Analytics />

              {/* Recent Activity Feed — TODO: add notifications query to loadDashboardData */}
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-sm font-light text-gray-500">Recent Activity</h3>
                </div>
                <div className="text-center py-8 text-sm font-light text-gray-400">
                  Activity feed not yet connected — add notifications query to loadDashboardData
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
