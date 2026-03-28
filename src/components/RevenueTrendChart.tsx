import { useState, useEffect } from 'react';
import OshaliLoader from './OshaliLoader';
import { TrendingUp } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import Card from './ui/Card';

interface ChartData {
  date: string;
  revenue: number;
  count: number;
}

export default function RevenueTrendChart() {
  const [dateRangeStart, setDateRangeStart] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
  );
  const [dateRangeEnd, setDateRangeEnd] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [dateRangeRevenueType, setDateRangeRevenueType] = useState<'realized' | 'unrealized' | 'all'>('all');
  const [dateRangeRevenueData, setDateRangeRevenueData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDateRangeRevenue();
  }, [dateRangeStart, dateRangeEnd, dateRangeRevenueType]);

  const fetchDateRangeRevenue = async () => {
    setLoading(true);
    try {
      const startDate = startOfDay(new Date(dateRangeStart));
      const endDate = endOfDay(new Date(dateRangeEnd));
      const dailyRevenueMap: Record<string, number> = {};

      if (dateRangeRevenueType === 'realized') {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount, created_at')
          .eq('status', 'settled')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true })
          .limit(50000);

        invoices?.forEach(invoice => {
          const day = format(new Date(invoice.created_at), 'yyyy-MM-dd');
          dailyRevenueMap[day] = (dailyRevenueMap[day] || 0) + (Number(invoice.total_amount) || 0);
        });

      } else if (dateRangeRevenueType === 'unrealized') {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount, created_at')
          .eq('status', 'unsettled')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true })
          .limit(50000);

        invoices?.forEach(invoice => {
          const day = format(new Date(invoice.created_at), 'yyyy-MM-dd');
          dailyRevenueMap[day] = (dailyRevenueMap[day] || 0) + (Number(invoice.total_amount) || 0);
        });

      } else {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total_amount, created_at')
          .in('status', ['settled', 'unsettled'])
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true })
          .limit(50000);

        invoices?.forEach(invoice => {
          const day = format(new Date(invoice.created_at), 'yyyy-MM-dd');
          dailyRevenueMap[day] = (dailyRevenueMap[day] || 0) + (Number(invoice.total_amount) || 0);
        });
      }

      const chartData: ChartData[] = [];
      const start = new Date(dateRangeStart);
      const end = new Date(dateRangeEnd);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = format(d, 'yyyy-MM-dd');
        chartData.push({
          date: format(d, 'MMM dd'),
          revenue: dailyRevenueMap[dateStr] || 0,
          count: 0
        });
      }

      setDateRangeRevenueData(chartData);
    } catch (error) {
      console.error('Error fetching date range revenue:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = dateRangeRevenueData.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700">Revenue Trend</h3>
              <p className="text-xs font-light text-gray-500">Daily revenue over selected period</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-light text-gray-500">Total Revenue</p>
            <p className="text-xl font-light text-emerald-600">
              {formatCurrency(totalRevenue)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium">From:</label>
            <input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
              max={dateRangeEnd}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 h-7"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium">To:</label>
            <input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              min={dateRangeStart}
              max={format(new Date(), 'yyyy-MM-dd')}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 h-7"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
            <button
              onClick={() => setDateRangeRevenueType('realized')}
              className={`px-2 py-1 text-xs font-light rounded transition-all ${
                dateRangeRevenueType === 'realized'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              Realized
            </button>
            <button
              onClick={() => setDateRangeRevenueType('unrealized')}
              className={`px-2 py-1 text-xs font-light rounded transition-all ${
                dateRangeRevenueType === 'unrealized'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              Unrealized
            </button>
            <button
              onClick={() => setDateRangeRevenueType('all')}
              className={`px-2 py-1 text-xs font-light rounded transition-all ${
                dateRangeRevenueType === 'all'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {loading ? (
          <OshaliLoader variant="inline" />
        ) : dateRangeRevenueData.length === 0 ? (
          <div className="text-center py-12 text-sm font-light text-gray-400">
            No data available for the selected period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dateRangeRevenueData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f0f0f0"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="#999"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#999"
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 300
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
