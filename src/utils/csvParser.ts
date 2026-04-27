import Papa from 'papaparse';
import { format, parseISO, isValid } from 'date-fns';
import type { LedgerEntry, OrderEntry } from '../types';

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
