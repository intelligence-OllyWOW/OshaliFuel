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
import { Plus, CreditCard, DollarSign, Users, Eye, Trash2 } from 'lucide-react';
import OshaliLoader from '../components/OshaliLoader';

interface Client {
  id: string;
  name: string;
}

interface CustomerSummary {
  customer_id: string;
  customer_name: string;
  total_credit: number;
  total_payments: number;
  outstanding: number;
  last_payment_date: string | null;
}

export default function CreditLedger() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [activeTab, setActiveTab] = useState<'summary' | 'transactions' | 'payments'>('summary');
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: 'transaction' | 'payment' } | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';

  const [creditForm, setCreditForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    liters_sold: '',
    selling_price: '',
    discount_applied: '0',
    amount_paid: '0',
    notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    amount_paid: '',
    payment_reference: '',
    notes: '',
  });

  useEffect(() => { load(); }, [isTestingMode]);

  async function load() {
    const [{ data: clientData }, { data: txData }, { data: payData }] = await Promise.all([
      supabase.from('clients').select('id,name').order('name'),
      supabase.from('credit_transactions').select('*, customer:customer_id(name)').eq('is_test_data', isTestingMode).order('created_at', { ascending: false }).limit(100),
      supabase.from('credit_payments').select('*, customer:customer_id(name)').eq('is_test_data', isTestingMode).order('created_at', { ascending: false }).limit(100),
    ]);
    if (clientData) setClients(clientData);
    if (txData) setTransactions(txData);
    if (payData) setPayments(payData);
    buildSummaries(txData || [], payData || [], clientData || []);
    setLoading(false);
  }

  function buildSummaries(txs: any[], pays: any[], cls: Client[]) {
    const map = new Map<string, CustomerSummary>();
    for (const c of cls) {
      map.set(c.id, { customer_id: c.id, customer_name: c.name, total_credit: 0, total_payments: 0, outstanding: 0, last_payment_date: null });
    }
    for (const tx of txs) {
      const s = map.get(tx.customer_id);
      if (s) s.total_credit += Number(tx.transaction_value) || 0;
    }
    for (const p of pays) {
      const s = map.get(p.customer_id);
      if (s) {
        s.total_payments += Number(p.amount_paid) || 0;
        if (!s.last_payment_date || p.date > s.last_payment_date) s.last_payment_date = p.date;
      }
    }
    for (const tx of txs) {
      const s = map.get(tx.customer_id);
      if (s) s.total_payments += Number(tx.amount_paid) || 0;
    }
    const arr = Array.from(map.values())
      .map((s) => ({ ...s, outstanding: s.total_credit - s.total_payments }))
      .filter((s) => s.total_credit > 0 || s.outstanding !== 0)
      .sort((a, b) => b.outstanding - a.outstanding);
    setSummaries(arr);
  }

  const liters = parseFloat(creditForm.liters_sold) || 0;
  const price = parseFloat(creditForm.selling_price) || 0;
  const discount = parseFloat(creditForm.discount_applied) || 0;
  const txValue = liters * price - discount;
  const amtPaid = parseFloat(creditForm.amount_paid) || 0;
  const outstanding = txValue - amtPaid;

  async function handleCreditSubmit() {
    if (!creditForm.customer_id || !creditForm.liters_sold || !creditForm.selling_price) return;
    setSaving(true);
    const { error } = await supabase.from('credit_transactions').insert({
      date: creditForm.date,
      customer_id: creditForm.customer_id,
      liters_sold: parseFloat(creditForm.liters_sold).toFixed(2),
      selling_price: parseFloat(creditForm.selling_price).toFixed(2),
      discount_applied: parseFloat(creditForm.discount_applied || '0').toFixed(2),
      amount_paid: parseFloat(creditForm.amount_paid || '0').toFixed(2),
      user_id: profile.id,
      notes: creditForm.notes || null,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowCreditForm(false);
      setCreditForm({ date: format(new Date(), 'yyyy-MM-dd'), customer_id: '', liters_sold: '', selling_price: '', discount_applied: '0', amount_paid: '0', notes: '' });
      load();
    }
  }

  async function handlePaymentSubmit() {
    if (!paymentForm.customer_id || !paymentForm.amount_paid) return;
    setSaving(true);
    const { error } = await supabase.from('credit_payments').insert({
      date: paymentForm.date,
      customer_id: paymentForm.customer_id,
      amount_paid: parseFloat(paymentForm.amount_paid).toFixed(2),
      payment_reference: paymentForm.payment_reference || null,
      user_id: profile.id,
      notes: paymentForm.notes || null,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowPaymentForm(false);
      setPaymentForm({ date: format(new Date(), 'yyyy-MM-dd'), customer_id: '', amount_paid: '', payment_reference: '', notes: '' });
      load();
    }
  }

  async function handleDeleteEntry() {
    if (!deleteConfirm) return;
    const table = deleteConfirm.type === 'transaction' ? 'credit_transactions' : 'credit_payments';
    await supabase.from(table).delete().eq('id', deleteConfirm.id);
    setDeleteConfirm(null);
    load();
  }

  if (loading) return <OshaliLoader variant="section" message="Loading credit ledger..." />;

  const totalOutstanding = summaries.reduce((s, c) => s + c.outstanding, 0);
  const totalCredit = summaries.reduce((s, c) => s + c.total_credit, 0);
  const totalPayments = summaries.reduce((s, c) => s + c.total_payments, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">Customer Credit Ledger</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowPaymentForm(true)} size="sm">
            <DollarSign className="w-4 h-4 mr-1" strokeWidth={1.5} /> Record Payment
          </Button>
          <Button onClick={() => setShowCreditForm(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> Credit Sale
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-sm text-gray-500">Total Credit Extended</p>
          <p className="text-2xl font-light mt-1">{formatCurrency(totalCredit)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Total Payments Received</p>
          <p className="text-2xl font-light mt-1 text-emerald-600">{formatCurrency(totalPayments)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Outstanding Balance</p>
          <p className="text-2xl font-light mt-1 text-red-600">{formatCurrency(totalOutstanding)}</p>
        </Card>
      </div>

      <div className="flex space-x-1 bg-gray-100 rounded-xl p-1">
        {[
          { id: 'summary' as const, label: 'Customer Summary', icon: Users },
          { id: 'transactions' as const, label: 'Credit Transactions', icon: CreditCard },
          { id: 'payments' as const, label: 'Payments', icon: DollarSign },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-light transition-colors flex-1 justify-center ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <tab.icon className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Total Credit</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Total Payments</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Outstanding</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Last Payment</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.customer_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-medium">{s.customer_name}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(s.total_credit)}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600">{formatCurrency(s.total_payments)}</td>
                    <td className={`py-3 px-3 text-right font-mono font-medium ${s.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(s.outstanding)}
                    </td>
                    <td className="py-3 px-3 text-gray-500">{s.last_payment_date ? format(new Date(s.last_payment_date), 'dd MMM yyyy') : '—'}</td>
                  </tr>
                ))}
                {summaries.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">No credit accounts</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Liters</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Price/L</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Discount</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Value</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Paid</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Outstanding</th>
                  {isSuperAdmin && <th className="text-left py-3 px-3 font-medium text-gray-500"></th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3">{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                    <td className="py-3 px-3">{tx.customer?.name}</td>
                    <td className="py-3 px-3 text-right font-mono">{Number(tx.liters_sold).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(tx.selling_price))}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(tx.discount_applied))}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(tx.transaction_value))}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600">{formatCurrency(Number(tx.amount_paid))}</td>
                    <td className={`py-3 px-3 text-right font-mono ${Number(tx.outstanding_amount) > 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(Number(tx.outstanding_amount))}
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 px-3">
                        <button onClick={() => setDeleteConfirm({ id: tx.id, type: 'transaction' })} className="p-1 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={isSuperAdmin ? 9 : 8} className="py-8 text-center text-gray-400">No credit transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'payments' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Date</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-3 px-3 font-medium text-gray-500">Amount Paid</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Reference</th>
                  <th className="text-left py-3 px-3 font-medium text-gray-500">Notes</th>
                  {isSuperAdmin && <th className="text-left py-3 px-3 font-medium text-gray-500"></th>}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3">{format(new Date(p.date), 'dd MMM yyyy')}</td>
                    <td className="py-3 px-3">{p.customer?.name}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600">{formatCurrency(Number(p.amount_paid))}</td>
                    <td className="py-3 px-3">{p.payment_reference || '—'}</td>
                    <td className="py-3 px-3 text-gray-500 max-w-[200px] truncate">{p.notes || '—'}</td>
                    {isSuperAdmin && (
                      <td className="py-3 px-3">
                        <button onClick={() => setDeleteConfirm({ id: p.id, type: 'payment' })} className="p-1 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={isSuperAdmin ? 6 : 5} className="py-8 text-center text-gray-400">No payments recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to permanently delete this {deleteConfirm?.type === 'transaction' ? 'credit transaction' : 'payment record'}? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteEntry}>Delete</Button>
        </div>
      </Modal>

      {/* Credit Sale Modal */}
      <Modal isOpen={showCreditForm} onClose={() => setShowCreditForm(false)} title="Record Credit Sale" size="md">
        <div className="space-y-4">
          <Input label="Date" type="date" value={creditForm.date} onChange={(e) => setCreditForm({ ...creditForm, date: e.target.value })} />
          <Select label="Customer" value={creditForm.customer_id} onChange={(e) => setCreditForm({ ...creditForm, customer_id: e.target.value })}>
            <option value="">Select customer</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Liters Sold" type="number" step="0.01" value={creditForm.liters_sold} onChange={(e) => setCreditForm({ ...creditForm, liters_sold: e.target.value })} />
            <Input label="Selling Price / Liter" type="number" step="0.01" value={creditForm.selling_price} onChange={(e) => setCreditForm({ ...creditForm, selling_price: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Discount Applied" type="number" step="0.01" value={creditForm.discount_applied} onChange={(e) => setCreditForm({ ...creditForm, discount_applied: e.target.value })} />
            <Input label="Amount Paid" type="number" step="0.01" value={creditForm.amount_paid} onChange={(e) => setCreditForm({ ...creditForm, amount_paid: e.target.value })} />
          </div>
          <Input label="Notes" value={creditForm.notes} onChange={(e) => setCreditForm({ ...creditForm, notes: e.target.value })} />
          {creditForm.liters_sold && creditForm.selling_price && (
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
              <div>
                <p className="text-xs text-gray-500">Transaction Value</p>
                <p className="font-mono text-lg">{formatCurrency(txValue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Outstanding</p>
                <p className={`font-mono text-lg ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(outstanding)}</p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreditForm(false)}>Cancel</Button>
            <Button onClick={handleCreditSubmit} disabled={saving || !creditForm.customer_id || !creditForm.liters_sold || !creditForm.selling_price}>
              {saving ? 'Saving...' : 'Record Credit Sale'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={showPaymentForm} onClose={() => setShowPaymentForm(false)} title="Record Payment" size="md">
        <div className="space-y-4">
          <Input label="Date" type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
          <Select label="Customer" value={paymentForm.customer_id} onChange={(e) => setPaymentForm({ ...paymentForm, customer_id: e.target.value })}>
            <option value="">Select customer</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Amount Paid" type="number" step="0.01" value={paymentForm.amount_paid} onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })} />
          <Input label="Payment Reference" value={paymentForm.payment_reference} onChange={(e) => setPaymentForm({ ...paymentForm, payment_reference: e.target.value })} />
          <Input label="Notes" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
            <Button onClick={handlePaymentSubmit} disabled={saving || !paymentForm.customer_id || !paymentForm.amount_paid}>
              {saving ? 'Saving...' : 'Record Payment'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
