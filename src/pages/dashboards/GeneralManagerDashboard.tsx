import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OshaliLoader from '../../components/OshaliLoader';
import Card from '../../components/ui/Card';
import RevenueTrendChart from '../../components/RevenueTrendChart';
import HorizontalBarList from '../../components/charts/HorizontalBarList';
import Select from '../../components/ui/Select';
import { Package, Receipt, DollarSign, Users, TrendingUp, TrendingDown, Calendar, ClipboardList, ShoppingCart, Truck, Layers, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  monthSales: number;
  monthRevenue: number;
  activeClients: number;
  buyingPrice: number;
  sellingPrice: number;
}

interface Tank {
  id: string;
  tank_name: string;
  capacity_liters: number;
  current_liters: number;
  items: any[];
}

interface SystemSettings {
  tank_low_level_threshold: number;
  tank_high_level_threshold: number;
  tank_critical_level_threshold: number;
}

type DatePreset = 'today' | 'this_month';

export default function GeneralManagerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    monthSales: 0,
    monthRevenue: 0,
    activeClients: 0,
    buyingPrice: 0,
    sellingPrice: 0,
  });
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [topClients, setTopClients] = useState<{ label: string; value: number }[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    tank_low_level_threshold: 20,
    tank_high_level_threshold: 90,
    tank_critical_level_threshold: 10,
  });
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
        tanksResult,
        invoicesResult,
        clientsResult,
        latestPriceResult,
        latestPOResult,
        settingsResult,
        topClientsResult
      ] = await Promise.all([
        supabase.from('inventory_tanks').select('*').order('tank_name'),
        supabase
          .from('invoices')
          .select('liters_sold, total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50000),
        supabase.from('clients').select('id'),
        supabase.from('pricing_settings').select('price_per_liter').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('purchase_orders').select('price_per_liter').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('system_settings').select('tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold').maybeSingle(),
        supabase
          .from('invoices')
          .select('client_id, clients(name), total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .not('client_id', 'is', null)
          .limit(50000)
      ]);

      const totalInventory = tanksResult.data?.reduce((sum, tank) => sum + tank.current_liters, 0) || 0;
      const monthSales = invoicesResult.data?.reduce((sum, inv) => sum + inv.liters_sold, 0) || 0;
      const monthRevenue = invoicesResult.data?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;

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

      const clientRevenue = new Map<string, { name: string; total: number }>();
      topClientsResult.data?.forEach((invoice: any) => {
        if (invoice.clients?.name) {
          const existing = clientRevenue.get(invoice.client_id);
          if (existing) {
            existing.total += invoice.total_amount;
          } else {
            clientRevenue.set(invoice.client_id, {
              name: invoice.clients.name,
              total: invoice.total_amount
            });
          }
        }
      });

      const topClientsData = Array.from(clientRevenue.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(client => ({ label: client.name, value: client.total }));

      setStats({
        totalInventory,
        monthSales,
        monthRevenue,
        activeClients: clientsResult.data?.length || 0,
        buyingPrice: latestPOResult.data?.price_per_liter || 0,
        sellingPrice: latestPriceResult.data?.price_per_liter || 0,
      });

      setTanks(tanksResult.data || []);
      setTopClients(topClientsData);

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

  const periodLabel = datePreset === 'today' ? "Today's" : "This Month's";

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
      value: `${formatNumber(stats.monthSales)}L`,
      icon: <Receipt strokeWidth={1} />,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: `${periodLabel} Revenue`,
      value: formatCurrency(stats.monthRevenue),
      icon: <DollarSign strokeWidth={1} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Active Clients',
      value: stats.activeClients.toString(),
      icon: <Users strokeWidth={1} />,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
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

          {/* Zone 1 — Procurement Pipeline Tracker */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-light text-gray-500">Procurement Pipeline</h3>
              <Link to="/procurement" className="text-xs font-light text-blue-600 hover:text-blue-700">View all →</Link>
            </div>
            <div className="flex items-center gap-1">
              {[
                { label: 'Purchase Requisition', sub: 'Submitted / Under Review', icon: <ClipboardList className="w-4 h-4" strokeWidth={1.5} />, color: 'bg-amber-50 border-amber-200 text-amber-700', tab: 'pr' },
                { label: 'Purchase Order', sub: 'Sent to Supplier', icon: <ShoppingCart className="w-4 h-4" strokeWidth={1.5} />, color: 'bg-blue-50 border-blue-200 text-blue-700', tab: 'po' },
                { label: 'Goods Received', sub: 'Awaiting Allocation', icon: <Truck className="w-4 h-4" strokeWidth={1.5} />, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', tab: 'gr' },
                { label: 'Tank Allocated', sub: 'Inventory Updated', icon: <Layers className="w-4 h-4" strokeWidth={1.5} />, color: 'bg-purple-50 border-purple-200 text-purple-700', tab: 'gr' },
              ].map((stage, i, arr) => (
                <div key={stage.label} className="flex items-center flex-1 min-w-0">
                  <Link to={`/procurement?tab=${stage.tab}`} className={`flex-1 min-w-0 flex items-center gap-2 p-3 rounded-xl border ${stage.color} hover:opacity-80 transition-opacity`}>
                    {stage.icon}
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{stage.label}</div>
                      <div className="text-xs font-light opacity-70 truncate">{stage.sub}</div>
                    </div>
                  </Link>
                  {i < arr.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mx-0.5" strokeWidth={1.5} />
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-3">
            <Link to="/procurement?tab=pr" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-amber-400">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">New Purchase Requisition</div>
                    <div className="text-xs font-light text-gray-500">Start procurement</div>
                  </div>
                </div>
              </Card>
            </Link>
            <Link to="/pricing" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">Update Pricing</div>
                    <div className="text-xs font-light text-gray-500">Selling price settings</div>
                  </div>
                </div>
              </Card>
            </Link>
            <Link to="/sales?tab=invoices" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">New Invoice</div>
                    <div className="text-xs font-light text-gray-500">Create sales invoice</div>
                  </div>
                </div>
              </Card>
            </Link>
          </div>

          {/* Zone 2 — Stat Cards */}
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

          {/* Zone 3 — Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Top Clients by Revenue</h3>
                {topClients.length > 0 ? (
                  <HorizontalBarList data={topClients} />
                ) : (
                  <div className="text-center py-8 text-sm font-light text-gray-400">
                    No client data for this period
                  </div>
                )}
              </div>
            </Card>
            <RevenueTrendChart />
          </div>

          {/* Zone 4 — Pricing + Compact Tank Summary */}
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
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-light text-gray-500">Tank Inventory</h3>
                  <div className="text-xs font-light text-gray-400">
                    {formatNumber(stats.totalInventory)}L / {formatNumber(tanks.reduce((sum, t) => sum + t.capacity_liters, 0))}L total
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {tanks.map((tank) => {
                    const pct = tank.capacity_liters > 0 ? (tank.current_liters / tank.capacity_liters) * 100 : 0;
                    const isCritical = pct <= settings.tank_critical_level_threshold;
                    const isLow = pct <= settings.tank_low_level_threshold;
                    const barColor = isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-blue-500';
                    const labelColor = isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-700';
                    return (
                      <div key={tank.id} className="p-3 bg-gray-50 rounded-xl">
                        <div className="text-xs font-light text-gray-500 mb-1 truncate">{tank.tank_name}</div>
                        <div className={`text-lg font-light ${labelColor}`}>{Math.round(pct)}%</div>
                        <div className="text-xs font-light text-gray-400 mb-2">{formatNumber(tank.current_liters)}L</div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
