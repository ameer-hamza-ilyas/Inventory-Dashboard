export interface LedgerEntry {
  date: string;   // YYYY-MM-DD
  sku: string;
  onHandQty: number;
}

export interface OrderEntry {
  date: string;   // YYYY-MM-DD
  sku: string;
  unitsSold: number;
}

export type DateRangeOption = '30' | '60' | '90' | 'custom';

export interface DateRange {
  option: DateRangeOption;
  customStart: string;
  customEnd: string;
}

export interface SkuForecast {
  sku: string;
  totalUnitsSold: number;
  oosDays: number;
  inStockDays: number;
  adjustedDailyAvg: number;
  forecast30: number;
  forecast60: number;
  forecast90: number;
  oosDateSet: Set<string>;
}

export type SortKey = keyof Omit<SkuForecast, 'oosDateSet'>;
export type SortDir = 'asc' | 'desc';
