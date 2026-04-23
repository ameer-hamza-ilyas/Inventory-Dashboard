import type { SkuForecast } from '../types';

export function exportForecastCsv(forecasts: SkuForecast[]): void {
  const headers = [
    'SKU',
    'Total Units Sold',
    'Out-of-Stock Days',
    'In-Stock Days',
    'Adjusted Daily Avg',
    '30-Day Forecast',
    '60-Day Forecast',
    '90-Day Forecast',
  ];

  const rows = forecasts.map((f) => [
    f.sku,
    f.totalUnitsSold,
    f.oosDays,
    f.inStockDays,
    f.adjustedDailyAvg.toFixed(2),
    f.forecast30,
    f.forecast60,
    f.forecast90,
  ]);

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
