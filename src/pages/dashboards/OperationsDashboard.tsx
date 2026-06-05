import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OshaliLoader from '../../components/OshaliLoader';
import Card from '../../components/ui/Card';
import TankVisualization from '../../components/TankVisualization';
import HorizontalBarList from '../../components/charts/HorizontalBarList';
import Select from '../../components/ui/Select';
import { Receipt, AlertCircle, FileText, Calendar, ClipboardList, Truck, Plus, Droplets, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatNumber } from '../../lib/utils';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  lowLevelTanks: number;
  pendingPRs: number;
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

interface DeliveryNote {
  id: string;
  note_number: string;
  customer_name: string;
  litres_dispensed: number;
  created_at: string;
  attendant_name: string;
}

type DatePreset = 'today' | 'this_month';

export default function OperationsDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    todaySales: 0,
    lowLevelTanks: 0,
    pendingPRs: 0,
  });
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [dailySales, setDailySales] = useState<{ label: string; value: number }[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<DeliveryNote[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    tank_low_level_threshold: 20,
    tank_high_level_threshold: 90,
    tank_critical_level_threshold: 10,
  });
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');

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
      const startDate = format(start, 'yyyy-MM-dd');
      const endDate = format(end, 'yyyy-MM-dd');

      const [
        tanksResult,
        invoicesResult,
        prsResult,
        settingsResult,
        weekSalesResult,
        deliveryNotesResult
      ] = await Promise.all([
        supabase.from('inventory_tanks').select('*').order('tank_name'),
        supabase
          .from('invoices')
          .select('liters_sold')
          .gte('invoice_date', startDate)
          .lte('invoice_date', endDate)
          .limit(50000),
        supabase.from('purchase_requisitions').select('id').in('status', ['submitted', 'under_review']),
        supabase.from('system_settings').select('tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold').maybeSingle(),
        supabase
          .from('invoices')
          .select('invoice_date, liters_sold')
          .gte('invoice_date', format(subDays(now, 6), 'yyyy-MM-dd'))
          .lte('invoice_date', format(now, 'yyyy-MM-dd'))
          .neq('status', 'void')
          .order('invoice_date', { ascending: true })
          .limit(50000),
        supabase
          .from('delivery_notes')
          .select('id, note_number, customer_name, litres_dispensed, created_at, attendant_name')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      const totalInventory = tanksResult.data?.reduce((sum, tank) => sum + tank.current_liters, 0) || 0;
      const todaySales = invoicesResult.data?.reduce((sum, inv) => sum + inv.liters_sold, 0) || 0;

      const lowThreshold = settingsResult.data?.tank_low_level_threshold || 20;
      const lowLevelTanks = tanksResult.data?.filter(tank =>
        (tank.current_liters / tank.capacity_liters * 100) <= lowThreshold
      ).length || 0;

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

      const dailySalesMap: { [key: string]: number } = {};
      for (let i = 0; i < 7; i++) {
        const date = subDays(now, 6 - i);
        const dateKey = format(date, 'MMM dd');
        dailySalesMap[dateKey] = 0;
      }

      weekSalesResult.data?.forEach((invoice) => {
        const dateKey = format(new Date(invoice.invoice_date + 'T00:00:00'), 'MMM dd');
        if (dailySalesMap.hasOwnProperty(dateKey)) {
          dailySalesMap[dateKey] += invoice.liters_sold;
        }
      });

      const dailySalesData = Object.entries(dailySalesMap).map(([label, value]) => ({ label, value }));

      setStats({
        totalInventory,
        todaySales,
        lowLevelTanks,
        pendingPRs: prsResult.data?.length || 0,
      });

      setTanks(tanksResult.data || []);
      setDailySales(dailySalesData);
      setRecentDeliveries(deliveryNotesResult.data || []);

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
      icon: <Droplets strokeWidth={1} />,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: `${periodLabel} Sales`,
      value: `${formatNumber(stats.todaySales)}L`,
      icon: <TrendingUp strokeWidth={1} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Low Level Tanks',
      value: stats.lowLevelTanks.toString(),
      icon: <AlertCircle strokeWidth={1} />,
      color: stats.lowLevelTanks > 0 ? 'text-red-600' : 'text-gray-400',
      bg: stats.lowLevelTanks > 0 ? 'bg-red-50' : 'bg-gray-50',
    },
    {
      label: 'Pending Requisitions',
      value: stats.pendingPRs.toString(),
      icon: <ClipboardList strokeWidth={1} />,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light mb-2">Operations Dashboard</h1>
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

          {/* Zone 0 — Stat Cards */}
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

          {/* Zone 1 — Primary Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Link to="/procurement" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-amber-400">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">New PR</div>
                    <div className="text-xs font-light text-gray-500">Purchase Requisition</div>
                  </div>
                </div>
              </Card>
            </Link>
            <Link to="/procurement?tab=gr" className="block">
              <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 border-sidebar-bg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sidebar-bg flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">Allocate GR</div>
                    <div className="text-xs font-light text-gray-500">Goods Received → Tank</div>
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
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">Create Invoice</div>
                    <div className="text-xs font-light text-gray-500">New sales invoice</div>
                  </div>
                </div>
              </Card>
            </Link>
          </div>

          {/* Low-level alert */}
          {stats.lowLevelTanks > 0 && (
            <Card>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" strokeWidth={1.5} />
                <div className="text-sm font-light">
                  {stats.lowLevelTanks} tank{stats.lowLevelTanks > 1 ? 's are' : ' is'} running low on fuel —{' '}
                  <Link to="/procurement" className="text-blue-600 hover:text-blue-700">Create purchase requisition →</Link>
                </div>
              </div>
            </Card>
          )}

          {/* Zone 2 — Compact Tank Status Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tanks.map((tank) => {
              const pct = tank.capacity_liters > 0 ? (tank.current_liters / tank.capacity_liters) * 100 : 0;
              const isCritical = pct <= settings.tank_critical_level_threshold;
              const isLow = pct <= settings.tank_low_level_threshold;
              const barColor = isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-blue-500';
              const labelColor = isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-700';
              return (
                <Card key={tank.id}>
                  <div className="text-xs font-light text-gray-500 mb-1 truncate">{tank.tank_name}</div>
                  <div className={`text-lg font-light ${labelColor}`}>{Math.round(pct)}%</div>
                  <div className="text-xs font-light text-gray-400 mb-2">{formatNumber(tank.current_liters)}L</div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Zone 3 — Pending PRs + Recent Delivery Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-purple-600" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-sm font-light text-gray-700">Pending Requisitions</div>
                  <div className="text-2xl font-light">{stats.pendingPRs}</div>
                </div>
              </div>
              <Link to="/procurement" className="text-xs font-light text-blue-600 hover:text-blue-700">
                View all purchase requisitions →
              </Link>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-light text-gray-500">Recent Delivery Notes</h3>
                <Link to="/sales" className="flex items-center gap-1 text-xs font-light text-blue-600 hover:text-blue-700">
                  <Plus className="w-3 h-3" strokeWidth={2} /> New
                </Link>
              </div>
              {recentDeliveries.length === 0 ? (
                <div className="text-center py-8 text-sm font-light text-gray-400">No delivery notes yet</div>
              ) : (
                <div className="space-y-2">
                  {recentDeliveries.map((note) => (
                    <div key={note.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-light truncate">{note.customer_name}</div>
                        <div className="text-xs font-light text-gray-500">{note.attendant_name}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="text-sm font-light text-blue-600">{note.litres_dispensed}L</div>
                        <Link to="/sales" className="text-xs font-light text-amber-600 hover:text-amber-700">
                          Invoice →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Zone 4 — Daily Sales Chart */}
          <Card>
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Daily Sales (Last 7 Days)</h3>
              {dailySales.length > 0 ? (
                <HorizontalBarList data={dailySales} />
              ) : (
                <div className="text-center py-8 text-sm font-light text-gray-400">No sales data for this period</div>
              )}
            </div>
          </Card>

          {/* Full Tank Visualization — detail view below the fold */}
          <Card>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-light text-gray-500">Tank Inventory Detail</h3>
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

        </div>
      )}
    </div>
  );
}
