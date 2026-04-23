import { eachDayOfInterval, format, subDays, parseISO } from 'date-fns';
import type { LedgerEntry, OrderEntry, DateRange, SkuForecast } from '../types';

function getDateBounds(range: DateRange): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range.option === 'custom' && range.customStart && range.customEnd) {
    return {
      start: parseISO(range.customStart),
      end: parseISO(range.customEnd),
    };
  }

  const days = Number(range.option);
  return { start: subDays(today, days - 1), end: today };
}

export function computeForecasts(
  ledger: LedgerEntry[],
  orders: OrderEntry[],
  range: DateRange
): SkuForecast[] {
  const { start, end } = getDateBounds(range);

  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  // All days in the selected period
  const allDays = eachDayOfInterval({ start, end }).map((d) =>
    format(d, 'yyyy-MM-dd')
  );
  const totalDays = allDays.length;

  // Build ledger lookup: date+sku → onHandQty
  const ledgerMap = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.date >= startStr && entry.date <= endStr) {
      ledgerMap.set(`${entry.date}|${entry.sku}`, entry.onHandQty);
    }
  }

  // Build orders lookup: sku → { date → units }
  const ordersBySku = new Map<string, Map<string, number>>();
  for (const entry of orders) {
    if (entry.date >= startStr && entry.date <= endStr) {
      let skuMap = ordersBySku.get(entry.sku);
      if (!skuMap) {
        skuMap = new Map();
        ordersBySku.set(entry.sku, skuMap);
      }
      skuMap.set(entry.date, (skuMap.get(entry.date) ?? 0) + entry.unitsSold);
    }
  }

  // Collect all SKUs present in either dataset
  const allSkus = new Set<string>([
    ...Array.from(ledgerMap.keys()).map((k) => k.split('|')[1]!),
    ...Array.from(ordersBySku.keys()),
  ]);

  const results: SkuForecast[] = [];

  for (const sku of allSkus) {
    const skuOrders = ordersBySku.get(sku);
    const totalUnitsSold = skuOrders
      ? Array.from(skuOrders.values()).reduce((s, v) => s + v, 0)
      : 0;

    // OOS: days where ledger explicitly records onHandQty = 0
    const oosDateSet = new Set<string>();
    for (const day of allDays) {
      const key = `${day}|${sku}`;
      if (ledgerMap.has(key) && ledgerMap.get(key)! === 0) {
        oosDateSet.add(day);
      }
    }

    const oosDays = oosDateSet.size;
    const inStockDays = totalDays - oosDays;

    const adjustedDailyAvg =
      inStockDays > 0 ? totalUnitsSold / inStockDays : 0;

    results.push({
      sku,
      totalUnitsSold,
      oosDays,
      inStockDays,
      adjustedDailyAvg: Math.round(adjustedDailyAvg * 100) / 100,
      forecast30: Math.round(adjustedDailyAvg * 30),
      forecast60: Math.round(adjustedDailyAvg * 60),
      forecast90: Math.round(adjustedDailyAvg * 90),
      oosDateSet,
    });
  }

  return results;
}
