export interface LedgerEntry {
  date: string;   // YYYY-MM-DD
  sku: string;
  onHandQty: number;
  asin: string;
  fnsku: string;
  countryCode: string;
}

export interface OrderEntry {
  date: string;   // YYYY-MM-DD
  sku: string;
  unitsSold: number;
  revenue: number;      // total price for this order line (0 when no price column found)
  priceFound: boolean;  // true when the CSV had a recognisable price column
  asin: string;
  fnsku: string;
  countryCode: string;
}

export type DateRangeOption = '30' | '60' | '90' | 'custom';

export interface DateRange {
  option: DateRangeOption;
  customStart: string;
  customEnd: string;
}

export interface DailyPoint {
  date: string;     // YYYY-MM-DD
  units: number;
  revenue: number;
  isOos: boolean;
}

export interface SkuForecast {
  sku: string;
  asin: string;
  fnsku: string;
  countryCode: string;
  totalUnitsSold: number;
  totalRevenue: number;
  hasPriceData: boolean;
  oosDays: number;
  inStockDays: number;
  avg7: number;
  avg15: number;
  avg30: number;
  avg60: number;
  avg90: number;
  oosDateSet: Set<string>;
  dailyData: DailyPoint[];
}

// hasPriceData and dailyData are internal — excluded from sort keys
export type SortKey = keyof Omit<SkuForecast, 'oosDateSet' | 'dailyData' | 'hasPriceData'>;
export type SortDir = 'asc' | 'desc';
export type FilterKey = 'sku' | 'asin' | 'fnsku' | 'countryCode';

export interface WeightConfig {
  w7: number;
  w15: number;
  w30: number;
  w60: number;
  w90: number;
}

export const DEFAULT_WEIGHT: WeightConfig = {
  w7: 20, w15: 20, w30: 20, w60: 20, w90: 20,
};
