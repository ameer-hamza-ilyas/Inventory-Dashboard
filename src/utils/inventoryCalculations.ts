import { LedgerEntry, OrderEntry, DateRange } from '../types';
import { subDays, startOfDay } from 'date-fns';

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h >>> 0);
}

const CATEGORIES = ['Electronics', 'Home & Garden', 'Sports & Outdoors', 'Beauty', 'Toys & Games', 'Office Supplies', 'Kitchen', 'Apparel'];
const SUPPLIERS  = ['Global Supply Co.', 'Pacific Trade Ltd.', 'Eastern Goods Inc.', 'Prime Source LLC', 'Atlas Distribution Co.'];

function mockCost(sku: string)     { return 8 + (hash(sku) % 87); }
function mockStorage(sku: string)  { return parseFloat((0.5 + (hash(sku + 's') % 200) / 100).toFixed(2)); }
function mockHandling(sku: string) { return parseFloat((0.3 + (hash(sku + 'h') % 80) / 100).toFixed(2)); }
function mockCategory(sku: string) { return CATEGORIES[hash(sku) % CATEGORIES.length]; }
function mockSupplier(sku: string) { return SUPPLIERS[hash(sku) % SUPPLIERS.length]; }
function mockLeadTime(sku: string) { return [7, 10, 14, 21, 30][hash(sku) % 5]; }
function mockOnTime(sku: string)   { return 70 + (hash(sku + 'ot') % 30); }
function mockQuality(sku: string)  { return 70 + (hash(sku + 'q') % 30); }
function mockInbound(qty: number, sku: string) { return Math.floor(qty * (0.1 + (hash(sku + 'ib') % 40) / 100)); }
function mockReserve(qty: number, sku: string) { return Math.floor(qty * (0.05 + (hash(sku + 'rs') % 20) / 100)); }
function mockPOs(sku: string)      { return 1 + (hash(sku + 'po') % 4); }

export interface SkuInventoryData {
  sku: string; asin: string; fnsku: string; countryCode: string;
  onHandQty: number; inboundQty: number; reserveQty: number;
  unitsSold: number; revenue: number; hasPriceData: boolean;
  avgDailySales: number; daysOfSupply: number;
  stockoutRiskDays: number; oosFrequencyPct: number;
  inStockDays: number; oosDays: number;
  costPerUnit: number; storageCostPerUnit: number; handlingCostPerUnit: number;
  totalCostPerUnit: number; totalInventoryValue: number;
  category: string; supplier: string; leadTimeDays: number;
  onTimeDeliveryRate: number; qualityScore: number;
  reorderQty: number; optimalStock: number; poCount: number; totalPOValue: number;
  turnoverRatio: number;
  abcClass: 'A' | 'B' | 'C';
  velocityClass: 'fast' | 'normal' | 'slow' | 'dead';
  stockStatus: 'critical' | 'warning' | 'healthy' | 'overstock';
  stockVsOptimal: 'understocked' | 'optimal' | 'overstocked';
}

export interface CategorySummary {
  category: string; skuCount: number; onHandValue: number;
  unitsSold: number; turnoverRatio: number; stockoutRiskCount: number;
}

export interface SupplierSummary {
  supplier: string; skuCount: number; onTimeDeliveryRate: number;
  avgLeadTime: number; qualityScore: number; totalPOValue: number;
}

export interface ABCSummary {
  class: 'A' | 'B' | 'C'; skuCount: number; unitsSold: number;
  revenue: number; onHandValue: number; pctRevenue: number;
}

export interface PerformanceMetrics {
  inventoryAccuracyRate: number; fulfillmentRate: number;
  stockoutFrequency: number; excessStockPct: number;
}

export interface InventorySummary {
  skus: SkuInventoryData[];
  totalOnHandQty: number; totalOnHandValue: number;
  totalInboundQty: number; totalReserveQty: number;
  openPOs: number; poBalance: number; hasPriceData: boolean;
  categoryBreakdown: CategorySummary[];
  supplierBreakdown: SupplierSummary[];
  abcBreakdown: ABCSummary[];
  performance: PerformanceMetrics;
}

export function computeInventoryMetrics(
  ledger: LedgerEntry[],
  orders: OrderEntry[],
  dateRange: DateRange
): InventorySummary {
  const hasPriceData = orders.some(o => o.priceFound);
  const today = startOfDay(new Date());

  const fromDate = (dateRange.option === 'custom' && dateRange.customStart)
    ? dateRange.customStart
    : subDays(today, parseInt(dateRange.option === 'custom' ? '30' : dateRange.option))
        .toISOString().slice(0, 10);
  const toDate = (dateRange.option === 'custom' && dateRange.customEnd)
    ? dateRange.customEnd
    : today.toISOString().slice(0, 10);
  const totalDays = Math.max(1, Math.round(
    (new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000
  ));

  // Latest on-hand per SKU across all ledger data
  const latestLedger = new Map<string, LedgerEntry>();
  for (const e of ledger) {
    const ex = latestLedger.get(e.sku);
    if (!ex || e.date > ex.date) latestLedger.set(e.sku, e);
  }

  // Aggregate orders within date range
  interface OrdAgg { units: number; revenue: number; asin: string; fnsku: string; countryCode: string; }
  const orderAgg = new Map<string, OrdAgg>();
  for (const o of orders) {
    if (o.date < fromDate || o.date > toDate) continue;
    const ex = orderAgg.get(o.sku);
    if (ex) { ex.units += o.unitsSold; ex.revenue += o.revenue; }
    else orderAgg.set(o.sku, { units: o.unitsSold, revenue: o.revenue, asin: o.asin, fnsku: o.fnsku, countryCode: o.countryCode });
  }

  // OOS / in-stock day counts from ledger within date range
  const oosDaysMap    = new Map<string, number>();
  const inStockDaysMap = new Map<string, number>();
  for (const e of ledger) {
    if (e.date < fromDate || e.date > toDate) continue;
    if (e.onHandQty === 0) oosDaysMap.set(e.sku, (oosDaysMap.get(e.sku) ?? 0) + 1);
    else inStockDaysMap.set(e.sku, (inStockDaysMap.get(e.sku) ?? 0) + 1);
  }

  const allSkus = new Set([...latestLedger.keys(), ...orderAgg.keys()]);
  const skus: SkuInventoryData[] = [];

  for (const sku of allSkus) {
    const le  = latestLedger.get(sku);
    const ord = orderAgg.get(sku);
    const onHandQty  = le?.onHandQty ?? 0;
    const unitsSold  = ord?.units ?? 0;
    const revenue    = ord?.revenue ?? 0;
    const oosDays    = oosDaysMap.get(sku) ?? 0;
    const inStockDays = inStockDaysMap.get(sku) ?? Math.max(0, totalDays - oosDays);
    const oosFrequencyPct = totalDays > 0 ? Math.round((oosDays / totalDays) * 100) : 0;

    const avgDailySales = inStockDays > 0 ? unitsSold / inStockDays : 0;
    const daysOfSupply  = avgDailySales > 0 ? Math.round(onHandQty / avgDailySales) : (onHandQty > 0 ? 999 : 0);
    const stockoutRiskDays = daysOfSupply;

    const costPerUnit      = mockCost(sku);
    const storageCostPerUnit  = mockStorage(sku);
    const handlingCostPerUnit = mockHandling(sku);
    const totalCostPerUnit    = costPerUnit + storageCostPerUnit + handlingCostPerUnit;
    const totalInventoryValue = onHandQty * costPerUnit;

    const inboundQty = mockInbound(onHandQty, sku);
    const reserveQty = mockReserve(onHandQty, sku);
    const poCount    = mockPOs(sku);
    const totalPOValue = poCount * inboundQty * costPerUnit;

    const leadTimeDays = mockLeadTime(sku);
    const optimalStock = avgDailySales > 0
      ? Math.ceil(avgDailySales * (leadTimeDays + 14))
      : Math.ceil(onHandQty * 1.2);
    const reorderQty = Math.max(50, Math.ceil(avgDailySales * 30));
    const turnoverRatio = parseFloat((unitsSold / Math.max(onHandQty, 1)).toFixed(2));

    const velocityClass: SkuInventoryData['velocityClass'] =
      unitsSold === 0 ? 'dead'
      : avgDailySales < 0.5 ? 'slow'
      : avgDailySales > 5   ? 'fast'
      : 'normal';

    const stockStatus: SkuInventoryData['stockStatus'] =
      onHandQty === 0 || daysOfSupply <= 7 ? 'critical'
      : daysOfSupply <= 14 ? 'warning'
      : daysOfSupply > 90  ? 'overstock'
      : 'healthy';

    const stockVsOptimal: SkuInventoryData['stockVsOptimal'] =
      optimalStock === 0 ? 'optimal'
      : onHandQty < optimalStock * 0.8  ? 'understocked'
      : onHandQty > optimalStock * 1.5  ? 'overstocked'
      : 'optimal';

    skus.push({
      sku,
      asin: le?.asin ?? ord?.asin ?? '',
      fnsku: le?.fnsku ?? ord?.fnsku ?? '',
      countryCode: le?.countryCode ?? ord?.countryCode ?? '',
      onHandQty, inboundQty, reserveQty,
      unitsSold, revenue, hasPriceData,
      avgDailySales: parseFloat(avgDailySales.toFixed(2)),
      daysOfSupply, stockoutRiskDays, oosFrequencyPct, inStockDays, oosDays,
      costPerUnit, storageCostPerUnit, handlingCostPerUnit,
      totalCostPerUnit: parseFloat(totalCostPerUnit.toFixed(2)), totalInventoryValue,
      category: mockCategory(sku), supplier: mockSupplier(sku), leadTimeDays,
      onTimeDeliveryRate: mockOnTime(sku), qualityScore: mockQuality(sku),
      reorderQty, optimalStock, poCount, totalPOValue,
      turnoverRatio, abcClass: 'B', // assigned below
      velocityClass, stockStatus, stockVsOptimal,
    });
  }

  // ABC by revenue (or units if no price data)
  const metricFn = (s: SkuInventoryData) => hasPriceData ? s.revenue : s.unitsSold;
  const sorted = [...skus].sort((a, b) => metricFn(b) - metricFn(a));
  const totalMetric = sorted.reduce((s, x) => s + metricFn(x), 0);
  let cum = 0;
  for (const s of sorted) {
    cum += metricFn(s);
    const pct = totalMetric > 0 ? cum / totalMetric : 1;
    s.abcClass = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
  }

  // Totals
  const totalOnHandQty   = skus.reduce((s, x) => s + x.onHandQty, 0);
  const totalOnHandValue = skus.reduce((s, x) => s + x.totalInventoryValue, 0);
  const totalInboundQty  = skus.reduce((s, x) => s + x.inboundQty, 0);
  const totalReserveQty  = skus.reduce((s, x) => s + x.reserveQty, 0);
  const openPOs          = skus.reduce((s, x) => s + x.poCount, 0);
  const poBalance        = skus.reduce((s, x) => s + x.totalPOValue, 0);

  // Category breakdown
  const catMap = new Map<string, CategorySummary>();
  for (const s of skus) {
    const ex = catMap.get(s.category) ?? { category: s.category, skuCount: 0, onHandValue: 0, unitsSold: 0, turnoverRatio: 0, stockoutRiskCount: 0 };
    ex.skuCount++;
    ex.onHandValue += s.totalInventoryValue;
    ex.unitsSold   += s.unitsSold;
    if (s.stockoutRiskDays <= 14 && s.stockoutRiskDays > 0) ex.stockoutRiskCount++;
    catMap.set(s.category, ex);
  }
  const categoryBreakdown: CategorySummary[] = Array.from(catMap.values()).map(c => ({
    ...c,
    turnoverRatio: parseFloat((c.unitsSold / Math.max(c.onHandValue / 20, 1)).toFixed(2)),
  }));

  // Supplier breakdown
  const supMap = new Map<string, SkuInventoryData[]>();
  for (const s of skus) {
    const ex = supMap.get(s.supplier) ?? [];
    ex.push(s);
    supMap.set(s.supplier, ex);
  }
  const supplierBreakdown: SupplierSummary[] = Array.from(supMap.entries()).map(([sup, items]) => ({
    supplier: sup,
    skuCount: items.length,
    onTimeDeliveryRate: Math.round(items.reduce((s, x) => s + x.onTimeDeliveryRate, 0) / items.length),
    avgLeadTime: Math.round(items.reduce((s, x) => s + x.leadTimeDays, 0) / items.length),
    qualityScore: Math.round(items.reduce((s, x) => s + x.qualityScore, 0) / items.length),
    totalPOValue: items.reduce((s, x) => s + x.totalPOValue, 0),
  }));

  // ABC breakdown
  const abcBuckets: Record<'A' | 'B' | 'C', SkuInventoryData[]> = { A: [], B: [], C: [] };
  for (const s of skus) abcBuckets[s.abcClass].push(s);
  const totalRev   = skus.reduce((s, x) => s + x.revenue, 0);
  const abcBreakdown: ABCSummary[] = (['A', 'B', 'C'] as const).map(cls => ({
    class: cls,
    skuCount: abcBuckets[cls].length,
    unitsSold: abcBuckets[cls].reduce((s, x) => s + x.unitsSold, 0),
    revenue: abcBuckets[cls].reduce((s, x) => s + x.revenue, 0),
    onHandValue: abcBuckets[cls].reduce((s, x) => s + x.totalInventoryValue, 0),
    pctRevenue: totalRev > 0
      ? parseFloat(((abcBuckets[cls].reduce((s, x) => s + x.revenue, 0) / totalRev) * 100).toFixed(1))
      : 0,
  }));

  // Performance
  const criticalCount = skus.filter(s => s.stockStatus === 'critical').length;
  const excessCount   = skus.filter(s => s.daysOfSupply > 90).length;
  const oosSkuCount   = skus.filter(s => s.oosDays > 0).length;
  const performance: PerformanceMetrics = {
    inventoryAccuracyRate: 85 + (hash('acc' + String(skus.length)) % 13),
    fulfillmentRate: skus.length > 0 ? Math.round(((skus.length - criticalCount) / skus.length) * 100) : 100,
    stockoutFrequency: skus.length > 0 ? Math.round((oosSkuCount / skus.length) * 100) : 0,
    excessStockPct: skus.length > 0 ? Math.round((excessCount / skus.length) * 100) : 0,
  };

  return {
    skus, totalOnHandQty, totalOnHandValue, totalInboundQty, totalReserveQty,
    openPOs, poBalance, hasPriceData,
    categoryBreakdown, supplierBreakdown, abcBreakdown, performance,
  };
}
