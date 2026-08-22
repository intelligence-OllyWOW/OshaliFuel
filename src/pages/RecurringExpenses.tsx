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
import { format, addMonths, differenceInDays } from 'date-fns';
import { Plus, Calendar, AlertTriangle, CheckCircle, Pause, Play, Trash2 } from 'lucide-react';
import OshaliLoader from '../components/OshaliLoader';

interface RecurringExpense {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  category_id: string | null;
  due_day_of_month: number;
  is_active: boolean;
  next_due_date: string;
  last_generated_date: string | null;
  reminder_days_before: number;
  category?: { name: string } | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
}

export default function RecurringExpenses() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isSuperAdmin = profile?.role === 'super_admin';
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    category_id: '',
    due_day_of_month: '1',
    reminder_days_before: '3',
  });

  useEffect(() => { load(); }, [isTestingMode]);

  async function load() {
    const [{ data: expData }, { data: catData }] = await Promise.all([
      supabase.from('recurring_expenses').select('*, category:category_id(name)').eq('is_test_data', isTestingMode).order('next_due_date'),
      supabase.from('expense_categories').select('id,name').eq('is_active', true).order('sort_order'),
    ]);
    if (expData) setExpenses(expData);
    if (catData) setCategories(catData);
    setLoading(false);
  }

  async function handleSubmit() {
    if (!form.title || !form.amount) return;
    setSaving(true);
    const dueDay = parseInt(form.due_day_of_month) || 1;
    const now = new Date();
    let nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (nextDue <= now) nextDue = addMonths(nextDue, 1);

    const { error } = await supabase.from('recurring_expenses').insert({
      title: form.title,
      description: form.description || null,
      amount: parseFloat(form.amount).toFixed(2),
      category_id: form.category_id || null,
      due_day_of_month: dueDay,
      next_due_date: format(nextDue, 'yyyy-MM-dd'),
      reminder_days_before: parseInt(form.reminder_days_before) || 3,
      user_id: profile.id,
      is_test_data: isTestingMode,
    });
    setSaving(false);
    if (!error) {
      setShowForm(false);
      setForm({ title: '', description: '', amount: '', category_id: '', due_day_of_month: '1', reminder_days_before: '3' });
      load();
    }
  }

  async function toggleActive(id: string, currentState: boolean) {
    await supabase.from('recurring_expenses').update({ is_active: !currentState }).eq('id', id);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('recurring_expenses').delete().eq('id', id);
    setDeleteConfirm(null);
    load();
  }

  if (loading) return <OshaliLoader variant="section" message="Loading recurring expenses..." />;

  const totalMonthly = expenses.filter((e) => e.is_active).reduce((s, e) => s + Number(e.amount), 0);
  const upcoming = expenses.filter((e) => {
    if (!e.is_active) return false;
    const daysUntil = differenceInDays(new Date(e.next_due_date), new Date());
    return daysUntil <= 7 && daysUntil >= 0;
  });
  const overdue = expenses.filter((e) => {
    if (!e.is_active) return false;
    return new Date(e.next_due_date) < new Date();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-light">Recurring Expenses</h1>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" strokeWidth={1.5} /> New Schedule
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <p className="text-sm text-gray-500">Monthly Operating Cost</p>
          <p className="text-2xl font-light mt-1">{formatCurrency(totalMonthly)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Upcoming (7 days)</p>
          <p className="text-2xl font-light mt-1 text-amber-600">{upcoming.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Overdue</p>
          <p className="text-2xl font-light mt-1 text-red-600">{overdue.length}</p>
        </Card>
      </div>

      {upcoming.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <h3 className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Upcoming Payments
          </h3>
          <div className="space-y-2">
            {upcoming.map((e) => (
              <div key={e.id} className="flex justify-between items-center text-sm">
                <span>{e.title}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{formatCurrency(Number(e.amount))}</span>
                  <span className="text-amber-600">Due {format(new Date(e.next_due_date), 'dd MMM')}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Recurring Expense" size="md">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Electricity Bill" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Select label="Category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Due Day of Month" type="number" min="1" max="31" value={form.due_day_of_month}
              onChange={(e) => setForm({ ...form, due_day_of_month: e.target.value })} />
            <Input label="Reminder Days Before" type="number" min="0" max="30" value={form.reminder_days_before}
              onChange={(e) => setForm({ ...form, reminder_days_before: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.title || !form.amount}>
              {saving ? 'Saving...' : 'Create Schedule'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this recurring expense schedule?</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-3 font-medium text-gray-500">Expense</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Category</th>
                <th className="text-right py-3 px-3 font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Due Day</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Next Due</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const daysUntil = differenceInDays(new Date(e.next_due_date), new Date());
                const isOverdue = daysUntil < 0;
                return (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-3">
                      <div className="font-medium">{e.title}</div>
                      {e.description && <div className="text-xs text-gray-400">{e.description}</div>}
                    </td>
                    <td className="py-3 px-3 text-gray-500">{e.category?.name || '—'}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(Number(e.amount))}</td>
                    <td className="py-3 px-3">{e.due_day_of_month}</td>
                    <td className="py-3 px-3">
                      <span className={isOverdue ? 'text-red-600 font-medium' : daysUntil <= 7 ? 'text-amber-600' : ''}>
                        {format(new Date(e.next_due_date), 'dd MMM yyyy')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {e.is_active ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">Active</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">Paused</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => toggleActive(e.id, e.is_active)} className="p-1 hover:bg-gray-100 rounded-lg" title={e.is_active ? 'Pause' : 'Activate'}>
                          {e.is_active ? <Pause className="w-4 h-4 text-gray-500" strokeWidth={1.5} /> : <Play className="w-4 h-4 text-emerald-600" strokeWidth={1.5} />}
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => setDeleteConfirm(e.id)} className="p-1 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {expenses.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">No recurring expenses configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
