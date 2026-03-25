import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import TankVisualization from '../components/TankVisualization';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import type { Database } from '../lib/database.types';

type Tank = Database['public']['Tables']['inventory_tanks']['Row'];
type GR = Database['public']['Tables']['goods_received']['Row'] & { gr_number: string };
type InventoryItem = Database['public']['Tables']['inventory_items']['Row'];

interface TankWithItems extends Tank {
  items: (InventoryItem & { gr_number: string })[];
}

interface SystemSettings {
  tank_low_level_threshold: number;
  tank_high_level_threshold: number;
  tank_critical_level_threshold: number;
}

export default function Inventory() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'A' | 'B' | 'C' | 'D'>('dashboard');
  const [tanks, setTanks] = useState<TankWithItems[]>([]);
  const [availableGRs, setAvailableGRs] = useState<GR[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    tank_low_level_threshold: 20,
    tank_high_level_threshold: 90,
    tank_critical_level_threshold: 10,
  });
  const [loading, setLoading] = useState(true);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedGR, setSelectedGR] = useState<string>('');
  const [selectedTank, setSelectedTank] = useState<string>('');

  useEffect(() => {
    loadInventory();
    loadAvailableGRs();
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold')
        .maybeSingle();

      if (data) {
        setSettings({
          tank_low_level_threshold: data.tank_low_level_threshold,
          tank_high_level_threshold: data.tank_high_level_threshold,
          tank_critical_level_threshold: data.tank_critical_level_threshold,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function loadInventory() {
    try {
      const { data: tanksData } = await supabase
        .from('inventory_tanks')
        .select('*')
        .order('tank_name');

      if (tanksData) {
        const tanksWithItems = await Promise.all(
          tanksData.map(async (tank) => {
            const { data: items } = await supabase
              .from('inventory_items')
              .select(`
                *,
                goods_received:gr_id (gr_number)
              `)
              .eq('tank_id', tank.id)
              .gt('remaining_liters', 0)
              .order('entry_date');

            const mappedItems = (items || []).map((item: any) => ({
              ...item,
              gr_number: item.goods_received?.gr_number || 'Unknown',
            }));

            const calculatedCurrentLiters = mappedItems.reduce(
              (sum, item) => sum + item.remaining_liters,
              0
            );

            return {
              ...tank,
              current_liters: calculatedCurrentLiters,
              items: mappedItems,
            };
          })
        );

        setTanks(tanksWithItems);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableGRs() {
    try {
      const { data } = await supabase
        .from('goods_received')
        .select('*')
        .eq('status', 'received')
        .order('created_at', { ascending: false });

      setAvailableGRs(data || []);
    } catch (error) {
      console.error('Error loading GRs:', error);
    }
  }

  async function handleAllocateToTank() {
    if (!selectedGR || !selectedTank || !profile) return;

    const gr = availableGRs.find((g) => g.id === selectedGR);
    const tank = tanks.find((t) => t.id === selectedTank);

    if (!gr || !tank) return;

    if (tank.current_liters + gr.liters_received > tank.capacity_liters) {
      alert('Tank does not have enough capacity');
      return;
    }

    const inventoryItem = {
      gr_id: gr.id,
      tank_id: tank.id,
      initial_liters: gr.liters_received,
      remaining_liters: gr.liters_received,
      cost_per_liter: gr.cost_per_liter,
    };

    const [itemResult, grUpdate] = await Promise.all([
      supabase.from('inventory_items').insert([inventoryItem]),
      supabase
        .from('goods_received')
        .update({ status: 'allocated_to_inventory' })
        .eq('id', gr.id),
    ]);

    if (!itemResult.error && !grUpdate.error) {
      const { data: updatedItems } = await supabase
        .from('inventory_items')
        .select('remaining_liters')
        .eq('tank_id', tank.id)
        .gt('remaining_liters', 0);

      const newTankLiters = (updatedItems || []).reduce(
        (sum, item) => sum + item.remaining_liters,
        0
      );

      await supabase
        .from('inventory_tanks')
        .update({ current_liters: newTankLiters })
        .eq('id', tank.id);

      setShowAllocateModal(false);
      setSelectedGR('');
      setSelectedTank('');
      loadInventory();
      loadAvailableGRs();
    }
  }

  const canAllocate =
    profile?.role === 'operations_supervisor' ||
    profile?.role === 'general_manager' ||
    profile?.role === 'super_admin';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light">Inventory Management</h1>
        {canAllocate && availableGRs.length > 0 && (
          <Button onClick={() => setShowAllocateModal(true)}>
            <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
            Allocate to Tank
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-100">
        {(['dashboard', 'A', 'B', 'C', 'D'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-light border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-black text-black'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab === 'dashboard' ? 'Dashboard' : `Tank ${tab}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tanks.map((tank) => (
                <Card key={tank.id}>
                  <TankVisualization
                    tankName={tank.tank_name}
                    capacity={tank.capacity_liters}
                    currentLiters={tank.current_liters}
                    items={tank.items.map((item) => ({
                      id: item.id,
                      gr_number: item.gr_number,
                      remaining_liters: item.remaining_liters,
                      cost_per_liter: item.cost_per_liter,
                      color: '',
                    }))}
                    lowThreshold={settings.tank_low_level_threshold}
                    highThreshold={settings.tank_high_level_threshold}
                    criticalThreshold={settings.tank_critical_level_threshold}
                  />
                </Card>
              ))}
            </div>
          )}

          {activeTab !== 'dashboard' && (
            <div className="space-y-4">
              {tanks
                .filter((tank) => tank.tank_name === activeTab)
                .map((tank) => (
                  <div key={tank.id}>
                    <Card className="mb-6">
                      <TankVisualization
                        tankName={tank.tank_name}
                        capacity={tank.capacity_liters}
                        currentLiters={tank.current_liters}
                        items={tank.items.map((item) => ({
                          id: item.id,
                          gr_number: item.gr_number,
                          remaining_liters: item.remaining_liters,
                          cost_per_liter: item.cost_per_liter,
                          color: '',
                        }))}
                        lowThreshold={settings.tank_low_level_threshold}
                        highThreshold={settings.tank_high_level_threshold}
                        criticalThreshold={settings.tank_critical_level_threshold}
                      />
                    </Card>

                    <div className="space-y-3">
                      <h3 className="text-lg font-light">Inventory Items</h3>
                      {tank.items.map((item) => (
                        <Card key={item.id}>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-light">
                            <div>
                              <div className="text-gray-500 text-xs mb-1">GR Number</div>
                              <div>{item.gr_number}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs mb-1">Remaining</div>
                              <div>{item.remaining_liters.toLocaleString()}L</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs mb-1">Initial</div>
                              <div>{item.initial_liters.toLocaleString()}L</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs mb-1">Cost/L</div>
                              <div>{formatCurrency(item.cost_per_liter)}</div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={showAllocateModal}
        onClose={() => setShowAllocateModal(false)}
        title="Allocate GR to Tank"
      >
        <div className="space-y-4">
          <Select
            label="Select GR"
            value={selectedGR}
            onChange={(e) => setSelectedGR(e.target.value)}
          >
            <option value="">Choose a GR...</option>
            {availableGRs.map((gr) => (
              <option key={gr.id} value={gr.id}>
                {gr.gr_number} - {gr.liters_received.toLocaleString()}L @ {formatCurrency(gr.cost_per_liter)}/L
              </option>
            ))}
          </Select>

          <Select
            label="Select Tank"
            value={selectedTank}
            onChange={(e) => setSelectedTank(e.target.value)}
          >
            <option value="">Choose a tank...</option>
            {tanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                Tank {tank.tank_name} ({tank.current_liters.toLocaleString()}L / {tank.capacity_liters.toLocaleString()}L)
              </option>
            ))}
          </Select>

          <div className="flex gap-2">
            <Button onClick={handleAllocateToTank} className="flex-1" disabled={!selectedGR || !selectedTank}>
              Allocate
            </Button>
            <Button variant="secondary" onClick={() => setShowAllocateModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
