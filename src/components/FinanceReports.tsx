import { useState } from 'react';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Download, Printer, TrendingUp, Users, CheckCircle, ShoppingCart, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useFinanceReports,
  getPresetDateRange,
  DatePreset,
  DateRange,
  SettlementInvoice,
} from '../hooks/useFinanceReports';
import OshaliLoader from './OshaliLoader';
import { formatCurrency } from '../lib/utils';

// ─── Print styles ─────────────────────────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-break { page-break-before: always; }
}
`;

// ─── CSV helper ───────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100" style={{ backgroundColor: '#f8faff' }}>
        <span style={{ color: '#1B2D5B' }}>{icon}</span>
        <h3 className="font-semibold text-sm" style={{ color: '#1B2D5B' }}>{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: '#1B2D5B' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <DollarSign size={18} className="text-gray-300" />
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FinanceReports() {
  const todayRange = getPresetDateRange('monthly');
  const [dateRange, setDateRange] = useState<DateRange>({
    ...todayRange,
    preset: 'monthly',
  });
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'settled' | 'unsettled' | 'void'>('all');
  const [showDrillDown, setShowDrillDown] = useState(false);

  const { revenue, profitMargin, topClients, settlementRate, procurementCosts, loading } =
    useFinanceReports(dateRange);

  function applyPreset(preset: Exclude<DatePreset, 'custom'>) {
    const range = getPresetDateRange(preset);
    setDateRange({ ...range, preset });
  }

  function handleCustomFrom(val: string) {
    setDateRange((prev) => ({ ...prev, from: val, preset: 'custom' }));
  }

  function handleCustomTo(val: string) {
    setDateRange((prev) => ({ ...prev, to: val, preset: 'custom' }));
  }

  // ── CSV exports ──────────────────────────────────────────────────────────────

  function exportRevenueCSV() {
    if (!revenue) return;
    const rows = [
      ['Date', 'Revenue (N$)', 'Liters'],
      ...revenue.periods.map((p) => [p.date, p.revenue.toFixed(2), p.liters.toFixed(2)]),
      [],
      ['Total Revenue', revenue.totalRevenue.toFixed(2), revenue.totalLiters.toFixed(2)],
      ['Avg per Liter', revenue.avgPerLiter.toFixed(4), ''],
    ];
    downloadCSV(`revenue_${dateRange.from}_${dateRange.to}.csv`, rows);
  }

  function exportTopClientsCSV() {
    if (!topClients.length) return;
    const rows = [
      ['Client', 'Total Liters', 'Total Revenue (N$)', 'Revenue %'],
      ...topClients.map((c) => [
        c.name,
        c.totalLiters.toFixed(2),
        c.totalRevenue.toFixed(2),
        c.revenuePercent.toFixed(1) + '%',
      ]),
    ];
    downloadCSV(`top_clients_${dateRange.from}_${dateRange.to}.csv`, rows);
  }

  function exportProfitMarginCSV() {
    if (!profitMargin) return;
    const rows = [
      ['Metric', 'Amount (N$)'],
      ['Total Revenue', profitMargin.totalRevenue.toFixed(2)],
      ['Total Cost', profitMargin.totalCost.toFixed(2)],
      ['Gross Profit', profitMargin.grossProfit.toFixed(2)],
      ['Margin %', profitMargin.marginPercent.toFixed(2) + '%'],
    ];
    downloadCSV(`profit_margin_${dateRange.from}_${dateRange.to}.csv`, rows);
  }

  function exportSettlementCSV() {
    if (!settlementRate) return;
    const filteredInvoices = getFilteredInvoices();
    const rows = [
      ['Invoice #', 'Customer', 'Date', 'Liters', 'Amount (N$)', 'Status'],
      ...filteredInvoices.map((inv) => [
        inv.invoice_number,
        inv.client_name,
        format(new Date(inv.invoice_date), 'yyyy-MM-dd'),
        inv.liters_sold.toFixed(2),
        inv.total_amount.toFixed(2),
        inv.status,
      ]),
      [],
      ['Summary'],
      ['Status', 'Count', 'Amount (N$)'],
      ['Settled', String(settlementRate.settled.count), settlementRate.settled.amount.toFixed(2)],
      ['Unsettled', String(settlementRate.unsettled.count), settlementRate.unsettled.amount.toFixed(2)],
      ['Void', String(settlementRate.void.count), settlementRate.void.amount.toFixed(2)],
      [],
      ['Total', String(settlementRate.totalCount), settlementRate.totalAmount.toFixed(2)],
    ];
    const filterLabel = settlementFilter === 'all' ? '' : `_${settlementFilter}`;
    downloadCSV(`invoices${filterLabel}_${dateRange.from}_${dateRange.to}.csv`, rows);
  }

  function getFilteredInvoices(): SettlementInvoice[] {
    if (!settlementRate) return [];
    if (settlementFilter === 'all') return settlementRate.invoices;
    return settlementRate.invoices.filter((inv) => inv.status === settlementFilter);
  }

  function exportProcurementCSV() {
    if (!procurementCosts) return;
    const rows = [
      ['Metric', 'Value'],
      ['Total Spent (N$)', procurementCosts.totalSpent.toFixed(2)],
      ['Total Liters', procurementCosts.totalLiters.toFixed(2)],
      ['Avg Cost per Liter (N$)', procurementCosts.avgCostPerLiter.toFixed(4)],
      ['GR Records', String(procurementCosts.grCount)],
    ];
    downloadCSV(`procurement_${dateRange.from}_${dateRange.to}.csv`, rows);
  }

  function exportAllCSV() {
    if (revenue) exportRevenueCSV();
    if (topClients.length) exportTopClientsCSV();
    if (profitMargin) exportProfitMarginCSV();
    if (settlementRate) exportSettlementCSV();
    if (procurementCosts) exportProcurementCSV();
  }

  // ── Preset buttons config ────────────────────────────────────────────────────

  const presets: { label: string; value: Exclude<DatePreset, 'custom'> }[] = [
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
    { label: 'Yearly', value: 'yearly' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <style>{PRINT_STYLES}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1B2D5B' }}>Finance Reports</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {dateRange.from} → {dateRange.to}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportAllCSV}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={
              dateRange.preset === p.value
                ? { backgroundColor: '#1B2D5B', color: 'white' }
                : { backgroundColor: '#f1f5f9', color: '#475569' }
            }
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setDateRange((prev) => ({ ...prev, preset: 'custom' }))}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={
            dateRange.preset === 'custom'
              ? { backgroundColor: '#1B2D5B', color: 'white' }
              : { backgroundColor: '#f1f5f9', color: '#475569' }
          }
        >
          Custom
        </button>
        {dateRange.preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => handleCustomFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => handleCustomTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <OshaliLoader variant="inline" message="Loading reports…" />
        </div>
      )}

      {/* Report sections */}
      {!loading && (
        <div className="space-y-6">

          {/* 1. Revenue Trend */}
          <SectionCard title="Revenue Trend" icon={<TrendingUp size={16} />}>
            {!revenue || revenue.periods.length === 0 ? (
              <EmptyState message="No revenue data for this period." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                  <StatBox label="Total Revenue" value={formatCurrency(revenue.totalRevenue)} />
                  <StatBox label="Total Liters" value={`${revenue.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`} />
                  <StatBox label="Avg per Liter" value={formatCurrency(revenue.avgPerLiter)} />
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenue.periods} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `N$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                      labelStyle={{ color: '#1B2D5B', fontWeight: 600, fontSize: 12 }}
                      contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" fill="#1B2D5B" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-end mt-3 no-print">
                  <button
                    onClick={exportRevenueCSV}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Download CSV
                  </button>
                </div>
              </>
            )}
          </SectionCard>

          {/* 2. Profit Margin */}
          <SectionCard title="Profit Margin" icon={<DollarSign size={16} />}>
            {!profitMargin ? (
              <EmptyState message="No margin data for this period." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Total Revenue" value={formatCurrency(profitMargin.totalRevenue)} />
                  <StatBox label="Total Cost" value={formatCurrency(profitMargin.totalCost)} />
                  <StatBox label="Gross Profit" value={formatCurrency(profitMargin.grossProfit)} />
                  <StatBox
                    label="Margin"
                    value={`${profitMargin.marginPercent.toFixed(1)}%`}
                    sub={profitMargin.marginPercent >= 0 ? 'Profitable' : 'Loss'}
                  />
                </div>
                <div className="flex justify-end mt-3 no-print">
                  <button
                    onClick={exportProfitMarginCSV}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Download CSV
                  </button>
                </div>
              </>
            )}
          </SectionCard>

          {/* 3. Top Clients */}
          <SectionCard title="Top Clients by Revenue" icon={<Users size={16} />}>
            {topClients.length === 0 ? (
              <EmptyState message="No client data for this period." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium">Client</th>
                        <th className="pb-2 font-medium text-right">Liters</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                        <th className="pb-2 font-medium text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {topClients.map((c, i) => (
                        <tr key={c.name} className="hover:bg-gray-50">
                          <td className="py-2.5 flex items-center gap-2">
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white"
                              style={{ backgroundColor: i === 0 ? '#F5A623' : '#1B2D5B', opacity: i === 0 ? 1 : 0.6 + i * 0.04 }}
                            >
                              {i + 1}
                            </span>
                            {c.name}
                          </td>
                          <td className="py-2.5 text-right text-gray-600">
                            {c.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </td>
                          <td className="py-2.5 text-right font-medium" style={{ color: '#1B2D5B' }}>
                            {formatCurrency(c.totalRevenue)}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{ width: `${c.revenuePercent}%`, backgroundColor: '#F5A623' }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-10 text-right">
                                {c.revenuePercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-3 no-print">
                  <button
                    onClick={exportTopClientsCSV}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Download CSV
                  </button>
                </div>
              </>
            )}
          </SectionCard>

          {/* 4. Settlement Rate */}
          <SectionCard title="Invoice Settlement" icon={<CheckCircle size={16} />}>
            {!settlementRate || settlementRate.totalCount === 0 ? (
              <EmptyState message="No invoices for this period." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox
                    label="Settled"
                    value={String(settlementRate.settled.count)}
                    sub={formatCurrency(settlementRate.settled.amount)}
                  />
                  <StatBox
                    label="Unsettled"
                    value={String(settlementRate.unsettled.count)}
                    sub={formatCurrency(settlementRate.unsettled.amount)}
                  />
                  <StatBox
                    label="Void"
                    value={String(settlementRate.void.count)}
                    sub={formatCurrency(settlementRate.void.amount)}
                  />
                </div>
                {/* Settlement progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Settlement Rate</span>
                    <span>
                      {settlementRate.totalCount > 0
                        ? `${((settlementRate.settled.count / settlementRate.totalCount) * 100).toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                    {settlementRate.totalCount > 0 && (
                      <>
                        <div
                          style={{
                            width: `${(settlementRate.settled.count / settlementRate.totalCount) * 100}%`,
                            backgroundColor: '#22c55e',
                          }}
                        />
                        <div
                          style={{
                            width: `${(settlementRate.unsettled.count / settlementRate.totalCount) * 100}%`,
                            backgroundColor: '#F5A623',
                          }}
                        />
                        <div
                          style={{
                            width: `${(settlementRate.void.count / settlementRate.totalCount) * 100}%`,
                            backgroundColor: '#e5e7eb',
                          }}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Settled</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#F5A623' }} /> Unsettled</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Void</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Total Invoices</span>
                  <span className="font-semibold" style={{ color: '#1B2D5B' }}>{settlementRate.totalCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="font-semibold" style={{ color: '#1B2D5B' }}>{formatCurrency(settlementRate.totalAmount)}</span>
                </div>

                {/* Drill-down toggle */}
                <div className="pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowDrillDown(!showDrillDown)}
                    className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
                    style={{ color: '#1B2D5B' }}
                  >
                    {showDrillDown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showDrillDown ? 'Hide' : 'View'} Individual Invoices
                  </button>
                </div>

                {/* Drill-down table */}
                {showDrillDown && (
                  <div className="space-y-3">
                    {/* Status filter tabs */}
                    <div className="flex flex-wrap gap-2">
                      {(['all', 'settled', 'unsettled', 'void'] as const).map((status) => {
                        const count = status === 'all'
                          ? settlementRate.totalCount
                          : settlementRate[status === 'void' ? 'void' : status].count;
                        return (
                          <button
                            key={status}
                            onClick={() => setSettlementFilter(status)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={
                              settlementFilter === status
                                ? { backgroundColor: '#1B2D5B', color: 'white' }
                                : { backgroundColor: '#f1f5f9', color: '#475569' }
                            }
                          >
                            {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                          </button>
                        );
                      })}
                    </div>

                    {/* Invoice table */}
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                            <th className="px-3 py-2.5 font-medium">Invoice #</th>
                            <th className="px-3 py-2.5 font-medium">Customer</th>
                            <th className="px-3 py-2.5 font-medium">Date</th>
                            <th className="px-3 py-2.5 font-medium text-right">Liters</th>
                            <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                            <th className="px-3 py-2.5 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {getFilteredInvoices().length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                                No invoices in this category.
                              </td>
                            </tr>
                          ) : (
                            getFilteredInvoices().map((inv) => (
                              <tr key={inv.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium" style={{ color: '#1B2D5B' }}>
                                  {inv.invoice_number}
                                </td>
                                <td className="px-3 py-2.5 text-gray-700">{inv.client_name}</td>
                                <td className="px-3 py-2.5 text-gray-600">
                                  {format(new Date(inv.invoice_date), 'dd/MM/yyyy')}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-600">
                                  {inv.liters_sold.toFixed(2)} L
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium" style={{ color: '#1B2D5B' }}>
                                  {formatCurrency(inv.total_amount)}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={
                                      inv.status === 'settled'
                                        ? { backgroundColor: '#dcfce7', color: '#166534' }
                                        : inv.status === 'void'
                                        ? { backgroundColor: '#f3f4f6', color: '#6b7280' }
                                        : { backgroundColor: '#fef3c7', color: '#92400e' }
                                    }
                                  >
                                    {inv.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {getFilteredInvoices().length > 0 && (
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                              <td colSpan={3} className="px-3 py-2.5 text-xs font-medium text-gray-500">
                                Total: {getFilteredInvoices().length} invoice{getFilteredInvoices().length !== 1 ? 's' : ''}
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-600">
                                {getFilteredInvoices().reduce((s, i) => s + i.liters_sold, 0).toFixed(2)} L
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs font-bold" style={{ color: '#1B2D5B' }}>
                                {formatCurrency(getFilteredInvoices().reduce((s, i) => s + i.total_amount, 0))}
                              </td>
                              <td className="px-3 py-2.5"></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end no-print">
                  <button
                    onClick={exportSettlementCSV}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Download CSV
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          {/* 5. Procurement Costs */}
          <SectionCard title="Procurement Costs" icon={<ShoppingCart size={16} />}>
            {!procurementCosts || procurementCosts.grCount === 0 ? (
              <EmptyState message="No procurement records for this period." />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatBox label="Total Spent" value={formatCurrency(procurementCosts.totalSpent)} />
                  <StatBox
                    label="Total Liters"
                    value={`${procurementCosts.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`}
                  />
                  <StatBox label="Avg Cost / Liter" value={formatCurrency(procurementCosts.avgCostPerLiter)} />
                  <StatBox label="GR Records" value={String(procurementCosts.grCount)} />
                </div>
                <div className="flex justify-end mt-3 no-print">
                  <button
                    onClick={exportProcurementCSV}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Download CSV
                  </button>
                </div>
              </>
            )}
          </SectionCard>

        </div>
      )}
    </div>
  );
}
