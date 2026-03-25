import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import Card from './ui/Card';
import Input from './ui/Input';
import Button from './ui/Button';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import { Download } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface RevenueProfit {
  date: string;
  revenue: number;
  profit: number;
}

export default function Analytics() {
  const [yearlyData, setYearlyData] = useState<MonthlyRevenue[]>([]);
  const [comparisonData, setComparisonData] = useState<RevenueProfit[]>([]);
  const [revenueType, setRevenueType] = useState<'realized' | 'unrealized'>('realized');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadYearlyRevenue();
  }, []);

  useEffect(() => {
    loadComparisonData();
  }, [startDate, endDate, revenueType]);

  async function loadYearlyRevenue() {
    try {
      const currentYear = new Date().getFullYear();
      const yearStart = startOfYear(new Date(currentYear, 0, 1));
      const yearEnd = endOfYear(new Date(currentYear, 11, 31));

      const { data: invoices } = await supabase
        .from('invoices')
        .select('created_at, total_amount, status')
        .gte('created_at', yearStart.toISOString())
        .lte('created_at', yearEnd.toISOString())
        .neq('status', 'void')
        .limit(50000);

      const monthlyRevenue: { [key: string]: number } = {};
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month) => {
        monthlyRevenue[month] = 0;
      });

      invoices?.forEach((invoice) => {
        const month = format(new Date(invoice.created_at), 'MMM');
        monthlyRevenue[month] += invoice.total_amount;
      });

      setYearlyData(months.map((month) => ({ month, revenue: monthlyRevenue[month] })));
    } catch (error) {
      console.error('Error loading yearly revenue:', error);
    }
  }

  async function loadComparisonData() {
    try {
      const statusFilter = revenueType === 'realized' ? 'settled' : 'unsettled';

      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, created_at, total_amount')
        .eq('status', statusFilter)
        .gte('created_at', new Date(startDate).toISOString())
        .lte('created_at', new Date(endDate + 'T23:59:59').toISOString())
        .order('created_at')
        .limit(50000);

      if (!invoices || invoices.length === 0) {
        setComparisonData([]);
        setLoading(false);
        return;
      }

      const invoiceIds = invoices.map((inv) => inv.id);
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, total_profit')
        .in('invoice_id', invoiceIds);

      const profitByInvoice: { [key: string]: number } = {};
      lineItems?.forEach((item) => {
        if (!profitByInvoice[item.invoice_id]) {
          profitByInvoice[item.invoice_id] = 0;
        }
        profitByInvoice[item.invoice_id] += item.total_profit || 0;
      });

      const grouped: { [key: string]: { revenue: number; profit: number } } = {};

      invoices.forEach((invoice) => {
        const date = format(new Date(invoice.created_at), 'MMM dd');

        if (!grouped[date]) {
          grouped[date] = { revenue: 0, profit: 0 };
        }

        grouped[date].revenue += invoice.total_amount;
        grouped[date].profit += profitByInvoice[invoice.id] || 0;
      });

      const result = Object.entries(grouped).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        profit: data.profit,
      }));

      setComparisonData(result);
    } catch (error) {
      console.error('Error loading comparison data:', error);
    } finally {
      setLoading(false);
    }
  }

  function exportToCSV(data: any[], filename: string) {
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((header) => {
          const value = row[header];
          return typeof value === 'number' ? value.toFixed(2) : value;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-light">Monthly Revenue ({new Date().getFullYear()})</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => exportToCSV(yearlyData, `monthly-revenue-${new Date().getFullYear()}.csv`)}
          >
            <Download className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Export CSV
          </Button>
        </div>
        <BarChart
          data={yearlyData.map((item) => ({ label: item.month, value: item.revenue }))}
          height={350}
          color="#10b981"
        />
      </Card>

      <Card>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-light">Revenue vs Profit</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setRevenueType('realized')}
                className={`px-2 py-1 rounded text-xs font-light transition-colors ${
                  revenueType === 'realized'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Realized
              </button>
              <button
                onClick={() => setRevenueType('unrealized')}
                className={`px-2 py-1 rounded text-xs font-light transition-colors ${
                  revenueType === 'unrealized'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Unrealized
              </button>
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-28 text-xs h-7"
            />
            <span className="text-gray-400 text-xs">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-28 text-xs h-7"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                exportToCSV(
                  comparisonData,
                  `revenue-profit-${revenueType}-${startDate}-to-${endDate}.csv`
                )
              }
              className="h-7 text-xs px-2"
            >
              <Download className="w-3 h-3 mr-1" strokeWidth={1.5} />
              Export
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
          </div>
        ) : comparisonData.length === 0 ? (
          <div className="text-center py-12 text-sm font-light text-gray-400">
            No data available for the selected period
          </div>
        ) : (
          <LineChart
            series={[
              {
                label: 'Revenue',
                data: comparisonData.map((item) => ({ label: item.date, value: item.revenue })),
                color: '#3b82f6',
              },
              {
                label: 'Profit',
                data: comparisonData.map((item) => ({ label: item.date, value: item.profit })),
                color: '#10b981',
              },
            ]}
            height={350}
          />
        )}
      </Card>
    </div>
  );
}
