import { eachDayOfInterval, format, subDays, parseISO, isValid } from 'date-fns';
import type { LedgerEntry, OrderEntry, DateRange, SkuForecast, DailyPoint } from '../types';

const AVG_PERIODS = [7, 15, 30, 60, 90] as const;
type AvgPeriod = typeof AVG_PERIODS[number];

// Returns null when the range is not yet fully specified (custom with missing dates).
function getDateBounds(range: DateRange): { start: Date; end: Date } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range.option === 'custom') {
    if (!range.customStart || !range.customEnd) return null;
    const start = parseISO(range.customStart);
    const end = parseISO(range.customEnd);
    if (!isValid(start) || !isValid(end) || start > end) return null;
    return { start, end };
  }

  const days = Number(range.option); // '30' | '60' | '90' → safe
  return { start: subDays(today, days - 1), end: today };
}

export function computeForecasts(
  ledger: LedgerEntry[],
  orders: OrderEntry[],
  range: DateRange
): SkuForecast[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bounds = getDateBounds(range);
  if (!bounds) return []; // custom range not yet fully specified

  const { start, end } = bounds;
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  // All days in the selected period (for summary stats)
  const allDays = eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
  const totalDays = allDays.length;

  // Selected-range maps — used for totalUnitsSold / oosDays / inStockDays
  const ledgerMap = new Map<string, number>();
  for (const e of ledger) {
    if (e.date >= startStr && e.date <= endStr) {
      ledgerMap.set(`${e.date}|${e.sku}`, e.onHandQty);
    }
  }

  const ordersBySku = new Map<string, Map<string, number>>();
  const revenueBySku = new Map<string, Map<string, number>>();
  for (const e of orders) {
    if (e.date >= startStr && e.date <= endStr) {
      let m = ordersBySku.get(e.sku);
      if (!m) { m = new Map(); ordersBySku.set(e.sku, m); }
      m.set(e.date, (m.get(e.date) ?? 0) + e.unitsSold);

      let r = revenueBySku.get(e.sku);
      if (!r) { r = new Map(); revenueBySku.set(e.sku, r); }
      r.set(e.date, (r.get(e.date) ?? 0) + e.revenue);
    }
  }

  // Whether the imported Orders CSV contained a price column (same flag for all entries)
  const hasPriceData = orders.some(e => e.priceFound);

  // Full-dataset maps — used for the fixed-period averages (7/15/30/60/90 days)
  const fullLedgerMap = new Map<string, number>();
  for (const e of ledger) fullLedgerMap.set(`${e.date}|${e.sku}`, e.onHandQty);

  const fullOrdersBySku = new Map<string, Map<string, number>>();
  for (const e of orders) {
    let m = fullOrdersBySku.get(e.sku);
    if (!m) { m = new Map(); fullOrdersBySku.set(e.sku, m); }
    m.set(e.date, (m.get(e.date) ?? 0) + e.unitsSold);
  }

  // Pre-compute window day lists for each period (same for all SKUs)
  const periodWindows = new Map<AvgPeriod, string[]>();
  for (const p of AVG_PERIODS) {
    periodWindows.set(
      p,
      eachDayOfInterval({ start: subDays(today, p - 1), end: today }).map((d) =>
        format(d, 'yyyy-MM-dd')
      )
    );
  }

  // OOS-adjusted average for a SKU over a pre-computed window
  function adjAvg(sku: string, windowDays: string[]): number {
    let oosDays = 0;
    let totalUnits = 0;
    const skuOrderMap = fullOrdersBySku.get(sku);
    for (const day of windowDays) {
      const qty = fullLedgerMap.get(`${day}|${sku}`);
      if (qty !== undefined && qty === 0) oosDays++;
      if (skuOrderMap) totalUnits += skuOrderMap.get(day) ?? 0;
    }
    const inStockDays = windowDays.length - oosDays;
    return inStockDays > 0 ? Math.round((totalUnits / inStockDays) * 100) / 100 : 0;
  }

  // Per-SKU metadata (ASIN, FNSKU, Country Code)
  const skuMeta = new Map<string, { asin: string; fnsku: string; countryCode: string }>();
  function mergeMeta(sku: string, asin: string, fnsku: string, countryCode: string) {
    const existing = skuMeta.get(sku);
    if (!existing) {
      skuMeta.set(sku, { asin, fnsku, countryCode });
    } else {
      if (!existing.asin && asin) existing.asin = asin;
      if (!existing.fnsku && fnsku) existing.fnsku = fnsku;
      if (!existing.countryCode && countryCode) existing.countryCode = countryCode;
    }
  }
  for (const e of ledger) mergeMeta(e.sku, e.asin, e.fnsku, e.countryCode);
  for (const e of orders) mergeMeta(e.sku, e.asin, e.fnsku, e.countryCode);

  // Collect all SKUs present in either dataset (within the selected range)
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

    // OOS days within the selected range
    const oosDateSet = new Set<string>();
    for (const day of allDays) {
      const qty = ledgerMap.get(`${day}|${sku}`);
      if (qty !== undefined && qty === 0) oosDateSet.add(day);
    }

    const oosDays = oosDateSet.size;
    const inStockDays = totalDays - oosDays;

    const skuRevMap = revenueBySku.get(sku);
    const totalRevenue = skuRevMap
      ? Array.from(skuRevMap.values()).reduce((s, v) => s + v, 0)
      : 0;

    // Daily units + revenue + OOS flag for each day in the selected range (for chart)
    const dailyData: DailyPoint[] = allDays.map((date) => ({
      date,
      units: ordersBySku.get(sku)?.get(date) ?? 0,
      revenue: skuRevMap?.get(date) ?? 0,
      isOos: oosDateSet.has(date),
    }));

    const meta = skuMeta.get(sku) ?? { asin: '', fnsku: '', countryCode: '' };

    results.push({
      sku,
      asin: meta.asin,
      fnsku: meta.fnsku,
      countryCode: meta.countryCode,
      totalUnitsSold,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      hasPriceData,
      oosDays,
      inStockDays,
      avg7:  adjAvg(sku, periodWindows.get(7)!),
      avg15: adjAvg(sku, periodWindows.get(15)!),
      avg30: adjAvg(sku, periodWindows.get(30)!),
      avg60: adjAvg(sku, periodWindows.get(60)!),
      avg90: adjAvg(sku, periodWindows.get(90)!),
      oosDateSet,
      dailyData,
    });
  }

  return results;
}
