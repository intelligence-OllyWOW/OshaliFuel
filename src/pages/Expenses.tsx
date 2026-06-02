import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Wallet,
  ExternalLink,
  Tag,
  Trash2,
  ChevronDown,
  Filter,
  Download,
  Calendar,
} from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import { formatCurrency } from '../lib/utils';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Expense {
  id: string;
  expense_number: string;
  title: string;
  description: string | null;
  amount: number;
  category_id: string;
  receipt_url: string | null;
  expense_date: string;
  submitted_by: string;
  status: ExpenseStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  is_test_data: boolean;
  created_at: string;
  // Joined
  category?: ExpenseCategory;
  submitter?: { full_name: string; role: string };
  approver?: { full_name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateExpenseNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `EXP-${y}${m}${d}-${rand}`;
}

const STATUS_CONFIG: Record<
  ExpenseStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-600',
    icon: <FileText className="w-3 h-3" strokeWidth={1.5} />,
  },
  submitted: {
    label: 'Pending',
    className: 'bg-yellow-50 text-yellow-700',
    icon: <Clock className="w-3 h-3" strokeWidth={1.5} />,
  },
  approved: {
    label: 'Approved',
    className: 'bg-green-50 text-green-700',
    icon: <CheckCircle className="w-3 h-3" strokeWidth={1.5} />,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-50 text-red-700',
    icon: <XCircle className="w-3 h-3" strokeWidth={1.5} />,
  },
};

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full ${cfg.className}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Date Range Helpers ──────────────────────────────────────────────────────

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

function getPresetRange(preset: DatePreset): { from: string; to: string } | null {
  if (preset === 'all') return null;
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: format(startOfDay(now), 'yyyy-MM-dd'), to: format(endOfDay(now), 'yyyy-MM-dd') };
    case 'week':
      return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
    case 'month':
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
    default:
      return null;
  }
}

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Expenses() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();

  const isFinance = profile?.role === 'finance' || profile?.role === 'super_admin';
  const isGM = profile?.role === 'general_manager';
  const isSuperAdmin = profile?.role === 'super_admin';
  const canApprove = isFinance;
  const canViewAll = isFinance || isGM;

  // ── State ──────────────────────────────────────────────────────────────────

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: catData }, { data: expData }] = await Promise.all([
        supabase
          .from('expense_categories')
          .select('*')
          .order('sort_order'),
        supabase
          .from('expenses')
          .select(`
            *,
            category:expense_categories(id, name, description, is_active, sort_order),
            submitter:profiles!expenses_submitted_by_fkey(full_name, role),
            approver:profiles!expenses_approved_by_fkey(full_name)
          `)
          .order('created_at', { ascending: false }),
      ]);

      if (catData) setCategories(catData);
      if (expData) setExpenses(expData as Expense[]);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Submit expense ─────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setUploading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    let receiptUrl: string | null = null;

    try {
      if (uploadedFile) {
        const ext = uploadedFile.name.split('.').pop();
        const path = `expenses/${generateExpenseNumber()}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(path, uploadedFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }

      const expense = {
        expense_number: generateExpenseNumber(),
        title: formData.get('title') as string,
        description: (formData.get('description') as string) || null,
        amount: parseFloat(formData.get('amount') as string),
        category_id: formData.get('category_id') as string,
        expense_date: formData.get('expense_date') as string,
        notes: (formData.get('notes') as string) || null,
        receipt_url: receiptUrl,
        submitted_by: profile.id,
        status: 'submitted' as const,
        is_test_data: isTestingMode,
      };

      const { data: newExpense, error } = await supabase
        .from('expenses')
        .insert([expense])
        .select()
        .single();

      if (error) throw error;

      // Notify all finance users
      const { data: financeUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['finance', 'super_admin']);

      if (financeUsers && financeUsers.length > 0) {
        const notifications = financeUsers
          .filter((u) => u.id !== profile.id)
          .map((u) => ({
            user_id: u.id,
            title: 'New Expense Claim',
            message: `${profile.full_name} submitted an expense: ${expense.title} (N$ ${expense.amount.toFixed(2)})`,
            type: 'expense',
            reference_id: newExpense.id,
          }));
        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }

      setShowSubmitModal(false);
      setUploadedFile(null);
      form.reset();
      loadData();
    } catch (err) {
      console.error('Error submitting expense:', err);
    } finally {
      setUploading(false);
    }
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!selectedExpense || !profile) return;
    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedExpense.id);

    if (!error) {
      await supabase.from('notifications').insert([{
        user_id: selectedExpense.submitted_by,
        title: 'Expense Approved',
        message: `Your expense "${selectedExpense.title}" (N$ ${selectedExpense.amount.toFixed(2)}) has been approved.`,
        type: 'expense',
        reference_id: selectedExpense.id,
      }]);
      setShowApproveModal(false);
      setSelectedExpense(null);
      loadData();
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────

  async function handleReject() {
    if (!selectedExpense || !profile || !rejectionReason.trim()) return;
    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'rejected',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectionReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedExpense.id);

    if (!error) {
      await supabase.from('notifications').insert([{
        user_id: selectedExpense.submitted_by,
        title: 'Expense Rejected',
        message: `Your expense "${selectedExpense.title}" was rejected. Reason: ${rejectionReason.trim()}`,
        type: 'expense',
        reference_id: selectedExpense.id,
      }]);
      setShowRejectModal(false);
      setSelectedExpense(null);
      setRejectionReason('');
      loadData();
    }
  }

  // ── Add category (super admin) ─────────────────────────────────────────────

  async function handleAddCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const formData = new FormData(e.currentTarget);
    const { error } = await supabase.from('expense_categories').insert([{
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      sort_order: categories.length + 1,
      created_by: profile.id,
    }]);
    if (!error) {
      setShowCategoryModal(false);
      (e.target as HTMLFormElement).reset();
      loadData();
    }
  }

  async function handleToggleCategory(cat: ExpenseCategory) {
    await supabase
      .from('expense_categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id);
    loadData();
  }

  // ── Delete expense ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selectedExpense || !profile) return;
    setDeleting(true);

    try {
      const { error: auditError } = await supabase
        .from('expense_audit_log')
        .insert([{
          expense_id: selectedExpense.id,
          expense_number: selectedExpense.expense_number,
          title: selectedExpense.title,
          amount: selectedExpense.amount,
          action: 'deleted',
          performed_by: profile.id,
          reason: deleteReason.trim() || null,
          metadata: {
            description: selectedExpense.description,
            category_id: selectedExpense.category_id,
            category_name: selectedExpense.category?.name,
            expense_date: selectedExpense.expense_date,
            status: selectedExpense.status,
            submitted_by: selectedExpense.submitted_by,
            submitter_name: selectedExpense.submitter?.full_name,
            receipt_url: selectedExpense.receipt_url,
            notes: selectedExpense.notes,
            created_at: selectedExpense.created_at,
          },
        }]);

      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      const { error: deleteError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', selectedExpense.id);

      if (deleteError) throw deleteError;

      setShowDeleteModal(false);
      setSelectedExpense(null);
      setDeleteReason('');
      loadData();
    } catch (err) {
      console.error('Error deleting expense:', err);
    } finally {
      setDeleting(false);
    }
  }

  // ── Filtered expenses ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const dateRange = datePreset === 'custom'
      ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
      : getPresetRange(datePreset);

    return expenses.filter((e) => {
      const statusOk = filterStatus === 'all' || e.status === filterStatus;
      const catOk = filterCategory === 'all' || e.category_id === filterCategory;
      let dateOk = true;
      if (dateRange) {
        const expDate = e.expense_date;
        dateOk = expDate >= dateRange.from && expDate <= dateRange.to;
      }
      return statusOk && catOk && dateOk;
    });
  }, [expenses, filterStatus, filterCategory, datePreset, customFrom, customTo]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, e) => sum + e.amount, 0),
    [filtered]
  );

  function handleExportCSV() {
    const rows = [
      ['Expense #', 'Title', 'Category', 'Date', 'Amount (N$)', 'Status', 'Submitted By', 'Notes'],
      ...filtered.map((e) => [
        e.expense_number,
        e.title,
        e.category?.name || '',
        format(new Date(e.expense_date), 'yyyy-MM-dd'),
        e.amount.toFixed(2),
        e.status,
        e.submitter?.full_name || '',
        e.notes || '',
      ]),
      [],
      ['Total', '', '', '', filteredTotal.toFixed(2), '', '', ''],
    ];
    const label = datePreset === 'all' ? 'all' : datePreset === 'custom' ? `${customFrom}_${customTo}` : datePreset;
    downloadCSV(`expenses_${label}.csv`, rows);
  }

  // Summary stats for finance/GM view
  const totalSubmitted = expenses
    .filter((e) => e.status === 'submitted')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalApproved = expenses
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === 'submitted').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-indigo-600" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-2xl font-light">Expenses</h1>
            <p className="text-sm font-light text-gray-500">
              {canViewAll ? 'Review and manage all expense claims' : 'Submit and track your expense claims'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button variant="secondary" onClick={() => setShowCategoryModal(true)}>
              <Tag className="w-4 h-4 mr-2" strokeWidth={1} />
              Categories
            </Button>
          )}
          <Button onClick={() => setShowSubmitModal(true)}>
              <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
              New Claim
            </Button>
        </div>
      </div>

      {/* Summary cards — Finance/GM only */}
      {canViewAll && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <p className="text-sm font-light text-gray-500">Pending approval</p>
            <p className="text-2xl font-light mt-1">{pendingCount}</p>
            <p className="text-xs font-light text-gray-400 mt-1">{formatCurrency(totalSubmitted)} total</p>
          </Card>
          <Card>
            <p className="text-sm font-light text-gray-500">Approved (all time)</p>
            <p className="text-2xl font-light mt-1 text-green-700">{formatCurrency(totalApproved)}</p>
          </Card>
          <Card>
            <p className="text-sm font-light text-gray-500">Total claims</p>
            <p className="text-2xl font-light mt-1">{expenses.length}</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-4">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1} />
          {([
            { label: 'All Time', value: 'all' as DatePreset },
            { label: 'Today', value: 'today' as DatePreset },
            { label: 'This Week', value: 'week' as DatePreset },
            { label: 'This Month', value: 'month' as DatePreset },
            { label: 'Custom', value: 'custom' as DatePreset },
          ]).map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={
                datePreset === p.value
                  ? { backgroundColor: '#1B2D5B', color: 'white' }
                  : { backgroundColor: '#f1f5f9', color: '#475569' }
              }
            >
              {p.label}
            </button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          )}
        </div>

        {/* Status and category filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" strokeWidth={1} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ExpenseStatus | 'all')}
              className="text-sm font-light border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="all">All statuses</option>
              <option value="submitted">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-sm font-light border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors ml-auto"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>

        {/* Period totals */}
        {datePreset !== 'all' && (
          <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs font-light text-gray-500">Period Total</p>
              <p className="text-lg font-semibold" style={{ color: '#1B2D5B' }}>{formatCurrency(filteredTotal)}</p>
            </div>
            <div className="h-8 w-px bg-gray-200" />
            <div>
              <p className="text-xs font-light text-gray-500">Claims</p>
              <p className="text-lg font-semibold" style={{ color: '#1B2D5B' }}>{filtered.length}</p>
            </div>
            {filtered.length > 0 && (
              <>
                <div className="h-8 w-px bg-gray-200" />
                <div>
                  <p className="text-xs font-light text-gray-500">Approved</p>
                  <p className="text-lg font-semibold text-green-700">
                    {formatCurrency(filtered.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0))}
                  </p>
                </div>
                <div className="h-8 w-px bg-gray-200" />
                <div>
                  <p className="text-xs font-light text-gray-500">Pending</p>
                  <p className="text-lg font-semibold text-yellow-700">
                    {formatCurrency(filtered.filter(e => e.status === 'submitted').reduce((s, e) => s + e.amount, 0))}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Expenses list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
            <Wallet className="w-10 h-10" strokeWidth={0.8} />
            <p className="font-light text-sm">No expense claims found</p>
            <Button variant="secondary" onClick={() => setShowSubmitModal(true)}>
                Submit your first claim
              </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((expense) => (
            <Card key={expense.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-light text-gray-400">{expense.expense_number}</span>
                    <StatusBadge status={expense.status} />
                    {expense.is_test_data && (
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-light">
                        Test
                      </span>
                    )}
                  </div>
                  <h3 className="font-light text-base mt-1">{expense.title}</h3>
                  {expense.description && (
                    <p className="text-sm font-light text-gray-500 mt-0.5 truncate">{expense.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className="text-xs font-light text-gray-400">
                      {expense.category?.name ?? '—'}
                    </span>
                    <span className="text-xs font-light text-gray-400">
                      {format(new Date(expense.expense_date), 'd MMM yyyy')}
                    </span>
                    {canViewAll && expense.submitter && (
                      <span className="text-xs font-light text-gray-400">
                        By {expense.submitter.full_name}
                      </span>
                    )}
                    {expense.status === 'approved' && expense.approver && (
                      <span className="text-xs font-light text-green-600">
                        Approved by {expense.approver.full_name}
                      </span>
                    )}
                    {expense.status === 'rejected' && expense.rejection_reason && (
                      <span className="text-xs font-light text-red-500">
                        Reason: {expense.rejection_reason}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-light">{formatCurrency(expense.amount)}</span>

                  {expense.receipt_url && (
                    <a
                      href={expense.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
                      title="View receipt"
                    >
                      <ExternalLink className="w-4 h-4" strokeWidth={1} />
                    </a>
                  )}

                  {/* Finance: approve / reject pending claims */}
                  {canApprove && expense.status === 'submitted' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setSelectedExpense(expense); setShowApproveModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                        title="Approve"
                      >
                        <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => { setSelectedExpense(expense); setShowRejectModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  )}

                  {/* Finance/Super Admin: delete */}
                  {(isFinance || isSuperAdmin) && (
                    <button
                      onClick={() => { setSelectedExpense(expense); setShowDeleteModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete expense"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Submit Expense Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => { setShowSubmitModal(false); setUploadedFile(null); }}
        title="Submit Expense Claim"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Input name="title" label="Title" placeholder="e.g. Fuel for site visit" required />
            <div>
              <label className="block text-sm font-light text-gray-700 mb-1">Category</label>
              <select
                name="category_id"
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-light focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                name="amount"
                label="Amount (N$)"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                required
              />
              <Input name="expense_date" label="Expense Date" type="date" required />
            </div>
            <Input
              name="description"
              label="Description (optional)"
              placeholder="Brief description"
            />
            <Input name="notes" label="Notes (optional)" placeholder="Any additional notes" />

            {/* Receipt upload */}
            <div className="space-y-1">
              <label className="block text-sm font-light text-gray-700">
                Receipt (optional)
              </label>
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                <Upload className="w-4 h-4 text-gray-400" strokeWidth={1} />
                <span className="text-sm font-light text-gray-500">
                  {uploadedFile ? uploadedFile.name : 'Choose file (PDF, JPG, PNG)'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                />
              </label>
              {uploadedFile && (
                <button
                  type="button"
                  onClick={() => setUploadedFile(null)}
                  className="text-xs font-light text-red-400 hover:text-red-600"
                >
                  Remove file
                </button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1" disabled={uploading}>
                {uploading ? 'Submitting…' : 'Submit Claim'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setShowSubmitModal(false); setUploadedFile(null); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Approve Modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => { setShowApproveModal(false); setSelectedExpense(null); }}
        title="Approve Expense"
      >
        {selectedExpense && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="font-light">{selectedExpense.title}</p>
              <p className="text-sm font-light text-gray-500 mt-1">
                {selectedExpense.submitter?.full_name} ·{' '}
                {format(new Date(selectedExpense.expense_date), 'd MMM yyyy')}
              </p>
              <p className="text-xl font-light mt-2">{formatCurrency(selectedExpense.amount)}</p>
            </div>
            <p className="text-sm font-light text-gray-600">
              Are you sure you want to approve this expense claim?
            </p>
            <div className="flex gap-2">
              <Button onClick={handleApprove} className="flex-1 bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowApproveModal(false); setSelectedExpense(null); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Reject Modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => { setShowRejectModal(false); setSelectedExpense(null); setRejectionReason(''); }}
        title="Reject Expense"
      >
        {selectedExpense && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="font-light">{selectedExpense.title}</p>
              <p className="text-xl font-light mt-1">{formatCurrency(selectedExpense.amount)}</p>
            </div>
            <div>
              <label className="block text-sm font-light text-gray-700 mb-1">
                Rejection reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a reason for rejection…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-light focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40"
              >
                <XCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowRejectModal(false); setSelectedExpense(null); setRejectionReason(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Delete Confirmation Modal ───────────────────────────────────── */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedExpense(null); setDeleteReason(''); }}
        title="Delete Expense"
      >
        {selectedExpense && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
              <p className="text-sm font-medium text-red-800 mb-2">
                This action cannot be undone.
              </p>
              <p className="text-sm font-light text-red-700">
                The expense record will be permanently removed. An audit log entry will be created for accountability.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between">
                <p className="font-light">{selectedExpense.title}</p>
                <StatusBadge status={selectedExpense.status} />
              </div>
              <p className="text-xs font-light text-gray-400 mt-1">{selectedExpense.expense_number}</p>
              <p className="text-sm font-light text-gray-500 mt-1">
                {selectedExpense.submitter?.full_name} · {format(new Date(selectedExpense.expense_date), 'd MMM yyyy')}
              </p>
              <p className="text-xl font-light mt-2">{formatCurrency(selectedExpense.amount)}</p>
            </div>
            <div>
              <label className="block text-sm font-light text-gray-700 mb-1">
                Reason for deletion (optional)
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate entry, entered in error..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-light focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
                {deleting ? 'Deleting...' : 'Delete Expense'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowDeleteModal(false); setSelectedExpense(null); setDeleteReason(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Category Management Modal (Super Admin) ──────────────────────── */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Expense Categories"
      >
        <div className="space-y-4">
          <div className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className={`text-sm font-light ${!cat.is_active ? 'text-gray-400 line-through' : ''}`}>
                    {cat.name}
                  </p>
                  {cat.description && (
                    <p className="text-xs font-light text-gray-400">{cat.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleCategory(cat)}
                  className={`text-xs font-light px-2 py-1 rounded-lg transition-colors ${
                    cat.is_active
                      ? 'text-red-400 hover:bg-red-50'
                      : 'text-green-600 hover:bg-green-50'
                  }`}
                >
                  {cat.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-light text-gray-600 mb-3">Add new category</p>
            <form onSubmit={handleAddCategory} className="space-y-3">
              <Input name="name" label="Category Name" placeholder="e.g. Training & Development" required />
              <Input name="description" label="Description (optional)" placeholder="Short description" />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Add Category</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCategoryModal(false)}>
                  Close
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
