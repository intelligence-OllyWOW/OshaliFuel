import { useState } from 'react';
import { formatCurrency } from '../../lib/utils';

interface DataSeries {
  label: string;
  data: { label: string; value: number }[];
  color: string;
}

interface LineChartProps {
  series: DataSeries[];
  height?: number;
}

interface TooltipData {
  x: number;
  y: number;
  label: string;
  seriesLabel: string;
  value: number;
  color: string;
}

export default function LineChart({ series, height = 300 }: LineChartProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const allValues = series.flatMap((s) => s.data.map((d) => d.value));
  const maxValue = Math.max(...allValues, 1);
  const labels = series[0]?.data.map((d) => d.label) || [];

  const padding = { top: 40, right: 80, bottom: 60, left: 60 };
  const chartWidth = Math.max(labels.length * 80, 800);
  const chartHeight = height;
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const xStep = plotWidth / (labels.length - 1 || 1);

  return (
    <div className="overflow-x-auto relative">
      <svg width={chartWidth} height={chartHeight} className="font-light">
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = plotHeight * (1 - tick);
            return (
              <g key={tick}>
                <line
                  x1={0}
                  y1={y}
                  x2={plotWidth}
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

          {labels.map((label, index) => {
            const x = index * xStep;
            return (
              <text
                key={label}
                x={x}
                y={plotHeight + 20}
                textAnchor="middle"
                className="text-xs fill-gray-600"
              >
                {label}
              </text>
            );
          })}

          {series.map((s, seriesIndex) => {
            const points = s.data.map((d, i) => ({
              x: i * xStep,
              y: plotHeight - (d.value / maxValue) * plotHeight,
            }));

            const pathData = points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');

            return (
              <g key={seriesIndex}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  className="transition-all"
                />
                {points.map((point, i) => (
                  <circle
                    key={i}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={s.color}
                    className="transition-all cursor-pointer hover:r-6"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                      if (svgRect) {
                        setTooltip({
                          x: point.x + padding.left,
                          y: point.y + padding.top,
                          label: s.data[i].label,
                          seriesLabel: s.label,
                          value: s.data[i].value,
                          color: s.color,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
            );
          })}

          {series.map((s, index) => (
            <g key={index} transform={`translate(${plotWidth + 20}, ${index * 25})`}>
              <rect width="12" height="12" fill={s.color} rx="2" />
              <text x="20" y="10" className="text-xs fill-gray-700">
                {s.label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y - 60}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="text-xs font-medium text-gray-900">{tooltip.label}</div>
          <div className="flex items-center gap-2 mt-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: tooltip.color }}
            />
            <span className="text-xs text-gray-600">{tooltip.seriesLabel}:</span>
            <span className="text-xs font-medium text-gray-900">
              {formatCurrency(tooltip.value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
