import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { Plus, CheckCircle, XCircle, Clock, Eye, Trash2 } from 'lucide-react';
import OshaliLoader from '../components/OshaliLoader';

interface Profile {
  id: string;
  full_name: string;
  role: string;
}

interface CashUp {
  id: string;
  date: string;
  shift: number;
  attendant_id: string | null;
  supervisor_id: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  cash_sales: number;
  card_sales: number;
  eft_sales: number;
  credit_sales: number;
  total_sales: number;
  opening_cash: number;
  cash_received: number;
  cash_paid_out: number;
  cash_deposited: number;
  closing_cash_counted: number;
  cash_carried_forward: number;
  expected_cash: number;
  variance: number;
  attendant_confirmed: boolean;
  supervisor_confirmed: boolean;
  variance_comments: string | null;
  management_approved: boolean;
  user_id: string;
  created_at: string;
  attendant?: Profile | null;
  supervisor?: Profile | null;
}

export default function ShiftCashUp() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [records, setRecords] = useState<CashUp[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<CashUp | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: '1',
    attendant_id: '',
    supervisor_id: '',
    shift_start_time: '06:00',
    shift_end_time: '18:00',
    cash_sales: '',
    card_sales: '',
    eft_sales: '',
    credit_sales: '',
    opening_cash: '',
    cash_received: '',
    cash_paid_out: '',
    cash_deposited: '',
    closing_cash_counted: '',
    cash_carried_forward: '',
    variance_comments: '',
    attendant_confirmed: false,
    supervisor_confirmed: false,
  });

  useEffect(() => { load(); }, [isTestingMode]);

  async function load() {
    const [{ data: cashups }, { data: profiles }] = await Promise.all([
      supabase
        .from('shift_cashups')
        .select('*, attendant:attendant_id(id,full_name,role), supervisor:supervisor_id(id,full_name,role)')
        .eq('is_test_data', isTestingMode)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('profiles').select('id,full_name,role').eq('is_active', true),
    ]);
    if (cashups) setRecords(cashups);
    if (profiles) setUsers(profiles);
    setLoading(false);
  }

  const cashSales = parseFloat(form.cash_sales) || 0;
  const cardSales = parseFloat(form.card_sales) || 0;
  const eftSales = parseFloat(form.eft_sales) || 0;
  const creditSales = parseFloat(form.credit_sales) || 0;
  const totalSales = cashSales + cardSales + eftSales + creditSales;
  const openingCash = parseFloat(form.opening_cash) || 0;
  const cashPaidOut = parseFloat(form.cash_paid_out) || 0;
  const cashDeposited = parseFloat(form.cash_deposited) || 0;
  const closingCashCounted = parseFloat(form.closing_cash_counted) || 0;
  const expectedCash = openingCash + cashSales - cashPaidOut - cashDeposited;
  const cashVariance = closingCashCounted - expectedCash;

  async function handleSubmit() {
    if (!form.supervisor_confirmed) {
      alert('Supervisor approval is required before closing this shift.');
      return;
    }
    if (Math.abs(cashVariance) > 0 && !form.variance_comments.trim()) {
      alert('Variance comments are required when there is a cash variance.');
      return;
    }
    setSaving(true);
    const toNum = (v: string) => parseFloat(v) || 0;
    const { error } = await supabase.from('shift_cashups').insert({
      date: form.date,
      shift: parseInt(form.shift),
      attendant_id: form.attendant_id || null,
      supervisor_id: form.supervisor_id || null,
      shift_start_time: form.shift_start_time,
      shift_end_time: form.shift_end_time,
      cash_sales: toNum(form.cash_sales).toFixed(2),
      card_sales: toNum(form.card_sales).toFixed(2),
      eft_sales: toNum(form.eft_sales).toFixed(2),
      credit_sales: toNum(form.credit_sales).toFixed(2),
      opening_cash: toNum(form.opening_cash).toFixed(2),
      cash_received: toNum(form.cash_received).toFixed(2),
      cash_paid_out: toNum(form.cash_paid_out).toFixed(2),
      cash_deposited: toNum(form.cash_deposited).toFixed(2),
      closing_cash_counted: toNum(form.closing_cash_counted).toFixed(2),
      cash_carried_forward: toNum(form.cash_carried_forward).toFixed(2),
      attendant_confirmed: form.attendant_confirmed,
      supervisor_confirmed: form.supervisor_confirmed,
      variance_comments: form.variance_comments || null,
      user_id: profile.id,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      load();
    }
  }

  async function handleDeleteCashUp(id: string) {
    await supabase.from('shift_cashups').delete().eq('id', id);
    setDeleteConfirm(null);
    load();
  }

  if (loading) return <OshaliLoader variant="section" message="Loading cash-up records..." />;

  const attendants = users.filter((u) => ['pump_attendant', 'attendant'].includes(u.role));
  const supervisors = users.filter((u) => ['operations_supervisor', 'general_manager', 'super_admin'].includes(u.role));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">Daily Cash-Up & Shift Reconciliation</h1>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> New Cash-Up
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-sm text-gray-500">Today's Cash-Ups</p>
          <p className="text-2xl font-light mt-1">
            {records.filter((r) => r.date === format(new Date(), 'yyyy-MM-dd')).length}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Pending Approval</p>
          <p className="text-2xl font-light mt-1 text-amber-600">
            {records.filter((r) => !r.management_approved && r.supervisor_confirmed).length}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Open Variances</p>
          <p className="text-2xl font-light mt-1 text-red-600">
            {records.filter((r) => Math.abs(Number(r.variance)) > 0 && !r.management_approved).length}
          </p>
        </Card>
      </div>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to permanently delete this cash-up record? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDeleteCashUp(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Shift Cash-Up" size="xl">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Shift Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Select label="Shift" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                <option value="1">Day Shift</option>
                <option value="2">Night Shift</option>
              </Select>
              <Input label="Start Time" type="time" value={form.shift_start_time} onChange={(e) => setForm({ ...form, shift_start_time: e.target.value })} />
              <Input label="End Time" type="time" value={form.shift_end_time} onChange={(e) => setForm({ ...form, shift_end_time: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <Select label="Pump Attendant" value={form.attendant_id} onChange={(e) => setForm({ ...form, attendant_id: e.target.value })}>
                <option value="">Select attendant</option>
                {attendants.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
              <Select label="Supervisor" value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
                <option value="">Select supervisor</option>
                {supervisors.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Sales Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Input label="Cash Sales" type="number" step="0.01" value={form.cash_sales} onChange={(e) => setForm({ ...form, cash_sales: e.target.value })} />
              <Input label="Card Sales" type="number" step="0.01" value={form.card_sales} onChange={(e) => setForm({ ...form, card_sales: e.target.value })} />
              <Input label="EFT Sales" type="number" step="0.01" value={form.eft_sales} onChange={(e) => setForm({ ...form, eft_sales: e.target.value })} />
              <Input label="Credit Sales" type="number" step="0.01" value={form.credit_sales} onChange={(e) => setForm({ ...form, credit_sales: e.target.value })} />
            </div>
            <div className="mt-3 bg-blue-50 rounded-xl p-3">
              <p className="text-sm text-blue-700">Total Sales: <span className="font-mono font-medium">{formatCurrency(totalSales)}</span></p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Cash Control</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Input label="Opening Cash" type="number" step="0.01" value={form.opening_cash} onChange={(e) => setForm({ ...form, opening_cash: e.target.value })} />
              <Input label="Cash Received" type="number" step="0.01" value={form.cash_received} onChange={(e) => setForm({ ...form, cash_received: e.target.value })} />
              <Input label="Cash Paid Out" type="number" step="0.01" value={form.cash_paid_out} onChange={(e) => setForm({ ...form, cash_paid_out: e.target.value })} />
              <Input label="Cash Deposited" type="number" step="0.01" value={form.cash_deposited} onChange={(e) => setForm({ ...form, cash_deposited: e.target.value })} />
              <Input label="Closing Cash Counted" type="number" step="0.01" value={form.closing_cash_counted} onChange={(e) => setForm({ ...form, closing_cash_counted: e.target.value })} />
              <Input label="Cash Carried Forward" type="number" step="0.01" value={form.cash_carried_forward} onChange={(e) => setForm({ ...form, cash_carried_forward: e.target.value })} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Expected Cash</p>
                <p className="font-mono text-lg">{formatCurrency(expectedCash)}</p>
              </div>
              <div className={`rounded-xl p-3 ${Math.abs(cashVariance) > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-xs text-gray-500">Variance</p>
                <p className={`font-mono text-lg ${cashVariance < 0 ? 'text-red-600' : cashVariance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCurrency(cashVariance)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Verification</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.attendant_confirmed}
                  onChange={(e) => setForm({ ...form, attendant_confirmed: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm">Attendant Confirmation</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.supervisor_confirmed}
                  onChange={(e) => setForm({ ...form, supervisor_confirmed: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm">Supervisor Confirmation (Required)</span>
              </label>
              {Math.abs(cashVariance) > 0 && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Variance Comments (Required)</label>
                  <textarea className="w-full rounded-xl border border-gray-200 p-3 text-sm" rows={3}
                    value={form.variance_comments} onChange={(e) => setForm({ ...form, variance_comments: e.target.value })}
                    placeholder="Explain the variance..." />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.supervisor_confirmed}>
              {saving ? 'Saving...' : 'Submit Cash-Up'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title="Cash-Up Details" size="lg">
        {showDetail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-gray-500">Date:</span> {format(new Date(showDetail.date), 'dd MMM yyyy')}</div>
              <div><span className="text-gray-500">Shift:</span> {showDetail.shift === 1 ? 'Day' : 'Night'}</div>
              <div><span className="text-gray-500">Attendant:</span> {(showDetail.attendant as any)?.full_name || '—'}</div>
              <div><span className="text-gray-500">Supervisor:</span> {(showDetail.supervisor as any)?.full_name || '—'}</div>
            </div>
            <hr className="border-gray-100" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Cash Sales:</span> <span className="font-mono">{formatCurrency(Number(showDetail.cash_sales))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Card Sales:</span> <span className="font-mono">{formatCurrency(Number(showDetail.card_sales))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">EFT Sales:</span> <span className="font-mono">{formatCurrency(Number(showDetail.eft_sales))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Credit Sales:</span> <span className="font-mono">{formatCurrency(Number(showDetail.credit_sales))}</span></div>
              <div className="flex justify-between font-medium col-span-2 pt-2 border-t"><span>Total Sales:</span> <span className="font-mono">{formatCurrency(Number(showDetail.total_sales))}</span></div>
            </div>
            <hr className="border-gray-100" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Opening Cash:</span> <span className="font-mono">{formatCurrency(Number(showDetail.opening_cash))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cash Paid Out:</span> <span className="font-mono">{formatCurrency(Number(showDetail.cash_paid_out))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cash Deposited:</span> <span className="font-mono">{formatCurrency(Number(showDetail.cash_deposited))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Closing Cash:</span> <span className="font-mono">{formatCurrency(Number(showDetail.closing_cash_counted))}</span></div>
              <div className="flex justify-between font-medium"><span>Expected:</span> <span className="font-mono">{formatCurrency(Number(showDetail.expected_cash))}</span></div>
              <div className={`flex justify-between font-medium ${Number(showDetail.variance) !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                <span>Variance:</span> <span className="font-mono">{formatCurrency(Number(showDetail.variance))}</span>
              </div>
            </div>
            {showDetail.variance_comments && (
              <>
                <hr className="border-gray-100" />
                <div>
                  <span className="text-gray-500">Variance Comments:</span>
                  <p className="mt-1">{showDetail.variance_comments}</p>
                </div>
              </>
            )}
            <div className="flex gap-4 pt-2">
              <span className={`flex items-center gap-1 text-xs ${showDetail.attendant_confirmed ? 'text-emerald-600' : 'text-gray-400'}`}>
                {showDetail.attendant_confirmed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} Attendant
              </span>
              <span className={`flex items-center gap-1 text-xs ${showDetail.supervisor_confirmed ? 'text-emerald-600' : 'text-gray-400'}`}>
                {showDetail.supervisor_confirmed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} Supervisor
              </span>
              <span className={`flex items-center gap-1 text-xs ${showDetail.management_approved ? 'text-emerald-600' : 'text-amber-500'}`}>
                {showDetail.management_approved ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />} Management
              </span>
            </div>
          </div>
        )}
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Shift</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Attendant</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Total Sales</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Expected</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Actual</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Variance</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-3">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                  <td className="py-3 px-3">{r.shift === 1 ? 'Day' : 'Night'}</td>
                  <td className="py-3 px-3">{(r.attendant as any)?.full_name || '—'}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(r.total_sales))}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(r.expected_cash))}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(r.closing_cash_counted))}</td>
                  <td className={`py-3 px-3 text-right font-mono ${Number(r.variance) !== 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(Number(r.variance))}
                  </td>
                  <td className="py-3 px-3">
                    {r.management_approved ? (
                      <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">Approved</span>
                    ) : r.supervisor_confirmed ? (
                      <span className="px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700">Pending Approval</span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">Draft</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-1">
                      <button onClick={() => setShowDetail(r)} className="p-1 hover:bg-gray-100 rounded-lg">
                        <Eye className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={() => setDeleteConfirm(r.id)} className="p-1 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">No cash-up records yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
