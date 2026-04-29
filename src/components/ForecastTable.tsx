import { Fragment, useMemo, useState, useEffect, useRef } from 'react';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import { computeForecasts } from '../utils/calculations';
import { exportForecastCsv } from '../utils/exportCsv';
import MiniChart from './MiniChart';
import SummaryChart from './SummaryChart';
import WeightModal from './WeightModal';
import type { SkuForecast, SortKey, SortDir, FilterKey, DateRange, WeightConfig } from '../types';
import { DEFAULT_WEIGHT } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ExtSortKey = SortKey | 'weightedAvg';

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

function getWeight(weightConfigs: Record<string, WeightConfig>, sku: string): WeightConfig {
  return weightConfigs[sku] ?? DEFAULT_WEIGHT;
}

function computeWeightedAvg(row: SkuForecast, w: WeightConfig): number {
  return (
    row.avg7  * w.w7  / 100 +
    row.avg15 * w.w15 / 100 +
    row.avg30 * w.w30 / 100 +
    row.avg60 * w.w60 / 100 +
    row.avg90 * w.w90 / 100
  );
}

function isDefaultWeight(w: WeightConfig): boolean {
  return w.w7 === 20 && w.w15 === 20 && w.w30 === 20 && w.w60 === 20 && w.w90 === 20;
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

// Checkbox(1) + COLUMNS(13) + WeightedAvg(1) + WeightConfig(1) + Chart(1) = 17
const TOTAL_COLS = COLUMNS.length + 4;

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
  selected: boolean;
  onSelect: () => void;
  weightConfig: WeightConfig;
  weightedAvg: number;
  onEditWeight: () => void;
}

function ForecastRow({
  row, expanded, onToggle,
  selected, onSelect,
  weightConfig, weightedAvg, onEditWeight,
}: RowProps) {
  const hasOos   = row.oosDays > 0;
  const isCustom = !isDefaultWeight(weightConfig);

  return (
    <tr className={`forecast-table__row${expanded ? ' forecast-table__row--expanded' : ''}`}>
      {/* Checkbox */}
      <td className="forecast-table__td forecast-table__td--checkbox" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="row-checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${row.sku}`}
        />
      </td>

      {/* Standard columns */}
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

      {/* Weighted Forecast Average */}
      <td className="forecast-table__td forecast-table__td--weighted">
        {weightedAvg.toFixed(2)}
      </td>

      {/* Weightage Config */}
      <td className="forecast-table__td forecast-table__td--weight-cfg">
        <div className="weight-cell">
          <span className={`weight-cell__badge${isCustom ? ' weight-cell__badge--custom' : ''}`}>
            {isCustom ? 'Custom' : 'Default'}
          </span>
          {isCustom && (
            <span className="weight-cell__summary">
              {weightConfig.w7}|{weightConfig.w15}|{weightConfig.w30}|{weightConfig.w60}|{weightConfig.w90}
            </span>
          )}
          <button className="weight-cell__edit" onClick={onEditWeight} title="Configure weights">
            ✏ Edit
          </button>
        </div>
      </td>

      {/* Graph cell */}
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
  const [sortKey, setSortKey]         = useState<ExtSortKey>('sku');
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [filters, setFilters]         = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [modalTargetSkus, setModalTargetSkus] = useState<string[] | null>(null);

  // Weight configs — persisted to localStorage
  const [weightConfigs, setWeightConfigs] = useState<Record<string, WeightConfig>>(() => {
    try {
      const stored = localStorage.getItem('inv-weight-configs');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('inv-weight-configs', JSON.stringify(weightConfigs));
  }, [weightConfigs]);

  // Select-all checkbox indeterminate state
  const selectAllRef = useRef<HTMLInputElement>(null);

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
      if (sortKey === 'weightedAvg') {
        const aw = computeWeightedAvg(a, getWeight(weightConfigs, a.sku));
        const bw = computeWeightedAvg(b, getWeight(weightConfigs, b.sku));
        return sortDir === 'asc' ? aw - bw : bw - aw;
      }
      const av = a[sortKey as SortKey];
      const bv = b[sortKey as SortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [filtered, sortKey, sortDir, weightConfigs]);

  // Selection state derived values
  const allVisibleSelected  = sorted.length > 0 && sorted.every(r => selectedSkus.has(r.sku));
  const someVisibleSelected = sorted.some(r => selectedSkus.has(r.sku));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSort(key: ExtSortKey) {
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

  function toggleSelectAll() {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        sorted.forEach(r => next.delete(r.sku));
      } else {
        sorted.forEach(r => next.add(r.sku));
      }
      return next;
    });
  }

  function toggleSelectSku(sku: string) {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  function handleModalApply(weight: WeightConfig) {
    if (!modalTargetSkus) return;
    setWeightConfigs(prev => {
      const next = { ...prev };
      for (const sku of modalTargetSkus) next[sku] = { ...weight };
      return next;
    });
    setModalTargetSkus(null);
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

  const modalInitialWeight = modalTargetSkus
    ? getWeight(weightConfigs, modalTargetSkus[0])
    : DEFAULT_WEIGHT;

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
          {selectedSkus.size > 0 && (
            <button
              className="btn btn--weight-apply"
              onClick={() => setModalTargetSkus(Array.from(selectedSkus))}
            >
              ⚖ Apply Weightage to {selectedSkus.size} SKU{selectedSkus.size !== 1 ? 's' : ''}
            </button>
          )}
          {isFiltered && (
            <button className="btn btn--outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear Filters
            </button>
          )}
          <button className="btn btn--export" onClick={() => exportForecastCsv(sorted, weightConfigs)}>
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
              {/* Select-all checkbox */}
              <th className="forecast-table__th forecast-table__th--checkbox">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="row-checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all SKUs"
                  title={allVisibleSelected ? 'Deselect all' : 'Select all visible SKUs'}
                />
              </th>

              {/* Standard columns */}
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

              {/* Weighted Forecast Average */}
              <th
                className="forecast-table__th forecast-table__th--weighted"
                onClick={() => toggleSort('weightedAvg')}
                title="Weighted Forecast Average — calculated from custom period weights"
              >
                Weighted Avg
                <SortIcon active={sortKey === 'weightedAvg'} dir={sortDir} />
              </th>

              {/* Weightage Config */}
              <th className="forecast-table__th forecast-table__th--weight-cfg">
                Weightage Config
              </th>

              {/* Chart */}
              <th className="forecast-table__th forecast-table__th--chart">Chart</th>
            </tr>

            {/* Filter row */}
            <tr>
              <th className="forecast-table__filter-th" />
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
              <th className="forecast-table__filter-th" />
              <th className="forecast-table__filter-th" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded  = expandedSku === row.sku;
              const wCfg        = getWeight(weightConfigs, row.sku);
              const wAvg        = computeWeightedAvg(row, wCfg);
              return (
                <Fragment key={row.sku}>
                  <ForecastRow
                    row={row}
                    expanded={isExpanded}
                    onToggle={() => setExpandedSku((prev) => (prev === row.sku ? null : row.sku))}
                    selected={selectedSkus.has(row.sku)}
                    onSelect={() => toggleSelectSku(row.sku)}
                    weightConfig={wCfg}
                    weightedAvg={wAvg}
                    onEditWeight={() => setModalTargetSkus([row.sku])}
                  />
                  {isExpanded && (
                    <tr className="forecast-table__chart-row">
                      <td colSpan={TOTAL_COLS} className="forecast-table__chart-cell">
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

      {/* Weight editor modal */}
      {modalTargetSkus && (
        <WeightModal
          targetSkus={modalTargetSkus}
          initialWeight={modalInitialWeight}
          onApply={handleModalApply}
          onClose={() => setModalTargetSkus(null)}
        />
      )}
    </div>
  );
}
