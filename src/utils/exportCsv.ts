import type { SkuForecast } from '../types';

export function exportForecastCsv(forecasts: SkuForecast[]): void {
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
  ];

  const rows = forecasts.map((f) => [
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
