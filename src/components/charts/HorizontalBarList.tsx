import { formatCurrency } from '../../lib/utils';

interface DataPoint {
  label: string;
  value: number;
}

interface HorizontalBarListProps {
  data: DataPoint[];
  title?: string;
}

export default function HorizontalBarList({ data, title }: HorizontalBarListProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-medium text-gray-700">{title}</h3>}
      <div className="space-y-3">
        {data.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;

          return (
            <div key={index} className="flex items-center gap-4">
              <div className="w-16 text-xs font-light text-gray-500 flex-shrink-0">
                {item.label}
              </div>
              <div className="flex-1 relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${percentage}%`,
                    background: 'linear-gradient(to right, #14b8a6, #1e40af)',
                  }}
                />
              </div>
              <div className="w-24 text-sm font-light text-gray-800 text-right flex-shrink-0">
                {formatCurrency(item.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
