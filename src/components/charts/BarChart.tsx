import { formatCurrency } from '../../lib/utils';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  showValues?: boolean;
  color?: string;
}

export default function BarChart({ data, height = 300, showValues = true, color = '#10b981' }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const padding = { top: 20, right: 20, bottom: 60, left: 60 };
  const chartWidth = Math.max(data.length * 60, 800);
  const chartHeight = height;
  const barWidth = (chartWidth - padding.left - padding.right) / data.length * 0.7;
  const barSpacing = (chartWidth - padding.left - padding.right) / data.length;

  return (
    <div className="overflow-x-auto">
      <svg width={chartWidth} height={chartHeight} className="font-light">
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = (chartHeight - padding.top - padding.bottom) * (1 - tick);
            return (
              <g key={tick}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth - padding.left - padding.right}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <text
                  x={-10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-xs fill-gray-500"
                >
                  {formatCurrency(maxValue * tick)}
                </text>
              </g>
            );
          })}

          {data.map((item, index) => {
            const barHeight = ((item.value / maxValue) * (chartHeight - padding.top - padding.bottom));
            const x = index * barSpacing + (barSpacing - barWidth) / 2;
            const y = chartHeight - padding.top - padding.bottom - barHeight;

            return (
              <g key={item.label}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx="4"
                  className="transition-all hover:opacity-80"
                />
                {showValues && item.value > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 5}
                    textAnchor="middle"
                    className="text-xs fill-gray-600"
                  >
                    {formatCurrency(item.value)}
                  </text>
                )}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - padding.top - padding.bottom + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
