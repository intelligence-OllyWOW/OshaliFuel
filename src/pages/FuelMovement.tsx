import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { Fuel, Gauge, GitCompare, BarChart3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import OshaliLoader from '../components/OshaliLoader';

type Tab = 'dipping' | 'meters' | 'reconciliation' | 'variance';

interface Tank {
  id: string;
  tank_name: string;
  capacity_liters: number;
  current_liters: number;
}

function VarianceBadge({ classification }: { classification: string }) {
  const colors: Record<string, string> = {
    NORMAL: 'bg-emerald-100 text-emerald-700',
    INVESTIGATE: 'bg-amber-100 text-amber-700',
    CRITICAL: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[classification] || 'bg-gray-100 text-gray-600'}`}>
      {classification}
    </span>
  );
}

function toNumericString(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '0.00';
  return n.toFixed(2);
}

export default function FuelMovement() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [activeTab, setActiveTab] = useState<Tab>('dipping');
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTanks();
  }, []);

  async function loadTanks() {
    const { data } = await supabase.from('inventory_tanks').select('*').order('tank_name');
    if (data) setTanks(data);
    setLoading(false);
  }

  if (loading) return <OshaliLoader variant="section" message="Loading fuel movement..." />;

  const tabs = [
    { id: 'dipping' as Tab, label: 'Tank Dipping', icon: Fuel },
    { id: 'meters' as Tab, label: 'Meter Readings', icon: Gauge },
    { id: 'reconciliation' as Tab, label: 'Reconciliation', icon: GitCompare },
    { id: 'variance' as Tab, label: 'Inventory Variance', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">Fuel Movement</h1>
      </div>

      <div className="flex space-x-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-light transition-colors flex-1 justify-center ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'dipping' && <TankDippingTab tanks={tanks} profile={profile} isTestingMode={isTestingMode} />}
      {activeTab === 'meters' && <MeterReadingsTab profile={profile} isTestingMode={isTestingMode} />}
      {activeTab === 'reconciliation' && <ReconciliationTab tanks={tanks} profile={profile} isTestingMode={isTestingMode} />}
      {activeTab === 'variance' && <InventoryVarianceTab tanks={tanks} profile={profile} isTestingMode={isTestingMode} />}
    </div>
  );
}

function TankDippingTab({ tanks, profile, isTestingMode }: { tanks: Tank[]; profile: any; isTestingMode: boolean }) {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    tank_id: '',
    physical_quantity: '',
    shift: '1',
    dipping_type: 'opening',
  });

  useEffect(() => { loadRecords(); }, [isTestingMode]);

  async function loadRecords() {
    const { data } = await supabase
      .from('tank_dippings')
      .select('*, tank:tank_id(tank_name)')
      .eq('is_test_data', isTestingMode)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setRecords(data);
  }

  async function handleSubmit() {
    if (!form.tank_id || !form.physical_quantity) return;
    setSaving(true);
    const { error } = await supabase.from('tank_dippings').insert({
      date: form.date,
      time: form.time,
      tank_id: form.tank_id,
      physical_quantity: toNumericString(form.physical_quantity),
      shift: parseInt(form.shift),
      dipping_type: form.dipping_type,
      user_id: profile.id,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      setForm({ ...form, physical_quantity: '', tank_id: '' });
      loadRecords();
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('tank_dippings').delete().eq('id', id);
    setDeleteConfirm(null);
    loadRecords();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-light">Tank Dipping Records</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> Record Dipping
        </Button>
      </div>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to permanently delete this dipping record? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Record Tank Dipping" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <Select label="Tank" value={form.tank_id} onChange={(e) => setForm({ ...form, tank_id: e.target.value })}>
            <option value="">Select tank</option>
            {tanks.map((t) => <option key={t.id} value={t.id}>Tank {t.tank_name}</option>)}
          </Select>
          <Input label="Physical Quantity (Liters)" type="number" step="0.01" min="0" value={form.physical_quantity}
            onChange={(e) => setForm({ ...form, physical_quantity: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              <option value="1">Shift 1 - Day</option>
              <option value="2">Shift 2 - Night</option>
            </Select>
            <Select label="Dipping Type" value={form.dipping_type} onChange={(e) => setForm({ ...form, dipping_type: e.target.value })}>
              <option value="opening">Opening</option>
              <option value="closing">Closing</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.tank_id || !form.physical_quantity}>
              {saving ? 'Saving...' : 'Save Record'}
            </Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Time</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Tank</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Quantity (L)</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Shift</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Type</th>
                {isSuperAdmin && <th className="text-left py-3 px-3 font-medium text-gray-500"></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-3">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                  <td className="py-3 px-3">{r.time?.substring(0, 5)}</td>
                  <td className="py-3 px-3">Tank {r.tank?.tank_name}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.physical_quantity).toFixed(2)}</td>
                  <td className="py-3 px-3">{r.shift === 1 ? 'Day' : 'Night'}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${r.dipping_type === 'opening' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                      {r.dipping_type}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="py-3 px-3">
                      <button onClick={() => setDeleteConfirm(r.id)} className="p-1 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center text-gray-400">No dipping records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MeterReadingsTab({ profile, isTestingMode }: { profile: any; isTestingMode: boolean }) {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: '1',
    nozzle_number: '1',
    opening_reading: '',
    closing_reading: '',
  });

  useEffect(() => { loadRecords(); }, [isTestingMode]);

  async function loadRecords() {
    const { data } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('is_test_data', isTestingMode)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setRecords(data);
  }

  const openingNum = parseFloat(form.opening_reading) || 0;
  const closingNum = parseFloat(form.closing_reading) || 0;
  const litersSold = closingNum >= openingNum ? (closingNum - openingNum) : 0;

  async function handleSubmit() {
    if (!form.opening_reading || !form.closing_reading || closingNum < openingNum) return;
    setSaving(true);
    const { error } = await supabase.from('meter_readings').insert({
      date: form.date,
      shift: parseInt(form.shift),
      nozzle_number: parseInt(form.nozzle_number),
      opening_reading: toNumericString(form.opening_reading),
      closing_reading: toNumericString(form.closing_reading),
      user_id: profile.id,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      setForm({ ...form, opening_reading: '', closing_reading: '' });
      loadRecords();
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('meter_readings').delete().eq('id', id);
    setDeleteConfirm(null);
    loadRecords();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-light">Meter Reading Records</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> Record Reading
        </Button>
      </div>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to permanently delete this meter reading? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Record Meter Reading" size="md">
        <div className="space-y-4">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              <option value="1">Shift 1 - Day</option>
              <option value="2">Shift 2 - Night</option>
            </Select>
            <Select label="Nozzle" value={form.nozzle_number} onChange={(e) => setForm({ ...form, nozzle_number: e.target.value })}>
              <option value="1">Nozzle 1</option>
              <option value="2">Nozzle 2</option>
            </Select>
          </div>
          <Input label="Opening Meter Reading" type="number" step="0.01" min="0" value={form.opening_reading}
            onChange={(e) => setForm({ ...form, opening_reading: e.target.value })} />
          <Input label="Closing Meter Reading" type="number" step="0.01" min="0" value={form.closing_reading}
            onChange={(e) => setForm({ ...form, closing_reading: e.target.value })} />
          {form.opening_reading && form.closing_reading && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm text-blue-700">
                Liters Sold: <span className="font-mono font-medium">{litersSold.toFixed(2)} L</span>
              </p>
            </div>
          )}
          {closingNum < openingNum && form.closing_reading && (
            <p className="text-red-500 text-sm">Closing reading must be greater than or equal to opening reading</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.opening_reading || !form.closing_reading || closingNum < openingNum}>
              {saving ? 'Saving...' : 'Save Reading'}
            </Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Shift</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Nozzle</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Opening</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Closing</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Liters Sold</th>
                {isSuperAdmin && <th className="text-left py-3 px-3 font-medium text-gray-500"></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-3">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                  <td className="py-3 px-3">{r.shift === 1 ? 'Day' : 'Night'}</td>
                  <td className="py-3 px-3">Nozzle {r.nozzle_number}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.opening_reading).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.closing_reading).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-mono font-medium">{Number(r.liters_sold).toFixed(2)}</td>
                  {isSuperAdmin && (
                    <td className="py-3 px-3">
                      <button onClick={() => setDeleteConfirm(r.id)} className="p-1 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center text-gray-400">No meter readings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReconciliationTab({ tanks, profile, isTestingMode }: { tanks: Tank[]; profile: any; isTestingMode: boolean }) {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: '1',
    tank_id: '',
    opening_liters: '',
    deliveries_received: '0',
    fuel_sold_meters: '0',
    closing_liters: '',
    dip_reading: '',
  });

  useEffect(() => { loadRecords(); }, [isTestingMode]);

  async function loadRecords() {
    const { data } = await supabase
      .from('fuel_movement_reconciliations')
      .select('*, tank:tank_id(tank_name)')
      .eq('is_test_data', isTestingMode)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setRecords(data);
  }

  async function autoPopulate() {
    if (!form.tank_id || !form.date || !form.shift) return;
    const shiftNum = parseInt(form.shift);

    const { data: openDip } = await supabase
      .from('tank_dippings')
      .select('physical_quantity')
      .eq('tank_id', form.tank_id)
      .eq('date', form.date)
      .eq('shift', shiftNum)
      .eq('dipping_type', 'opening')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: closeDip } = await supabase
      .from('tank_dippings')
      .select('physical_quantity')
      .eq('tank_id', form.tank_id)
      .eq('date', form.date)
      .eq('shift', shiftNum)
      .eq('dipping_type', 'closing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: meterData } = await supabase
      .from('meter_readings')
      .select('liters_sold')
      .eq('date', form.date)
      .eq('shift', shiftNum);

    const totalMeterSold = (meterData || []).reduce((s, m) => s + Number(m.liters_sold), 0);

    setForm((prev) => ({
      ...prev,
      opening_liters: openDip ? String(openDip.physical_quantity) : prev.opening_liters,
      dip_reading: closeDip ? String(closeDip.physical_quantity) : prev.dip_reading,
      fuel_sold_meters: totalMeterSold.toFixed(2),
    }));
  }

  const openL = parseFloat(form.opening_liters) || 0;
  const deliv = parseFloat(form.deliveries_received) || 0;
  const sold = parseFloat(form.fuel_sold_meters) || 0;
  const dipR = parseFloat(form.dip_reading) || 0;
  const expected = openL + deliv - sold;
  const variance = dipR - expected;
  const absVar = Math.abs(variance);
  const classification = absVar <= 20 ? 'NORMAL' : absVar <= 100 ? 'INVESTIGATE' : 'CRITICAL';

  async function handleSubmit() {
    if (!form.tank_id) return;
    setSaving(true);
    const { error } = await supabase.from('fuel_movement_reconciliations').insert({
      date: form.date,
      shift: parseInt(form.shift),
      tank_id: form.tank_id,
      opening_liters: toNumericString(form.opening_liters),
      deliveries_received: toNumericString(form.deliveries_received),
      fuel_sold_meters: toNumericString(form.fuel_sold_meters),
      closing_liters: toNumericString(expected),
      dip_reading: toNumericString(form.dip_reading),
      user_id: profile.id,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      loadRecords();
    }
  }

  async function handleDeleteRecon(id: string) {
    await supabase.from('fuel_movement_reconciliations').delete().eq('id', id);
    setDeleteConfirm(null);
    loadRecords();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-light">Fuel Movement Reconciliation</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> New Reconciliation
        </Button>
      </div>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to permanently delete this reconciliation record? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDeleteRecon(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Fuel Movement Reconciliation" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Select label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              <option value="1">Shift 1 - Day</option>
              <option value="2">Shift 2 - Night</option>
            </Select>
            <Select label="Tank" value={form.tank_id} onChange={(e) => setForm({ ...form, tank_id: e.target.value })}>
              <option value="">Select tank</option>
              {tanks.map((t) => <option key={t.id} value={t.id}>Tank {t.tank_name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={autoPopulate} disabled={!form.tank_id}>
              <RefreshCw className="w-3 h-3 mr-1" /> Auto-Populate from Dippings & Meters
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Opening Liters" type="number" step="0.01" value={form.opening_liters}
              onChange={(e) => setForm({ ...form, opening_liters: e.target.value })} />
            <Input label="Deliveries Received (L)" type="number" step="0.01" value={form.deliveries_received}
              onChange={(e) => setForm({ ...form, deliveries_received: e.target.value })} />
            <Input label="Fuel Sold (Meters)" type="number" step="0.01" value={form.fuel_sold_meters}
              onChange={(e) => setForm({ ...form, fuel_sold_meters: e.target.value })} />
            <Input label="Dip Reading" type="number" step="0.01" value={form.dip_reading}
              onChange={(e) => setForm({ ...form, dip_reading: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4">
            <div>
              <p className="text-xs text-gray-500">Expected Closing</p>
              <p className="font-mono text-lg">{expected.toFixed(2)} L</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Variance</p>
              <p className={`font-mono text-lg ${variance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{variance.toFixed(2)} L</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Classification</p>
              <VarianceBadge classification={classification} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.tank_id}>
              {saving ? 'Saving...' : 'Save Reconciliation'}
            </Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Shift</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Tank</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Opening</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Deliveries</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Sold</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Dip</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">Variance</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                {isSuperAdmin && <th className="text-left py-3 px-2 font-medium text-gray-500"></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-2">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                  <td className="py-3 px-2">{r.shift === 1 ? 'Day' : 'Night'}</td>
                  <td className="py-3 px-2">Tank {r.tank?.tank_name}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(r.opening_liters).toFixed(2)}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(r.deliveries_received).toFixed(2)}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(r.fuel_sold_meters).toFixed(2)}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(r.dip_reading).toFixed(2)}</td>
                  <td className="py-3 px-2 text-right font-mono">{Number(r.variance).toFixed(2)}</td>
                  <td className="py-3 px-2"><VarianceBadge classification={r.variance_classification} /></td>
                  {isSuperAdmin && (
                    <td className="py-3 px-2">
                      <button onClick={() => setDeleteConfirm(r.id)} className="p-1 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isSuperAdmin ? 10 : 9} className="py-8 text-center text-gray-400">No reconciliation records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InventoryVarianceTab({ tanks, profile, isTestingMode }: { tanks: Tank[]; profile: any; isTestingMode: boolean }) {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    tank_id: '',
    physical_quantity: '',
    notes: '',
  });
  const [systemQty, setSystemQty] = useState(0);

  useEffect(() => { loadRecords(); }, []);

  useEffect(() => {
    if (form.tank_id) {
      const tank = tanks.find((t) => t.id === form.tank_id);
      setSystemQty(tank?.current_liters || 0);
    }
  }, [form.tank_id, tanks]);

  useEffect(() => { loadRecords(); }, [isTestingMode]);

  async function loadRecords() {
    const { data } = await supabase
      .from('inventory_variances')
      .select('*, tank:tank_id(tank_name)')
      .eq('is_test_data', isTestingMode)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setRecords(data);
  }

  const physQty = parseFloat(form.physical_quantity) || 0;
  const variance = physQty - systemQty;
  const absVar = Math.abs(variance);
  const classification = absVar <= 20 ? 'NORMAL' : absVar <= 100 ? 'INVESTIGATE' : 'CRITICAL';

  async function handleSubmit() {
    if (!form.tank_id || !form.physical_quantity) return;
    setSaving(true);
    const { error } = await supabase.from('inventory_variances').insert({
      date: form.date,
      tank_id: form.tank_id,
      system_quantity: toNumericString(systemQty),
      physical_quantity: toNumericString(form.physical_quantity),
      user_id: profile.id,
      notes: form.notes || null,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      setForm({ ...form, physical_quantity: '', notes: '', tank_id: '' });
      loadRecords();
    }
  }

  async function handleDeleteVariance(id: string) {
    await supabase.from('inventory_variances').delete().eq('id', id);
    setDeleteConfirm(null);
    loadRecords();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-light">Inventory Variance</h2>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> Record Variance
        </Button>
      </div>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to permanently delete this variance record? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDeleteVariance(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tanks.map((t) => (
          <Card key={t.id} className="text-center">
            <p className="text-sm text-gray-500 mb-1">Tank {t.tank_name}</p>
            <p className="text-2xl font-light font-mono">{Number(t.current_liters).toFixed(2)} L</p>
            <p className="text-xs text-gray-400 mt-1">System Quantity</p>
          </Card>
        ))}
      </div>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Record Inventory Variance" size="md">
        <div className="space-y-4">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Tank" value={form.tank_id} onChange={(e) => setForm({ ...form, tank_id: e.target.value })}>
            <option value="">Select tank</option>
            {tanks.map((t) => <option key={t.id} value={t.id}>Tank {t.tank_name}</option>)}
          </Select>
          {form.tank_id && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm text-blue-700">System Quantity: <span className="font-mono font-medium">{systemQty.toFixed(2)} L</span></p>
            </div>
          )}
          <Input label="Physical Quantity (Liters)" type="number" step="0.01" min="0" value={form.physical_quantity}
            onChange={(e) => setForm({ ...form, physical_quantity: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {form.physical_quantity && form.tank_id && (
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
              <div>
                <p className="text-xs text-gray-500">Variance</p>
                <p className={`font-mono text-lg ${variance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{variance.toFixed(2)} L</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Classification</p>
                <VarianceBadge classification={classification} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.tank_id || !form.physical_quantity}>
              {saving ? 'Saving...' : 'Save Variance'}
            </Button>
          </div>
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Tank</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">System</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Physical</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Variance</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Notes</th>
                {isSuperAdmin && <th className="text-left py-3 px-3 font-medium text-gray-500"></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-3">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                  <td className="py-3 px-3">Tank {r.tank?.tank_name}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.system_quantity).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.physical_quantity).toFixed(2)}</td>
                  <td className="py-3 px-3 text-right font-mono">{Number(r.variance).toFixed(2)}</td>
                  <td className="py-3 px-3"><VarianceBadge classification={r.variance_classification} /></td>
                  <td className="py-3 px-3 text-gray-500 max-w-[200px] truncate">{r.notes || '—'}</td>
                  {isSuperAdmin && (
                    <td className="py-3 px-3">
                      <button onClick={() => setDeleteConfirm(r.id)} className="p-1 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={isSuperAdmin ? 8 : 7} className="py-8 text-center text-gray-400">No variance records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
