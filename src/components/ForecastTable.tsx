import { Fragment, useMemo, useState } from 'react';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { computeForecasts } from '../utils/calculations';
import { exportForecastCsv } from '../utils/exportCsv';
import MiniChart from './MiniChart';
import SummaryChart from './SummaryChart';
import type { SkuForecast, SortKey, SortDir, FilterKey, DateRange } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRangeLabel(range: DateRange): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range.option === 'custom') {
    if (!range.customStart || !range.customEnd) return '';
    const s = parseISO(range.customStart);
    const e = parseISO(range.customEnd);
    if (!isValid(s) || !isValid(e)) return '';
    return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`;
  }
  const days = Number(range.option);
  const start = subDays(today, days - 1);
  return `${format(start, 'MMM d')} – ${format(today, 'MMM d, yyyy')}`;
}

function fmtRevenue(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: { key: SortKey; label: string; rangeScoped?: boolean; filterable?: boolean }[] = [
  { key: 'sku',            label: 'SKU',            filterable: true },
  { key: 'asin',           label: 'ASIN',           filterable: true },
  { key: 'fnsku',          label: 'FNSKU',          filterable: true },
  { key: 'countryCode',    label: 'Country',        filterable: true },
  { key: 'totalUnitsSold', label: 'Units Sold',     rangeScoped: true },
  { key: 'totalRevenue',   label: 'Revenue',        rangeScoped: true },
  { key: 'oosDays',        label: 'OOS Days',       rangeScoped: true },
  { key: 'inStockDays',    label: 'In-Stock Days',  rangeScoped: true },
  { key: 'avg7',           label: '7-Day Avg' },
  { key: 'avg15',          label: '15-Day Avg' },
  { key: 'avg30',          label: '30-Day Avg' },
  { key: 'avg60',          label: '60-Day Avg' },
  { key: 'avg90',          label: '90-Day Avg' },
];

const EMPTY_FILTERS: Record<FilterKey, string> = {
  sku: '', asin: '', fnsku: '', countryCode: '',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="sort-icon sort-icon--inactive">⇅</span>;
  return <span className="sort-icon">{dir === 'asc' ? '↑' : '↓'}</span>;
}

interface RowProps {
  row: SkuForecast;
  expanded: boolean;
  onToggle: () => void;
}

function ForecastRow({ row, expanded, onToggle }: RowProps) {
  const hasOos = row.oosDays > 0;

  return (
    <tr className={`forecast-table__row${expanded ? ' forecast-table__row--expanded' : ''}`}>
      <td className="forecast-table__td forecast-table__td--id">{row.sku}</td>
      <td className="forecast-table__td forecast-table__td--id">{row.asin || '—'}</td>
      <td className="forecast-table__td forecast-table__td--id">{row.fnsku || '—'}</td>
      <td className="forecast-table__td">{row.countryCode || '—'}</td>
      <td className="forecast-table__td">{row.totalUnitsSold.toLocaleString()}</td>
      <td className="forecast-table__td forecast-table__td--revenue">
        {row.hasPriceData ? fmtRevenue(row.totalRevenue) : (
          <span className="forecast-table__no-price">—</span>
        )}
      </td>
      <td className={`forecast-table__td${hasOos ? ' forecast-table__td--oos' : ''}`}>
        {hasOos ? `⚠ ${row.oosDays}` : row.oosDays}
      </td>
      <td className="forecast-table__td">{row.inStockDays}</td>
      <td className="forecast-table__td forecast-table__td--avg">{row.avg7.toFixed(2)}</td>
      <td className="forecast-table__td forecast-table__td--avg">{row.avg15.toFixed(2)}</td>
      <td className="forecast-table__td forecast-table__td--avg">{row.avg30.toFixed(2)}</td>
      <td className="forecast-table__td forecast-table__td--avg">{row.avg60.toFixed(2)}</td>
      <td className="forecast-table__td forecast-table__td--avg">{row.avg90.toFixed(2)}</td>
      {/* Graph cell — click to expand */}
      <td className="forecast-table__td forecast-table__td--chart" onClick={onToggle}>
        <div className="mini-chart-wrap">
          <MiniChart data={row.dailyData} height={48} />
        </div>
        <span className="chart-toggle-icon" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▾' : '▸'}
        </span>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ForecastTable() {
  const { state } = useAppContext();
  const [sortKey, setSortKey]       = useState<SortKey>('sku');
  const [sortDir, setSortDir]       = useState<SortDir>('asc');
  const [filters, setFilters]       = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  const forecasts = useMemo(
    () => computeForecasts(state.ledger, state.orders, state.dateRange),
    [state.ledger, state.orders, state.dateRange]
  );

  const filtered = useMemo(() => {
    const { sku, asin, fnsku, countryCode } = filters;
    if (!sku && !asin && !fnsku && !countryCode) return forecasts;
    return forecasts.filter(
      (r) =>
        r.sku.toLowerCase().includes(sku.toLowerCase()) &&
        r.asin.toLowerCase().includes(asin.toLowerCase()) &&
        r.fnsku.toLowerCase().includes(fnsku.toLowerCase()) &&
        r.countryCode.toLowerCase().includes(countryCode.toLowerCase())
    );
  }, [forecasts, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function setFilter(key: FilterKey, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const hasData = state.ledger.length > 0 || state.orders.length > 0;
  const isFiltered = Object.values(filters).some(Boolean);
  const rangeLabel = getRangeLabel(state.dateRange);
  const hasPriceData = forecasts[0]?.hasPriceData ?? false;
  const isCustomIncomplete =
    state.dateRange.option === 'custom' &&
    (!state.dateRange.customStart || !state.dateRange.customEnd);

  if (!hasData) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📊</div>
        <h3>No Data Imported</h3>
        <p>Import your Amazon Inventory Ledger and Orders Report above to see forecasts.</p>
      </div>
    );
  }

  if (isCustomIncomplete) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📅</div>
        <h3>Select a Date Range</h3>
        <p>Choose both a start and end date above to apply a custom filter.</p>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🔍</div>
        <h3>No SKUs Found</h3>
        <p>No data found for <strong>{rangeLabel}</strong>. Try a different date range.</p>
      </div>
    );
  }

  const totalCols = COLUMNS.length + 1; // +1 for the Graph column

  return (
    <div className="forecast-section">
      <div className="forecast-section__header">
        <h2 className="forecast-section__title">
          Sales Forecast
          <span className="badge">
            {sorted.length}{isFiltered ? ` / ${forecasts.length}` : ''} SKUs
          </span>
          {rangeLabel && (
            <span className="forecast-section__range">{rangeLabel}</span>
          )}
        </h2>
        <div className="forecast-section__actions">
          {isFiltered && (
            <button className="btn btn--outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear Filters
            </button>
          )}
          <button className="btn btn--export" onClick={() => exportForecastCsv(sorted)}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <SummaryChart forecasts={forecasts} hasPriceData={hasPriceData} />

      {!hasPriceData && (
        <p className="forecast-section__no-price-note">
          Revenue column is empty — no price/revenue column was found in the imported Orders Report.
        </p>
      )}

      <div className="table-wrapper">
        <table className="forecast-table">
          <thead>
            {/* Sort header */}
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="forecast-table__th"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {col.rangeScoped && (
                    <span className="forecast-table__th-scope" title="Based on selected date range"> *</span>
                  )}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
              <th className="forecast-table__th forecast-table__th--chart">Chart</th>
            </tr>
            {/* Filter row */}
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="forecast-table__filter-th">
                  {col.filterable ? (
                    <input
                      type="text"
                      className="forecast-table__filter-input"
                      placeholder="Filter…"
                      value={filters[col.key as FilterKey]}
                      onChange={(e) => setFilter(col.key as FilterKey, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                </th>
              ))}
              <th className="forecast-table__filter-th" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded = expandedSku === row.sku;
              return (
                <Fragment key={row.sku}>
                  <ForecastRow
                    row={row}
                    expanded={isExpanded}
                    onToggle={() =>
                      setExpandedSku((prev) => (prev === row.sku ? null : row.sku))
                    }
                  />
                  {isExpanded && (
                    <tr className="forecast-table__chart-row">
                      <td colSpan={totalCols} className="forecast-table__chart-cell">
                        <div className="expanded-chart">
                          <div className="expanded-chart__header">
                            <span className="expanded-chart__sku">{row.sku}</span>
                            <div className="expanded-chart__legend">
                              <span className="legend-item">
                                <span className="legend-dot legend-dot--blue" />
                                Units Sold
                              </span>
                              {row.hasPriceData && (
                                <span className="legend-item">
                                  <span className="legend-dot legend-dot--green" />
                                  Revenue
                                </span>
                              )}
                              {row.dailyData.some((d) => d.isOos) && (
                                <span className="legend-item">
                                  <span className="legend-dot legend-dot--red" />
                                  OOS Day
                                </span>
                              )}
                            </div>
                            <button
                              className="btn btn--outline expanded-chart__close"
                              onClick={() => setExpandedSku(null)}
                            >
                              ✕ Close
                            </button>
                          </div>
                          <MiniChart data={row.dailyData} height={200} showLabels />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
