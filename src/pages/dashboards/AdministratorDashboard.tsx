import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/ui/Card';
import TankVisualization from '../../components/TankVisualization';
import HorizontalBarList from '../../components/charts/HorizontalBarList';
import Select from '../../components/ui/Select';
import DeliveryNotesAndInvoices from '../../components/DeliveryNotesAndInvoices';
import { Package, Receipt, FileText, TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  monthSales: number;
  pendingPRs: number;
  monthRevenue: number;
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

type DatePreset = 'today' | 'this_month';

export default function AdministratorDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    monthSales: 0,
    pendingPRs: 0,
    monthRevenue: 0,
  });
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [recentPOs, setRecentPOs] = useState<RecentPO[]>([]);
  const [recentSales, setRecentSales] = useState<{ label: string; value: number }[]>([]);
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
        prsResult,
        posResult,
        settingsResult,
        topProductsResult
      ] = await Promise.all([
        supabase.from('inventory_tanks').select('*').order('tank_name'),
        supabase
          .from('invoices')
          .select('liters_sold, total_amount')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50000),
        supabase.from('purchase_requisitions').select('id').in('status', ['submitted', 'under_review']),
        supabase
          .from('purchase_orders')
          .select('id, po_number, total_amount, status, supplier_name, created_at, liters_ordered')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('system_settings').select('tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold').maybeSingle(),
        supabase
          .from('inventory_tanks')
          .select('tank_name, current_liters')
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

      const tankData = topProductsResult.data?.map(tank => ({
        label: tank.tank_name,
        value: tank.current_liters
      })).sort((a, b) => b.value - a.value) || [];

      setStats({
        totalInventory,
        monthSales,
        pendingPRs: prsResult.data?.length || 0,
        monthRevenue,
      });

      setTanks(tanksResult.data || []);
      setRecentPOs(posResult.data || []);
      setRecentSales(tankData);

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
      icon: <TrendingUp strokeWidth={1} />,
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
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Current Tank Levels</h3>
                {recentSales.length > 0 ? (
                  <HorizontalBarList data={recentSales} />
                ) : (
                  <div className="text-center py-8 text-sm font-light text-gray-400">
                    No tank data available
                  </div>
                )}
              </div>
            </Card>

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

          <Card>
            <div className="space-y-6">
              <h3 className="text-sm font-light text-gray-500">Delivery Notes & Invoices</h3>
              <DeliveryNotesAndInvoices />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
