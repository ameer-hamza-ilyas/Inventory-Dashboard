import { useMemo, useState } from 'react';
import { format, parseISO, startOfWeek } from 'date-fns';
import type { SkuForecast } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeGrouping = 'daily' | 'weekly' | 'monthly';
type MetricOption = 'units' | 'revenue' | 'both';

interface AggPoint {
  label: string;
  units: number;
  revenue: number;
  hasOos: boolean;
}

interface Props {
  forecasts: SkuForecast[];
  hasPriceData: boolean;
}

// ─── Chart layout constants ───────────────────────────────────────────────────

const VB_W = 900;
const VB_H = 300;
const PAD_L = 58;   // left: units Y-axis labels
const PAD_R = 66;   // right: revenue Y-axis labels (blank when not shown)
const PAD_T = 14;
const PAD_B = 40;   // bottom: X-axis labels
const CW = VB_W - PAD_L - PAD_R;
const CH = VB_H - PAD_T - PAD_B;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function niceScale(maxVal: number, targetTicks = 5): number[] {
  if (maxVal <= 0) return [0, 1];
  const rawStep = maxVal / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  const niceMax = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e9) / 1e9); // avoid float drift
  }
  return ticks;
}

function fmtAxis(n: number, isRev = false): string {
  const p = isRev ? '$' : '';
  if (n >= 1_000_000) return `${p}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${p}${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000)     return `${p}${(n / 1_000).toFixed(1)}K`;
  return `${p}${n}`;
}

function linePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregate(forecasts: SkuForecast[], grouping: TimeGrouping): AggPoint[] {
  // Merge all SKUs' daily data into a single date→totals map
  const dayMap = new Map<string, { units: number; revenue: number; hasOos: boolean }>();
  for (const fc of forecasts) {
    for (const dp of fc.dailyData) {
      const e = dayMap.get(dp.date);
      if (e) {
        e.units += dp.units;
        e.revenue += dp.revenue;
        if (dp.isOos) e.hasOos = true;
      } else {
        dayMap.set(dp.date, { units: dp.units, revenue: dp.revenue, hasOos: dp.isOos });
      }
    }
  }

  const sorted = Array.from(dayMap.keys()).sort();
  if (sorted.length === 0) return [];

  if (grouping === 'daily') {
    return sorted.map(date => ({
      label: format(parseISO(date), 'MMM d'),
      ...dayMap.get(date)!,
    }));
  }

  if (grouping === 'weekly') {
    type Bucket = { units: number; revenue: number; hasOos: boolean; first: string; last: string };
    const buckets = new Map<string, Bucket>();
    for (const date of sorted) {
      const monday = format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const d = dayMap.get(date)!;
      const b = buckets.get(monday);
      if (b) {
        b.units += d.units;
        b.revenue += d.revenue;
        if (d.hasOos) b.hasOos = true;
        b.last = date;
      } else {
        buckets.set(monday, { units: d.units, revenue: d.revenue, hasOos: d.hasOos, first: date, last: date });
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, b]) => {
        const first = parseISO(b.first);
        const last = parseISO(b.last);
        const label = b.first === b.last
          ? format(first, 'MMM d')
          : format(first, 'MMM') === format(last, 'MMM')
            ? `${format(first, 'MMM d')}–${format(last, 'd')}`
            : `${format(first, 'MMM d')}–${format(last, 'MMM d')}`;
        return { label, units: b.units, revenue: b.revenue, hasOos: b.hasOos };
      });
  }

  // Monthly
  const buckets = new Map<string, { units: number; revenue: number; hasOos: boolean }>();
  for (const date of sorted) {
    const key = date.slice(0, 7); // YYYY-MM
    const d = dayMap.get(date)!;
    const b = buckets.get(key);
    if (b) {
      b.units += d.units;
      b.revenue += d.revenue;
      if (d.hasOos) b.hasOos = true;
    } else {
      buckets.set(key, { units: d.units, revenue: d.revenue, hasOos: d.hasOos });
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      label: format(parseISO(key + '-01'), 'MMM yyyy'),
      ...b,
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SummaryChart({ forecasts, hasPriceData }: Props) {
  const [grouping, setGrouping] = useState<TimeGrouping>('daily');
  const [metric, setMetric]     = useState<MetricOption>('both');

  // Summary totals
  const totalUnits   = forecasts.reduce((s, f) => s + f.totalUnitsSold, 0);
  const totalRevenue = forecasts.reduce((s, f) => s + f.totalRevenue,   0);
  const totalOosDays = forecasts.reduce((s, f) => s + f.oosDays,        0);

  const points = useMemo(() => aggregate(forecasts, grouping), [forecasts, grouping]);

  const showUnits   = metric === 'units'   || metric === 'both';
  const showRevenue = (metric === 'revenue' || metric === 'both') && hasPriceData;

  const chartSvg = useMemo(() => {
    if (points.length === 0) return null;
    const n = points.length;

    const xPos  = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * CW : CW / 2);
    // band half-width for OOS highlight
    const halfBW = n > 1 ? (CW / (n - 1)) * 0.45 : CW * 0.45;

    // Y scales
    const unitsMax = Math.max(...points.map(p => p.units), 0);
    const revMax   = Math.max(...points.map(p => p.revenue), 0);
    const uTicks = niceScale(unitsMax);
    const rTicks = niceScale(revMax);
    const uMax = uTicks[uTicks.length - 1] || 1;
    const rMax = rTicks[rTicks.length - 1] || 1;

    const yU = (v: number) => PAD_T + CH * (1 - v / uMax);
    const yR = (v: number) => PAD_T + CH * (1 - v / rMax);

    const unitsPts = points.map((p, i) => ({ x: xPos(i), y: yU(p.units) }));
    const revPts   = points.map((p, i) => ({ x: xPos(i), y: yR(p.revenue) }));

    // X label density
    const labelStep = Math.max(1, Math.ceil(n / 9));

    return (
      <>
        {/* Horizontal grid lines */}
        {uTicks.map((t, i) => (
          <line key={`g${i}`}
            x1={PAD_L} y1={yU(t)} x2={PAD_L + CW} y2={yU(t)}
            stroke="#e2e8f0" strokeWidth={0.75}
          />
        ))}

        {/* OOS shaded bands */}
        {points.map((p, i) => p.hasOos ? (
          <rect key={`ob${i}`}
            x={xPos(i) - halfBW} y={PAD_T}
            width={halfBW * 2} height={CH}
            fill="#fee2e2" opacity={0.55}
          />
        ) : null)}

        {/* Chart border */}
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH}
          fill="none" stroke="#e2e8f0" strokeWidth={0.75}
        />

        {/* Revenue line — green */}
        {showRevenue && revMax > 0 && (
          <path d={linePath(revPts)}
            fill="none" stroke="#16a34a" strokeWidth={2.2}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Units Sold line — blue */}
        {showUnits && unitsMax > 0 && (
          <path d={linePath(unitsPts)}
            fill="none" stroke="#2563eb" strokeWidth={2.2}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* OOS dot markers on units line */}
        {showUnits && points.map((p, i) => p.hasOos ? (
          <circle key={`od${i}`}
            cx={xPos(i)} cy={unitsPts[i].y} r={4.5}
            fill="#dc2626" stroke="#fff" strokeWidth={1.2}
          />
        ) : null)}

        {/* Left Y axis — Units */}
        {showUnits && <>
          {uTicks.map((t, i) => (
            <text key={`yu${i}`}
              x={PAD_L - 6} y={yU(t) + 3.5}
              textAnchor="end" fontSize={10} fill="#64748b"
            >
              {fmtAxis(t)}
            </text>
          ))}
          <text
            x={11} y={PAD_T + CH / 2}
            textAnchor="middle" fontSize={10} fill="#2563eb"
            transform={`rotate(-90,11,${PAD_T + CH / 2})`}
          >
            Units
          </text>
        </>}

        {/* Right Y axis — Revenue */}
        {showRevenue && <>
          {rTicks.map((t, i) => (
            <text key={`yr${i}`}
              x={PAD_L + CW + 6} y={yR(t) + 3.5}
              textAnchor="start" fontSize={10} fill="#64748b"
            >
              {fmtAxis(t, true)}
            </text>
          ))}
          <text
            x={VB_W - 11} y={PAD_T + CH / 2}
            textAnchor="middle" fontSize={10} fill="#16a34a"
            transform={`rotate(90,${VB_W - 11},${PAD_T + CH / 2})`}
          >
            Revenue
          </text>
        </>}

        {/* X axis baseline */}
        <line
          x1={PAD_L} y1={PAD_T + CH}
          x2={PAD_L + CW} y2={PAD_T + CH}
          stroke="#cbd5e1" strokeWidth={1}
        />

        {/* X axis labels */}
        {points.map((p, i) => {
          const isFirst = i === 0;
          const isLast  = i === n - 1;
          if (!isFirst && !isLast && i % labelStep !== 0) return null;
          return (
            <text key={`xl${i}`}
              x={xPos(i)} y={PAD_T + CH + 16}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={10} fill="#64748b"
            >
              {p.label}
            </text>
          );
        })}
      </>
    );
  }, [points, showUnits, showRevenue]);

  return (
    <div className="summary-chart">
      {/* ── Summary stat cards ── */}
      <div className="summary-stats">
        <div className="summary-stat-card">
          <div className="summary-stat-card__icon">📦</div>
          <div className="summary-stat-card__body">
            <div className="summary-stat-card__value">{totalUnits.toLocaleString()}</div>
            <div className="summary-stat-card__label">Total Units Sold</div>
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="summary-stat-card__icon">💰</div>
          <div className="summary-stat-card__body">
            <div className="summary-stat-card__value">
              {hasPriceData
                ? '$' + totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : <span className="summary-stat-card__na">No price data</span>
              }
            </div>
            <div className="summary-stat-card__label">Total Revenue</div>
          </div>
        </div>

        <div className="summary-stat-card summary-stat-card--oos">
          <div className="summary-stat-card__icon">⚠</div>
          <div className="summary-stat-card__body">
            <div className="summary-stat-card__value">{totalOosDays.toLocaleString()}</div>
            <div className="summary-stat-card__label">Total OOS Days (all SKUs)</div>
          </div>
        </div>
      </div>

      {/* ── Chart controls ── */}
      <div className="summary-chart__controls">
        <div className="summary-chart__control-group">
          <label className="summary-chart__control-label">Time Grouping</label>
          <select
            className="summary-chart__select"
            value={grouping}
            onChange={e => setGrouping(e.target.value as TimeGrouping)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="summary-chart__control-group">
          <label className="summary-chart__control-label">Metric</label>
          <select
            className="summary-chart__select"
            value={metric}
            onChange={e => setMetric(e.target.value as MetricOption)}
          >
            <option value="units">Units Sold</option>
            {hasPriceData && <option value="revenue">Revenue</option>}
            {hasPriceData && <option value="both">Both</option>}
          </select>
        </div>

        <div className="summary-chart__legend">
          {showUnits && (
            <span className="legend-item">
              <span className="legend-dot legend-dot--blue" /> Units Sold
            </span>
          )}
          {showRevenue && (
            <span className="legend-item">
              <span className="legend-dot legend-dot--green" /> Revenue
            </span>
          )}
          <span className="legend-item">
            <span className="legend-swatch" /> OOS Period
          </span>
        </div>
      </div>

      {/* ── SVG chart ── */}
      <div className="summary-chart__svg-wrap">
        {points.length === 0 ? (
          <div className="summary-chart__empty">No data for the selected range</div>
        ) : (
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            height={VB_H}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            {chartSvg}
          </svg>
        )}
      </div>
    </div>
  );
}
