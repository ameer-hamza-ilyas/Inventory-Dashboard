import { format, subDays, parseISO, isValid } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import type { DateRangeOption } from '../types';

const PRESETS: { label: string; value: Exclude<DateRangeOption, 'custom'> }[] = [
  { label: 'Last 30 Days', value: '30' },
  { label: 'Last 60 Days', value: '60' },
  { label: 'Last 90 Days', value: '90' },
];

function formatWindow(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = sameYear ? format(start, 'MMM d') : format(start, 'MMM d, yyyy');
  return `${startFmt} – ${format(end, 'MMM d, yyyy')}`;
}

export default function DateRangeFilter() {
  const { state, dispatch } = useAppContext();
  const { dateRange } = state;

  function setOption(option: DateRangeOption) {
    dispatch({ type: 'SET_DATE_RANGE', payload: { ...dateRange, option } });
  }

  function setCustomDate(field: 'customStart' | 'customEnd', value: string) {
    dispatch({ type: 'SET_DATE_RANGE', payload: { ...dateRange, [field]: value } });
  }

  // Compute the window label shown under the buttons
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let windowLabel: string | null = null;
  if (dateRange.option !== 'custom') {
    const days = Number(dateRange.option);
    windowLabel = formatWindow(subDays(today, days - 1), today);
  } else if (dateRange.customStart && dateRange.customEnd) {
    const s = parseISO(dateRange.customStart);
    const e = parseISO(dateRange.customEnd);
    if (isValid(s) && isValid(e) && s <= e) {
      windowLabel = formatWindow(s, e);
    }
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
        <button
          className={`btn btn--outline${dateRange.option === 'custom' ? ' btn--active' : ''}`}
          onClick={() => setOption('custom')}
        >
          Custom
        </button>
      </div>

      {windowLabel && (
        <span className="filter-bar__window">{windowLabel}</span>
      )}

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
          {(!dateRange.customStart || !dateRange.customEnd) && (
            <span className="filter-bar__hint">Select both dates to apply</span>
          )}
        </div>
      )}
    </div>
  );
}
