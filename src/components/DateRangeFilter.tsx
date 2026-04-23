import { useAppContext } from '../context/AppContext';
import type { DateRangeOption } from '../types';

const PRESETS: { label: string; value: DateRangeOption }[] = [
  { label: 'Last 30 Days', value: '30' },
  { label: 'Last 60 Days', value: '60' },
  { label: 'Last 90 Days', value: '90' },
  { label: 'Custom', value: 'custom' },
];

export default function DateRangeFilter() {
  const { state, dispatch } = useAppContext();
  const { dateRange } = state;

  function setOption(option: DateRangeOption) {
    dispatch({ type: 'SET_DATE_RANGE', payload: { ...dateRange, option } });
  }

  function setCustomDate(field: 'customStart' | 'customEnd', value: string) {
    dispatch({ type: 'SET_DATE_RANGE', payload: { ...dateRange, [field]: value } });
  }

  return (
    <div className="filter-bar">
      <span className="filter-bar__label">Date Range:</span>
      <div className="filter-bar__presets">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            className={`btn btn--outline${dateRange.option === p.value ? ' btn--active' : ''}`}
            onClick={() => setOption(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {dateRange.option === 'custom' && (
        <div className="filter-bar__custom">
          <label>
            From
            <input
              type="date"
              value={dateRange.customStart}
              onChange={(e) => setCustomDate('customStart', e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateRange.customEnd}
              onChange={(e) => setCustomDate('customEnd', e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
