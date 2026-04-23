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
  const skuCol = findCol(first, ['msku', 'merchantsku', 'sellersku', 'sku', 'fnsku']);
  const qtyCol = findCol(first, [
    'endingwarehousebalance',
    'endingbalance',
    'onhand',
    'onhandquantity',
    'quantity',
    'closingbalance',
    'balance',
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

    if (!date || !sku) continue;

    const key = `${date}|${sku}`;
    const existing = map.get(key);
    if (existing) {
      existing.onHandQty += qty;
    } else {
      map.set(key, { date, sku, onHandQty: qty });
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

  if (!dateCol || !skuCol || !qtyCol) {
    throw new Error(
      `Could not identify required columns in Orders Report.\n` +
      `Expected: Date, SKU, and Quantity columns.\n` +
      `Found columns: ${Object.keys(first).join(', ')}`
    );
  }

  // Aggregate units sold by date+SKU
  const map = new Map<string, OrderEntry>();

  for (const row of rows) {
    const rawDate = row[dateCol] ?? '';
    const rawSku = row[skuCol] ?? '';
    const rawQty = row[qtyCol] ?? '0';

    const date = parseDate(rawDate);
    const sku = rawSku.trim();
    const qty = parseInt(rawQty.replace(/,/g, ''), 10) || 0;

    if (!date || !sku || qty <= 0) continue;

    const key = `${date}|${sku}`;
    const existing = map.get(key);
    if (existing) {
      existing.unitsSold += qty;
    } else {
      map.set(key, { date, sku, unitsSold: qty });
    }
  }

  return Array.from(map.values());
}
