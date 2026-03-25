import { formatNumber } from '../lib/utils';

interface InventoryItem {
  id: string;
  gr_number: string;
  remaining_liters: number;
  cost_per_liter: number;
  color: string;
}

interface TankVisualizationProps {
  tankName: string;
  capacity: number;
  currentLiters: number;
  items: InventoryItem[];
  lowThreshold?: number;
  highThreshold?: number;
  criticalThreshold?: number;
}

const GRADIENT_COLORS = [
  '#0ea5e9',
  '#06b6d4',
  '#14b8a6',
  '#10b981',
  '#22c55e',
  '#84cc16',
];

export default function TankVisualization({
  tankName,
  capacity,
  currentLiters,
  items,
  lowThreshold = 20,
  highThreshold = 90,
  criticalThreshold = 10,
}: TankVisualizationProps) {
  const fillPercentage = (currentLiters / capacity) * 100;
  const isCritical = fillPercentage < criticalThreshold;
  const isLow = fillPercentage >= criticalThreshold && fillPercentage < lowThreshold;
  const isHigh = fillPercentage > highThreshold;
  const isNormal = !isCritical && !isLow && !isHigh;

  const itemsWithColors = items.map((item, index) => ({
    ...item,
    color: GRADIENT_COLORS[index % GRADIENT_COLORS.length],
    percentage: (item.remaining_liters / capacity) * 100,
  }));

  const getStatusColor = () => {
    if (isCritical) return '#dc2626';
    if (isLow) return '#f59e0b';
    if (isHigh) return '#f97316';
    return '#10b981';
  };

  const getFillColor = () => {
    if (itemsWithColors.length > 0 && fillPercentage > 0) {
      const gradientStops = itemsWithColors.map((item, i) => {
        const prevPercentages = itemsWithColors
          .slice(0, i)
          .reduce((sum, it) => sum + it.percentage, 0);
        const start = (prevPercentages / fillPercentage) * 100;
        const end = ((prevPercentages + item.percentage) / fillPercentage) * 100;
        return `${item.color} ${start}%, ${item.color} ${end}%`;
      });
      return `linear-gradient(to top, ${gradientStops.join(', ')})`;
    }

    if (isCritical) return '#ef4444';
    if (isLow) return '#f59e0b';
    if (isHigh) return '#f97316';
    return '#0ea5e9';
  };

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col justify-between text-[10px] text-gray-400 font-light h-64 pt-2 pb-2">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>

      <div className="flex flex-col items-center">
        <div className="text-lg font-light text-gray-700 mb-2">{tankName}</div>

        <div className="relative w-32 h-64 bg-gray-50 rounded-b-3xl overflow-hidden border-2 border-gray-300 shadow-sm">
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: `${fillPercentage}%`,
              background: getFillColor(),
            }}
          >
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: 'linear-gradient(to right, transparent 0%, white 50%, transparent 100%)',
              }}
            />
          </div>

          {[
            { value: criticalThreshold, color: '#dc2626' },
            { value: lowThreshold, color: '#f59e0b' },
            { value: highThreshold, color: '#f97316' },
          ].map(({ value, color }) => (
            <div
              key={value}
              className="absolute left-0 right-0 border-t border-dashed"
              style={{
                bottom: `${value}%`,
                borderColor: color,
                opacity: 0.5,
                borderWidth: '1px',
              }}
            >
              <div
                className="absolute -right-8 -top-2 text-[10px] font-light"
                style={{ color }}
              >
                {value}%
              </div>
            </div>
          ))}

          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <div className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm">
              <div className="text-base font-light text-gray-800">
                {fillPercentage.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: getStatusColor() }}
          />
          <div className="text-xs font-light text-gray-600">
            {formatNumber(currentLiters)}L / {formatNumber(capacity)}L
          </div>
        </div>

        {itemsWithColors.length > 0 && (
          <div className="mt-3 space-y-1.5 w-full max-w-[160px]">
            {itemsWithColors.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-[11px] font-light">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-gray-700 truncate flex-1">{item.gr_number}</span>
                <span className="text-gray-400">{formatNumber(item.remaining_liters)}L</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
