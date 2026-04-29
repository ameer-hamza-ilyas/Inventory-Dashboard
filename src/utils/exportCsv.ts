import type { SkuForecast, WeightConfig } from '../types';
import { DEFAULT_WEIGHT } from '../types';

function computeWeightedAvg(f: SkuForecast, w: WeightConfig): number {
  return (
    f.avg7  * w.w7  / 100 +
    f.avg15 * w.w15 / 100 +
    f.avg30 * w.w30 / 100 +
    f.avg60 * w.w60 / 100 +
    f.avg90 * w.w90 / 100
  );
}

export function exportForecastCsv(
  forecasts: SkuForecast[],
  weightConfigs: Record<string, WeightConfig> = {},
): void {
  const headers = [
    'SKU',
    'ASIN',
    'FNSKU',
    'Country Code',
    'Total Units Sold',
    'Revenue',
    'Out-of-Stock Days',
    'In-Stock Days',
    '7-Day Avg',
    '15-Day Avg',
    '30-Day Avg',
    '60-Day Avg',
    '90-Day Avg',
    'Weight 7d (%)',
    'Weight 15d (%)',
    'Weight 30d (%)',
    'Weight 60d (%)',
    'Weight 90d (%)',
    'Weighted Forecast Average',
  ];

  const rows = forecasts.map((f) => {
    const w = weightConfigs[f.sku] ?? DEFAULT_WEIGHT;
    const weighted = computeWeightedAvg(f, w);
    return [
      f.sku,
      f.asin,
      f.fnsku,
      f.countryCode,
      f.totalUnitsSold,
      f.hasPriceData ? f.totalRevenue.toFixed(2) : '',
      f.oosDays,
      f.inStockDays,
      f.avg7.toFixed(2),
      f.avg15.toFixed(2),
      f.avg30.toFixed(2),
      f.avg60.toFixed(2),
      f.avg90.toFixed(2),
      w.w7,
      w.w15,
      w.w30,
      w.w60,
      w.w90,
      weighted.toFixed(2),
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sales_forecast_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
