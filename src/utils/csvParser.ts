import Papa from 'papaparse';
import { format, parseISO, isValid } from 'date-fns';
import type { LedgerEntry, OrderEntry, CostPricingEntry, SupplierImportEntry, ParentProductEntry } from '../types';

type RawRow = Record<string, string>;

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s\-_]+/g, '');
}

function findCol(row: RawRow, candidates: string[]): string | undefined {
  const normalized = Object.keys(row).reduce<Record<string, string>>(
    (acc, k) => { acc[normalizeKey(k)] = k; return acc; },
    {}
  );
  for (const c of candidates) {
    if (normalized[c]) return normalized[c];
  }
  return undefined;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  // Try ISO-like: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const iso = parseISO(trimmed.slice(0, 10));
  if (isValid(iso)) return format(iso, 'yyyy-MM-dd');

  // Try MM/DD/YYYY or MM-DD-YYYY
  const mdy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    const d = new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }

  // Try Month DD, YYYY (e.g. "Jan 01, 2024")
  const d = new Date(trimmed);
  if (isValid(d)) return format(d, 'yyyy-MM-dd');

  return null;
}

function parseCsvText(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '',   // auto-detect comma or tab
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

// ─── Inventory Ledger ────────────────────────────────────────────────────────
// Supports Amazon Inventory Ledger Summary and Detailed reports.
// Key columns needed: Date, SKU (MSKU/FNSKU), on-hand quantity.
export function parseLedgerCsv(text: string): LedgerEntry[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];

  const first = rows[0];

  const dateCol = findCol(first, ['date', 'reportingdate', 'snapshotdate']);
  // Prefer Seller/Merchant SKU; fall back to FNSKU only if nothing else found
  const skuCol =
    findCol(first, ['msku', 'merchantsku', 'sellersku', 'sku']) ??
    findCol(first, ['fnsku', 'fulfillmentnetworksku']);
  const qtyCol = findCol(first, [
    'endingwarehousebalance',
    'endingbalance',
    'onhand',
    'onhandquantity',
    'quantity',
    'closingbalance',
    'balance',
  ]);
  const asinCol = findCol(first, ['asin']);
  const fnskuCol = findCol(first, ['fnsku', 'fulfillmentnetworksku']);
  const countryCodeCol = findCol(first, [
    'countrycode', 'country', 'saleschannel', 'marketplace',
    'marketplaceid', 'marketplacename', 'countrysalesregion',
  ]);

  if (!dateCol || !skuCol || !qtyCol) {
    throw new Error(
      `Could not identify required columns in Inventory Ledger.\n` +
      `Expected: Date, SKU (MSKU/FNSKU), and Quantity columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  // Aggregate: same date+SKU may appear multiple times (e.g. multiple FCs)
  const map = new Map<string, LedgerEntry>();

  for (const row of rows) {
    const rawDate = row[dateCol] ?? '';
    const rawSku = row[skuCol] ?? '';
    const rawQty = row[qtyCol] ?? '0';

    const date = parseDate(rawDate);
    const sku = rawSku.trim();
    const qty = parseInt(rawQty.replace(/,/g, ''), 10) || 0;
    const asin = asinCol ? (row[asinCol] ?? '').trim() : '';
    const fnsku = fnskuCol ? (row[fnskuCol] ?? '').trim() : '';
    const countryCode = countryCodeCol ? (row[countryCodeCol] ?? '').trim() : '';

    if (!date || !sku) continue;

    const key = `${date}|${sku}`;
    const existing = map.get(key);
    if (existing) {
      existing.onHandQty += qty;
      if (!existing.asin && asin) existing.asin = asin;
      if (!existing.fnsku && fnsku) existing.fnsku = fnsku;
      if (!existing.countryCode && countryCode) existing.countryCode = countryCode;
    } else {
      map.set(key, { date, sku, onHandQty: qty, asin, fnsku, countryCode });
    }
  }

  return Array.from(map.values());
}

// ─── Orders Report ───────────────────────────────────────────────────────────
// Supports Amazon Orders and Sales Reports.
// Key columns: purchase-date / date, sku, quantity.
export function parseOrdersCsv(text: string): OrderEntry[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];

  const first = rows[0];

  const dateCol = findCol(first, [
    'purchasedate', 'orderdate', 'date', 'salesdate', 'shipdate',
  ]);
  const skuCol = findCol(first, ['sku', 'merchantsku', 'sellersku', 'msku']);
  const qtyCol = findCol(first, [
    'quantity', 'unitssold', 'units', 'qty', 'quantityordered', 'quantityshipped',
  ]);
  // Amazon Orders Report: item-price is the total price for the line item
  const priceCol = findCol(first, [
    'itemprice', 'itempriceamount', 'price', 'unitprice',
    'saleprice', 'amount', 'revenue', 'saleamount', 'lineamount',
    'productprice', 'totalprice', 'itemamount',
  ]);
  const priceFound = !!priceCol;

  const asinCol = findCol(first, ['asin']);
  const fnskuCol = findCol(first, ['fnsku', 'fulfillmentnetworksku']);
  const countryCodeCol = findCol(first, [
    'countrycode', 'country', 'saleschannel', 'marketplace',
    'marketplaceid', 'marketplacename', 'shipservicelvl',
  ]);

  if (!dateCol || !skuCol || !qtyCol) {
    throw new Error(
      `Could not identify required columns in Orders Report.\n` +
      `Expected: Date, SKU, and Quantity columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  // Aggregate units sold and revenue by date+SKU
  const map = new Map<string, OrderEntry>();

  for (const row of rows) {
    const rawDate = row[dateCol] ?? '';
    const rawSku = row[skuCol] ?? '';
    const rawQty = row[qtyCol] ?? '0';
    const rawPrice = priceCol ? (row[priceCol] ?? '0') : '0';

    const date = parseDate(rawDate);
    const sku = rawSku.trim();
    const qty = parseInt(rawQty.replace(/,/g, ''), 10) || 0;
    // Strip currency symbols and commas, then parse as float
    const revenue = parseFloat(rawPrice.replace(/[^0-9.\-]/g, '')) || 0;
    const asin = asinCol ? (row[asinCol] ?? '').trim() : '';
    const fnsku = fnskuCol ? (row[fnskuCol] ?? '').trim() : '';
    const countryCode = countryCodeCol ? (row[countryCodeCol] ?? '').trim() : '';

    if (!date || !sku || qty <= 0) continue;

    const key = `${date}|${sku}`;
    const existing = map.get(key);
    if (existing) {
      existing.unitsSold += qty;
      existing.revenue += revenue;
      if (!existing.asin && asin) existing.asin = asin;
      if (!existing.fnsku && fnsku) existing.fnsku = fnsku;
      if (!existing.countryCode && countryCode) existing.countryCode = countryCode;
    } else {
      map.set(key, { date, sku, unitsSold: qty, revenue, priceFound, asin, fnsku, countryCode });
    }
  }

  return Array.from(map.values());
}

// ─── Cost & Pricing Report ────────────────────────────────────────────────────
// Expected columns: SKU, Unit Cost, Selling Price
export function parseCostPricingCsv(text: string): CostPricingEntry[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const first = rows[0];

  const skuCol   = findCol(first, ['sku', 'merchantsku', 'sellersku', 'msku', 'asin', 'skuid']);
  const costCol  = findCol(first, ['unitcost', 'cost', 'costperunit', 'purchasecost', 'cogs', 'landedcost', 'buyingcost']);
  const priceCol = findCol(first, ['sellingprice', 'price', 'listprice', 'saleprice', 'retailprice', 'salesprice']);

  if (!skuCol || !costCol || !priceCol) {
    throw new Error(
      `Could not identify required columns in Cost & Pricing Report.\n` +
      `Expected: SKU, Unit Cost, and Selling Price columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  const map = new Map<string, CostPricingEntry>();
  for (const row of rows) {
    const sku          = (row[skuCol]   ?? '').trim();
    const unitCost     = parseFloat((row[costCol]  ?? '0').replace(/[^0-9.\-]/g, '')) || 0;
    const sellingPrice = parseFloat((row[priceCol] ?? '0').replace(/[^0-9.\-]/g, '')) || 0;
    if (!sku) continue;
    map.set(sku, { sku, unitCost, sellingPrice });
  }
  return Array.from(map.values());
}

// ─── Supplier Data ────────────────────────────────────────────────────────────
// Expected columns: Supplier Name, SKU, Lead Time Days, On-Time Delivery Rate, Quality Score
export function parseSupplierCsv(text: string): SupplierImportEntry[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const first = rows[0];

  const supplierCol = findCol(first, ['suppliername', 'supplier', 'vendor', 'vendorname', 'manufacturer']);
  const skuCol      = findCol(first, ['sku', 'merchantsku', 'sellersku', 'msku', 'skuid']);
  const leadCol     = findCol(first, ['leadtime', 'leadtimedays', 'leaddays', 'deliverytimedays', 'deliverytime']);
  const onTimeCol   = findCol(first, ['ontimedelivery', 'ontime', 'ontimerate', 'deliveryrate', 'deliveryscore', 'ontimedeliveryrate', 'ontimepct']);
  const qualityCol  = findCol(first, ['qualityscore', 'quality', 'qualityrate', 'score', 'qualitypct']);

  if (!supplierCol || !skuCol) {
    throw new Error(
      `Could not identify required columns in Supplier Data.\n` +
      `Expected: Supplier Name and SKU columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  return rows
    .map(row => ({
      supplierName:       (row[supplierCol] ?? '').trim(),
      sku:                (row[skuCol]      ?? '').trim(),
      leadTimeDays:       leadCol    ? (parseInt((row[leadCol]    ?? '0').replace(/[^0-9]/g,   '')) || 0) : 0,
      onTimeDeliveryRate: onTimeCol  ? (parseFloat((row[onTimeCol]  ?? '0').replace(/[^0-9.]/g, '')) || 0) : 0,
      qualityScore:       qualityCol ? (parseFloat((row[qualityCol] ?? '0').replace(/[^0-9.]/g, '')) || 0) : 0,
    }))
    .filter(e => e.supplierName && e.sku);
}

// ─── Parent Product Mapping ───────────────────────────────────────────────────
// Expected columns: Parent Product ID, Parent Product Name, Child SKU, Child ASIN, Child FNSKU
export function parseParentProductCsv(text: string): ParentProductEntry[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const first = rows[0];

  const parentIdCol   = findCol(first, ['parentproductid', 'parentid', 'parentasin', 'parent', 'productid', 'parentsku']);
  const parentNameCol = findCol(first, ['parentproductname', 'parentname', 'productname', 'name', 'title', 'parenttitle']);
  const childSkuCol   = findCol(first, ['childsku', 'sku', 'merchantsku', 'sellersku', 'msku', 'skuid']);
  const childAsinCol  = findCol(first, ['childasin', 'asin', 'childasin']);
  const childFnskuCol = findCol(first, ['childfnsku', 'fnsku', 'childfnsku']);

  if (!parentIdCol || !childSkuCol) {
    throw new Error(
      `Could not identify required columns in Parent Product Report.\n` +
      `Expected: Parent Product ID and Child SKU columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  return rows
    .map(row => ({
      parentId:   (row[parentIdCol]   ?? '').trim(),
      parentName: parentNameCol ? (row[parentNameCol] ?? '').trim() : (row[parentIdCol] ?? '').trim(),
      childSku:   (row[childSkuCol]   ?? '').trim(),
      childAsin:  childAsinCol  ? (row[childAsinCol]  ?? '').trim() : '',
      childFnsku: childFnskuCol ? (row[childFnskuCol] ?? '').trim() : '',
    }))
    .filter(e => e.parentId && e.childSku);
}
