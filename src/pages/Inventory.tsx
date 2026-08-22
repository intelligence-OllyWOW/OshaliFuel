import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import OshaliLoader from '../components/OshaliLoader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import TankVisualization from '../components/TankVisualization';
import { Plus, RotateCcw, Droplets, ArrowRightLeft } from 'lucide-react';
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
  const { isTestingMode } = useTestingMode();
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

  // Tank operations state
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [showSiphonModal, setShowSiphonModal] = useState(false);
  const [operationTankId, setOperationTankId] = useState<string>('');
  const [resetValue, setResetValue] = useState<string>('');
  const [siphonFromTankId, setSiphonFromTankId] = useState<string>('');
  const [siphonToTankId, setSiphonToTankId] = useState<string>('');
  const [siphonLiters, setSiphonLiters] = useState<string>('');
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationFeedback, setOperationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadInventory();
    loadAvailableGRs();
    loadSettings();
  }, [isTestingMode]);

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
        .eq('is_test_data', isTestingMode)
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

  async function handleResetTank() {
    if (!operationTankId || !resetValue) return;
    setOperationLoading(true);
    setOperationFeedback(null);

    const newLiters = parseFloat(resetValue);
    const tank = tanks.find((t) => t.id === operationTankId);
    if (!tank || isNaN(newLiters) || newLiters < 0) {
      setOperationFeedback({ type: 'error', message: 'Invalid value provided.' });
      setOperationLoading(false);
      return;
    }
    if (newLiters > tank.capacity_liters) {
      setOperationFeedback({ type: 'error', message: `Cannot exceed tank capacity of ${tank.capacity_liters.toLocaleString()}L.` });
      setOperationLoading(false);
      return;
    }

    // Zero out all existing inventory items in this tank
    const { error: zeroError } = await supabase
      .from('inventory_items')
      .update({ remaining_liters: 0 })
      .eq('tank_id', operationTankId)
      .gt('remaining_liters', 0);

    if (zeroError) {
      setOperationFeedback({ type: 'error', message: 'Failed to clear inventory items.' });
      setOperationLoading(false);
      return;
    }

    if (newLiters > 0) {
      // Create a manual adjustment inventory item
      const { error: insertError } = await supabase
        .from('inventory_items')
        .insert({
          tank_id: operationTankId,
          gr_id: tank.items[0]?.gr_id || null,
          initial_liters: newLiters,
          remaining_liters: newLiters,
          cost_per_liter: tank.items.length > 0
            ? tank.items.reduce((sum, i) => sum + i.cost_per_liter, 0) / tank.items.length
            : 0,
        });

      if (insertError) {
        setOperationFeedback({ type: 'error', message: 'Failed to create reset entry.' });
        setOperationLoading(false);
        return;
      }
    }

    await supabase
      .from('inventory_tanks')
      .update({ current_liters: newLiters })
      .eq('id', operationTankId);

    setOperationFeedback({ type: 'success', message: `Tank reset to ${newLiters.toLocaleString()}L successfully.` });
    setOperationLoading(false);
    setShowResetModal(false);
    setResetValue('');
    setOperationTankId('');
    loadInventory();
  }

  async function handleEmptyTank() {
    if (!operationTankId) return;
    setOperationLoading(true);
    setOperationFeedback(null);

    const tank = tanks.find((t) => t.id === operationTankId);
    if (!tank) {
      setOperationFeedback({ type: 'error', message: 'Tank not found.' });
      setOperationLoading(false);
      return;
    }

    const { error: zeroError } = await supabase
      .from('inventory_items')
      .update({ remaining_liters: 0 })
      .eq('tank_id', operationTankId)
      .gt('remaining_liters', 0);

    if (zeroError) {
      setOperationFeedback({ type: 'error', message: 'Failed to empty tank.' });
      setOperationLoading(false);
      return;
    }

    await supabase
      .from('inventory_tanks')
      .update({ current_liters: 0 })
      .eq('id', operationTankId);

    setOperationFeedback({ type: 'success', message: `Tank ${tank.tank_name} emptied successfully.` });
    setOperationLoading(false);
    setShowEmptyModal(false);
    setOperationTankId('');
    loadInventory();
  }

  async function handleSiphon() {
    if (!siphonFromTankId || !siphonToTankId || !siphonLiters) return;
    setOperationLoading(true);
    setOperationFeedback(null);

    const liters = parseFloat(siphonLiters);
    const fromTank = tanks.find((t) => t.id === siphonFromTankId);
    const toTank = tanks.find((t) => t.id === siphonToTankId);

    if (!fromTank || !toTank || isNaN(liters) || liters <= 0) {
      setOperationFeedback({ type: 'error', message: 'Invalid transfer details.' });
      setOperationLoading(false);
      return;
    }

    if (siphonFromTankId === siphonToTankId) {
      setOperationFeedback({ type: 'error', message: 'Cannot transfer to the same tank.' });
      setOperationLoading(false);
      return;
    }

    if (liters > fromTank.current_liters) {
      setOperationFeedback({ type: 'error', message: `Source tank only has ${fromTank.current_liters.toLocaleString()}L available.` });
      setOperationLoading(false);
      return;
    }

    if (toTank.current_liters + liters > toTank.capacity_liters) {
      setOperationFeedback({ type: 'error', message: `Destination tank would exceed capacity (${toTank.capacity_liters.toLocaleString()}L max).` });
      setOperationLoading(false);
      return;
    }

    // Deduct from source tank items (FIFO)
    let remainingToDeduct = liters;
    let avgCostPerLiter = 0;
    let totalCost = 0;

    for (const item of fromTank.items) {
      if (remainingToDeduct <= 0) break;
      const deductFromThis = Math.min(item.remaining_liters, remainingToDeduct);
      totalCost += deductFromThis * item.cost_per_liter;
      const newRemaining = Math.round((item.remaining_liters - deductFromThis) * 100) / 100;

      const { error } = await supabase
        .from('inventory_items')
        .update({ remaining_liters: newRemaining })
        .eq('id', item.id);

      if (error) {
        setOperationFeedback({ type: 'error', message: 'Failed to deduct from source tank.' });
        setOperationLoading(false);
        return;
      }

      remainingToDeduct = Math.round((remainingToDeduct - deductFromThis) * 100) / 100;
    }

    avgCostPerLiter = liters > 0 ? totalCost / liters : 0;

    // Add to destination tank as a new inventory item
    const grId = fromTank.items[0]?.gr_id || null;
    const { error: insertError } = await supabase
      .from('inventory_items')
      .insert({
        tank_id: siphonToTankId,
        gr_id: grId,
        initial_liters: liters,
        remaining_liters: liters,
        cost_per_liter: Math.round(avgCostPerLiter * 100) / 100,
      });

    if (insertError) {
      setOperationFeedback({ type: 'error', message: 'Failed to add fuel to destination tank.' });
      setOperationLoading(false);
      return;
    }

    // Update both tank current_liters
    await Promise.all([
      supabase
        .from('inventory_tanks')
        .update({ current_liters: Math.round((fromTank.current_liters - liters) * 100) / 100 })
        .eq('id', siphonFromTankId),
      supabase
        .from('inventory_tanks')
        .update({ current_liters: Math.round((toTank.current_liters + liters) * 100) / 100 })
        .eq('id', siphonToTankId),
    ]);

    setOperationFeedback({ type: 'success', message: `Successfully transferred ${liters.toLocaleString()}L from Tank ${fromTank.tank_name} to Tank ${toTank.tank_name}.` });
    setOperationLoading(false);
    setShowSiphonModal(false);
    setSiphonFromTankId('');
    setSiphonToTankId('');
    setSiphonLiters('');
    loadInventory();
  }

  const canAllocate =
    profile?.role === 'operations_supervisor' ||
    profile?.role === 'general_manager' ||
    profile?.role === 'super_admin';

  const isSuperAdmin = profile?.role === 'super_admin';

  function openResetModal(tankId?: string) {
    setOperationTankId(tankId || '');
    setResetValue('');
    setOperationFeedback(null);
    setShowResetModal(true);
  }

  function openEmptyModal(tankId?: string) {
    setOperationTankId(tankId || '');
    setOperationFeedback(null);
    setShowEmptyModal(true);
  }

  function openSiphonModal(fromTankId?: string) {
    setSiphonFromTankId(fromTankId || '');
    setSiphonToTankId('');
    setSiphonLiters('');
    setOperationFeedback(null);
    setShowSiphonModal(true);
  }

  function TankOperationButtons({ tankId }: { tankId?: string }) {
    if (!isSuperAdmin) return null;
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => openResetModal(tankId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
          Reset
        </button>
        <button
          onClick={() => openEmptyModal(tankId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
        >
          <Droplets className="w-3.5 h-3.5" strokeWidth={1.5} />
          Empty
        </button>
        <button
          onClick={() => openSiphonModal(tankId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Siphon
        </button>
      </div>
    );
  }

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

      {operationFeedback && (
        <div className={`mb-4 p-4 rounded-xl border text-sm font-light ${
          operationFeedback.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {operationFeedback.message}
        </div>
      )}

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
        <OshaliLoader variant="inline" />
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <>
              {isSuperAdmin && (
                <Card className="mb-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Tank Operations</h3>
                      <p className="text-xs font-light text-gray-500 mt-0.5">Reset, empty, or transfer fuel between tanks</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openResetModal()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                        Reset Tank
                      </button>
                      <button
                        onClick={() => openEmptyModal()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                      >
                        <Droplets className="w-4 h-4" strokeWidth={1.5} />
                        Empty Tank
                      </button>
                      <button
                        onClick={() => openSiphonModal()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        <ArrowRightLeft className="w-4 h-4" strokeWidth={1.5} />
                        Siphon Between Tanks
                      </button>
                    </div>
                  </div>
                </Card>
              )}

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
            </>
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
                      {isSuperAdmin && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <TankOperationButtons tankId={tank.id} />
                        </div>
                      )}
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

      {/* Allocate GR to Tank Modal */}
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

      {/* Reset Tank Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset Tank Level"
      >
        <div className="space-y-4">
          <p className="text-sm font-light text-gray-600">
            Set a tank's fuel level to a specific value. This will clear all existing inventory items and create a single entry at the new level.
          </p>

          <Select
            label="Select Tank"
            value={operationTankId}
            onChange={(e) => setOperationTankId(e.target.value)}
          >
            <option value="">Choose a tank...</option>
            {tanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                Tank {tank.tank_name} (Currently: {tank.current_liters.toLocaleString()}L / {tank.capacity_liters.toLocaleString()}L)
              </option>
            ))}
          </Select>

          <Input
            label="New Level (Liters)"
            type="number"
            min="0"
            step="0.01"
            value={resetValue}
            onChange={(e) => setResetValue(e.target.value)}
            placeholder="Enter new fuel level in liters"
          />

          {operationTankId && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs font-light text-amber-800">
              Tank capacity: {tanks.find(t => t.id === operationTankId)?.capacity_liters.toLocaleString()}L
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleResetTank}
              className="flex-1"
              disabled={!operationTankId || !resetValue || operationLoading}
            >
              {operationLoading ? 'Resetting...' : 'Reset Tank'}
            </Button>
            <Button variant="secondary" onClick={() => setShowResetModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Empty Tank Modal */}
      <Modal
        isOpen={showEmptyModal}
        onClose={() => setShowEmptyModal(false)}
        title="Empty Tank"
      >
        <div className="space-y-4">
          <p className="text-sm font-light text-gray-600">
            This will set the selected tank to 0 liters and clear all inventory items. This action cannot be undone.
          </p>

          <Select
            label="Select Tank"
            value={operationTankId}
            onChange={(e) => setOperationTankId(e.target.value)}
          >
            <option value="">Choose a tank...</option>
            {tanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                Tank {tank.tank_name} (Currently: {tank.current_liters.toLocaleString()}L)
              </option>
            ))}
          </Select>

          {operationTankId && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs font-light text-red-800">
              Warning: This will remove {tanks.find(t => t.id === operationTankId)?.current_liters.toLocaleString()}L from the tank.
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={handleEmptyTank}
              className="flex-1"
              disabled={!operationTankId || operationLoading}
            >
              {operationLoading ? 'Emptying...' : 'Confirm Empty'}
            </Button>
            <Button variant="secondary" onClick={() => setShowEmptyModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Siphon Modal */}
      <Modal
        isOpen={showSiphonModal}
        onClose={() => setShowSiphonModal(false)}
        title="Siphon Between Tanks"
      >
        <div className="space-y-4">
          <p className="text-sm font-light text-gray-600">
            Transfer fuel from one tank to another. The cost per liter is calculated using the weighted average from the source tank.
          </p>

          <Select
            label="From Tank"
            value={siphonFromTankId}
            onChange={(e) => setSiphonFromTankId(e.target.value)}
          >
            <option value="">Choose source tank...</option>
            {tanks.map((tank) => (
              <option key={tank.id} value={tank.id}>
                Tank {tank.tank_name} ({tank.current_liters.toLocaleString()}L available)
              </option>
            ))}
          </Select>

          <Select
            label="To Tank"
            value={siphonToTankId}
            onChange={(e) => setSiphonToTankId(e.target.value)}
          >
            <option value="">Choose destination tank...</option>
            {tanks
              .filter((t) => t.id !== siphonFromTankId)
              .map((tank) => (
                <option key={tank.id} value={tank.id}>
                  Tank {tank.tank_name} ({tank.current_liters.toLocaleString()}L / {tank.capacity_liters.toLocaleString()}L)
                </option>
              ))}
          </Select>

          <Input
            label="Liters to Transfer"
            type="number"
            min="0"
            step="0.01"
            value={siphonLiters}
            onChange={(e) => setSiphonLiters(e.target.value)}
            placeholder="Enter amount to transfer"
          />

          {siphonFromTankId && siphonToTankId && siphonLiters && (
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs font-light text-blue-800">
              <div>From: Tank {tanks.find(t => t.id === siphonFromTankId)?.tank_name} ({tanks.find(t => t.id === siphonFromTankId)?.current_liters.toLocaleString()}L)</div>
              <div>To: Tank {tanks.find(t => t.id === siphonToTankId)?.tank_name} ({tanks.find(t => t.id === siphonToTankId)?.current_liters.toLocaleString()}L)</div>
              <div className="mt-1 font-medium">Transfer: {parseFloat(siphonLiters || '0').toLocaleString()}L</div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSiphon}
              className="flex-1"
              disabled={!siphonFromTankId || !siphonToTankId || !siphonLiters || operationLoading}
            >
              {operationLoading ? 'Transferring...' : 'Transfer Fuel'}
            </Button>
            <Button variant="secondary" onClick={() => setShowSiphonModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
