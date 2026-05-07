import { LedgerEntry, OrderEntry, DateRange, CostPricingEntry, SupplierImportEntry, ParentProductEntry } from '../types';
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
  // ABC classifications
  abcClass: 'A' | 'B' | 'C';       // alias for abcRevClass (backward compat)
  abcRevClass: 'A' | 'B' | 'C';    // by revenue, count-based 20/30/50
  abcProfitClass: 'A' | 'B' | 'C'; // by profit, count-based 20/30/50
  // Profit fields (populated when costPricing data is available)
  sellingPrice: number;
  profitPerUnit: number;   // sellingPrice - costPerUnit
  totalProfit: number;     // profitPerUnit * unitsSold
  hasCostPricingData: boolean;
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

export interface ABCProfitSummary {
  class: 'A' | 'B' | 'C'; skuCount: number;
  totalProfit: number; pctProfit: number;
}

export interface ParentProductSummary {
  parentId: string;
  parentName: string;
  childCount: number;
  children: SkuInventoryData[];
  totalOnHandQty: number;
  totalUnitsSold: number;
  totalRevenue: number;
  totalProfit: number;
  abcRevClass: 'A' | 'B' | 'C';
  abcProfitClass: 'A' | 'B' | 'C';
  pctRevenue: number;
  pctProfit: number;
}

export interface PerformanceMetrics {
  inventoryAccuracyRate: number; fulfillmentRate: number;
  stockoutFrequency: number; excessStockPct: number;
}

export interface InventorySummary {
  skus: SkuInventoryData[];
  totalOnHandQty: number; totalOnHandValue: number;
  totalInboundQty: number; totalReserveQty: number;
  openPOs: number; poBalance: number;
  hasPriceData: boolean; hasCostPricingData: boolean;
  categoryBreakdown: CategorySummary[];
  supplierBreakdown: SupplierSummary[];
  abcBreakdown: ABCSummary[];       // by revenue (backward compat)
  abcByRevenue: ABCSummary[];       // by revenue
  abcByProfit: ABCProfitSummary[];  // by profit
  performance: PerformanceMetrics;
}

// Assign ABC classes using count-based percentile split: top 20% → A, next 30% → B, bottom 50% → C
function assignABCByCount<T>(
  items: T[],
  getMetric: (x: T) => number,
  assign: (x: T, cls: 'A' | 'B' | 'C') => void,
): void {
  const sorted = [...items].sort((a, b) => getMetric(b) - getMetric(a));
  const n = sorted.length;
  if (n === 0) return;
  const aEnd = Math.ceil(n * 0.2);
  const bEnd = Math.ceil(n * 0.5); // 20% + 30%
  sorted.forEach((item, i) => assign(item, i < aEnd ? 'A' : i < bEnd ? 'B' : 'C'));
}

export function computeInventoryMetrics(
  ledger: LedgerEntry[],
  orders: OrderEntry[],
  dateRange: DateRange,
  costPricing: CostPricingEntry[] = [],
  supplierData: SupplierImportEntry[] = [],
): InventorySummary {
  const hasPriceData = orders.some(o => o.priceFound);
  const hasCostPricingData = costPricing.length > 0;
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

  // Build cost pricing lookup
  const costMap = new Map<string, CostPricingEntry>();
  for (const cp of costPricing) costMap.set(cp.sku, cp);

  // Build supplier lookup: sku → supplier entry
  const supplierMap = new Map<string, SupplierImportEntry>();
  for (const s of supplierData) supplierMap.set(s.sku, s);

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
    const cp  = costMap.get(sku);
    const sup = supplierMap.get(sku);

    const onHandQty  = le?.onHandQty ?? 0;
    const unitsSold  = ord?.units ?? 0;
    const revenue    = ord?.revenue ?? 0;
    const oosDays    = oosDaysMap.get(sku) ?? 0;
    const inStockDays = inStockDaysMap.get(sku) ?? Math.max(0, totalDays - oosDays);
    const oosFrequencyPct = totalDays > 0 ? Math.round((oosDays / totalDays) * 100) : 0;

    const avgDailySales = inStockDays > 0 ? unitsSold / inStockDays : 0;
    const daysOfSupply  = avgDailySales > 0 ? Math.round(onHandQty / avgDailySales) : (onHandQty > 0 ? 999 : 0);
    const stockoutRiskDays = daysOfSupply;

    const costPerUnit      = cp?.unitCost ?? mockCost(sku);
    const storageCostPerUnit  = mockStorage(sku);
    const handlingCostPerUnit = mockHandling(sku);
    const totalCostPerUnit    = costPerUnit + storageCostPerUnit + handlingCostPerUnit;
    const totalInventoryValue = onHandQty * costPerUnit;

    const sellingPrice   = cp?.sellingPrice ?? 0;
    const profitPerUnit  = hasCostPricingData ? sellingPrice - costPerUnit : 0;
    const totalProfit    = hasCostPricingData ? Math.max(0, profitPerUnit) * unitsSold : 0;

    const inboundQty = mockInbound(onHandQty, sku);
    const reserveQty = mockReserve(onHandQty, sku);
    const poCount    = mockPOs(sku);
    const totalPOValue = poCount * inboundQty * costPerUnit;

    const leadTimeDays        = sup?.leadTimeDays ?? mockLeadTime(sku);
    const onTimeDeliveryRate  = sup?.onTimeDeliveryRate ?? mockOnTime(sku);
    const qualityScore        = sup?.qualityScore ?? mockQuality(sku);
    const supplier            = sup?.supplierName ?? mockSupplier(sku);

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
      category: mockCategory(sku),
      supplier, leadTimeDays, onTimeDeliveryRate, qualityScore,
      reorderQty, optimalStock, poCount, totalPOValue,
      turnoverRatio,
      sellingPrice, profitPerUnit, totalProfit,
      hasCostPricingData: !!cp,
      abcClass: 'B',       // assigned below
      abcRevClass: 'B',    // assigned below
      abcProfitClass: 'B', // assigned below
      velocityClass, stockStatus, stockVsOptimal,
    });
  }

  // ABC by Revenue (count-based: top 20% → A, next 30% → B, bottom 50% → C)
  const revenueMetric = (s: SkuInventoryData) => hasPriceData ? s.revenue : s.unitsSold;
  assignABCByCount(skus, revenueMetric, (s, cls) => { s.abcRevClass = cls; s.abcClass = cls; });

  // ABC by Profit (only meaningful when costPricing data exists)
  assignABCByCount(skus, s => s.totalProfit, (s, cls) => { s.abcProfitClass = cls; });

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

  // ABC by Revenue breakdown summary
  const abcRevBuckets: Record<'A' | 'B' | 'C', SkuInventoryData[]> = { A: [], B: [], C: [] };
  for (const s of skus) abcRevBuckets[s.abcRevClass].push(s);
  const totalRev = skus.reduce((s, x) => s + x.revenue, 0);
  const abcByRevenue: ABCSummary[] = (['A', 'B', 'C'] as const).map(cls => ({
    class: cls,
    skuCount: abcRevBuckets[cls].length,
    unitsSold: abcRevBuckets[cls].reduce((s, x) => s + x.unitsSold, 0),
    revenue: abcRevBuckets[cls].reduce((s, x) => s + x.revenue, 0),
    onHandValue: abcRevBuckets[cls].reduce((s, x) => s + x.totalInventoryValue, 0),
    pctRevenue: totalRev > 0
      ? parseFloat(((abcRevBuckets[cls].reduce((s, x) => s + x.revenue, 0) / totalRev) * 100).toFixed(1))
      : 0,
  }));

  // ABC by Profit breakdown summary
  const abcProfBuckets: Record<'A' | 'B' | 'C', SkuInventoryData[]> = { A: [], B: [], C: [] };
  for (const s of skus) abcProfBuckets[s.abcProfitClass].push(s);
  const totalProfit = skus.reduce((s, x) => s + x.totalProfit, 0);
  const abcByProfit: ABCProfitSummary[] = (['A', 'B', 'C'] as const).map(cls => ({
    class: cls,
    skuCount: abcProfBuckets[cls].length,
    totalProfit: abcProfBuckets[cls].reduce((s, x) => s + x.totalProfit, 0),
    pctProfit: totalProfit > 0
      ? parseFloat(((abcProfBuckets[cls].reduce((s, x) => s + x.totalProfit, 0) / totalProfit) * 100).toFixed(1))
      : 0,
  }));

  // Keep abcBreakdown as alias for backward compat
  const abcBreakdown = abcByRevenue;

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
    openPOs, poBalance, hasPriceData, hasCostPricingData,
    categoryBreakdown, supplierBreakdown,
    abcBreakdown, abcByRevenue, abcByProfit,
    performance,
  };
}

// ─── Parent Product Summaries ────────────────────────────────────────────────
// Groups SKUs into parent products and assigns ABC classes at the parent level.
export function computeParentSummaries(
  skus: SkuInventoryData[],
  parentProducts: ParentProductEntry[],
): ParentProductSummary[] {
  if (parentProducts.length === 0 || skus.length === 0) return [];

  const skuMap = new Map<string, SkuInventoryData>();
  for (const s of skus) skuMap.set(s.sku, s);

  // Group child SKUs under each parent
  const parentMap = new Map<string, { parentId: string; parentName: string; children: SkuInventoryData[] }>();
  for (const pp of parentProducts) {
    const child = skuMap.get(pp.childSku);
    if (!child) continue;
    const existing = parentMap.get(pp.parentId);
    if (existing) {
      existing.children.push(child);
    } else {
      parentMap.set(pp.parentId, { parentId: pp.parentId, parentName: pp.parentName || pp.parentId, children: [child] });
    }
  }

  if (parentMap.size === 0) return [];

  const summaries: ParentProductSummary[] = Array.from(parentMap.values()).map(({ parentId, parentName, children }) => ({
    parentId,
    parentName,
    childCount: children.length,
    children,
    totalOnHandQty:  children.reduce((s, x) => s + x.onHandQty, 0),
    totalUnitsSold:  children.reduce((s, x) => s + x.unitsSold, 0),
    totalRevenue:    children.reduce((s, x) => s + x.revenue, 0),
    totalProfit:     children.reduce((s, x) => s + x.totalProfit, 0),
    abcRevClass:    'B' as 'A' | 'B' | 'C',
    abcProfitClass: 'B' as 'A' | 'B' | 'C',
    pctRevenue: 0,
    pctProfit: 0,
  }));

  // Assign ABC classes using the same count-based 20/30/50 split
  assignABCByCount(summaries, s => s.totalRevenue, (s, cls) => { s.abcRevClass = cls; });
  assignABCByCount(summaries, s => s.totalProfit,  (s, cls) => { s.abcProfitClass = cls; });

  // Compute percentages
  const totalRev    = summaries.reduce((s, x) => s + x.totalRevenue, 0);
  const totalProfit = summaries.reduce((s, x) => s + x.totalProfit, 0);
  for (const s of summaries) {
    s.pctRevenue = totalRev    > 0 ? parseFloat(((s.totalRevenue / totalRev)       * 100).toFixed(1)) : 0;
    s.pctProfit  = totalProfit > 0 ? parseFloat(((s.totalProfit  / totalProfit)    * 100).toFixed(1)) : 0;
  }

  return summaries;
}
