import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { computeForecasts } from '../utils/calculations';
import { exportForecastCsv } from '../utils/exportCsv';
import type { SkuForecast, SortKey, SortDir } from '../types';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'sku', label: 'SKU' },
  { key: 'totalUnitsSold', label: 'Units Sold' },
  { key: 'oosDays', label: 'OOS Days' },
  { key: 'inStockDays', label: 'In-Stock Days' },
  { key: 'adjustedDailyAvg', label: 'Adj. Daily Avg' },
  { key: 'forecast30', label: '30-Day Forecast' },
  { key: 'forecast60', label: '60-Day Forecast' },
  { key: 'forecast90', label: '90-Day Forecast' },
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="sort-icon sort-icon--inactive">⇅</span>;
  return <span className="sort-icon">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export default function ForecastTable() {
  const { state } = useAppContext();
  const [sortKey, setSortKey] = useState<SortKey>('sku');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const forecasts = useMemo(
    () => computeForecasts(state.ledger, state.orders, state.dateRange),
    [state.ledger, state.orders, state.dateRange]
  );

  const sorted = useMemo(() => {
    return [...forecasts].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [forecasts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const hasData = state.ledger.length > 0 || state.orders.length > 0;

  if (!hasData) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📊</div>
        <h3>No Data Imported</h3>
        <p>Import your Amazon Inventory Ledger and Orders Report above to see forecasts.</p>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🔍</div>
        <h3>No SKUs Found</h3>
        <p>No data found for the selected date range. Try expanding the range.</p>
      </div>
    );
  }

  return (
    <div className="forecast-section">
      <div className="forecast-section__header">
        <h2 className="forecast-section__title">
          Sales Forecast
          <span className="badge">{forecasts.length} SKUs</span>
        </h2>
        <button className="btn btn--export" onClick={() => exportForecastCsv(sorted)}>
          ⬇ Export CSV
        </button>
      </div>

      <div className="table-wrapper">
        <table className="forecast-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="forecast-table__th"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <ForecastRow key={row.sku} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ForecastRow({ row }: { row: SkuForecast }) {
  const hasOos = row.oosDays > 0;

  return (
    <tr className="forecast-table__row">
      <td className="forecast-table__td forecast-table__td--sku">{row.sku}</td>
      <td className="forecast-table__td">{row.totalUnitsSold.toLocaleString()}</td>
      <td className={`forecast-table__td${hasOos ? ' forecast-table__td--oos' : ''}`}>
        {hasOos ? `⚠ ${row.oosDays}` : row.oosDays}
      </td>
      <td className="forecast-table__td">{row.inStockDays}</td>
      <td className="forecast-table__td">{row.adjustedDailyAvg.toFixed(2)}</td>
      <td className="forecast-table__td forecast-table__td--forecast">{row.forecast30.toLocaleString()}</td>
      <td className="forecast-table__td forecast-table__td--forecast">{row.forecast60.toLocaleString()}</td>
      <td className="forecast-table__td forecast-table__td--forecast">{row.forecast90.toLocaleString()}</td>
    </tr>
  );
}
