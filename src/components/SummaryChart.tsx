import { useMemo, useState, useRef, useCallback } from 'react';
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
  oosDayCount: number;
}

interface Props {
  forecasts: SkuForecast[];
  hasPriceData: boolean;
}

// ─── Chart layout constants ───────────────────────────────────────────────────

const VB_W = 900;
const VB_H = 300;
const PAD_L = 62;
const PAD_R = 70;
const PAD_T = 20;
const PAD_B = 42;
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
    ticks.push(Math.round(v * 1e9) / 1e9);
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

function areaPath(pts: { x: number; y: number }[], baseline: number): string {
  if (pts.length === 0) return '';
  return (
    linePath(pts) +
    ` L${pts[pts.length - 1].x.toFixed(1)},${baseline.toFixed(1)}` +
    ` L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`
  );
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function aggregate(forecasts: SkuForecast[], grouping: TimeGrouping): AggPoint[] {
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
    return sorted.map(date => {
      const d = dayMap.get(date)!;
      return {
        label: format(parseISO(date), 'MMM d'),
        units: d.units,
        revenue: d.revenue,
        hasOos: d.hasOos,
        oosDayCount: d.hasOos ? 1 : 0,
      };
    });
  }

  if (grouping === 'weekly') {
    type Bucket = { units: number; revenue: number; hasOos: boolean; oosDayCount: number; first: string; last: string };
    const buckets = new Map<string, Bucket>();
    for (const date of sorted) {
      const monday = format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const d = dayMap.get(date)!;
      const b = buckets.get(monday);
      if (b) {
        b.units += d.units;
        b.revenue += d.revenue;
        if (d.hasOos) { b.hasOos = true; b.oosDayCount++; }
        b.last = date;
      } else {
        buckets.set(monday, {
          units: d.units, revenue: d.revenue,
          hasOos: d.hasOos, oosDayCount: d.hasOos ? 1 : 0,
          first: date, last: date,
        });
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, b]) => {
        const first = parseISO(b.first);
        const last  = parseISO(b.last);
        const label = b.first === b.last
          ? format(first, 'MMM d')
          : format(first, 'MMM') === format(last, 'MMM')
            ? `${format(first, 'MMM d')}–${format(last, 'd')}`
            : `${format(first, 'MMM d')}–${format(last, 'MMM d')}`;
        return { label, units: b.units, revenue: b.revenue, hasOos: b.hasOos, oosDayCount: b.oosDayCount };
      });
  }

  // Monthly
  const buckets = new Map<string, { units: number; revenue: number; hasOos: boolean; oosDayCount: number }>();
  for (const date of sorted) {
    const key = date.slice(0, 7);
    const d = dayMap.get(date)!;
    const b = buckets.get(key);
    if (b) {
      b.units += d.units;
      b.revenue += d.revenue;
      if (d.hasOos) { b.hasOos = true; b.oosDayCount++; }
    } else {
      buckets.set(key, { units: d.units, revenue: d.revenue, hasOos: d.hasOos, oosDayCount: d.hasOos ? 1 : 0 });
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      label: format(parseISO(key + '-01'), 'MMM yyyy'),
      units: b.units,
      revenue: b.revenue,
      hasOos: b.hasOos,
      oosDayCount: b.oosDayCount,
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SummaryChart({ forecasts, hasPriceData }: Props) {
  const [grouping, setGrouping] = useState<TimeGrouping>('daily');
  const [metric, setMetric]     = useState<MetricOption>('both');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const totalUnits   = forecasts.reduce((s, f) => s + f.totalUnitsSold, 0);
  const totalRevenue = forecasts.reduce((s, f) => s + f.totalRevenue,   0);
  const totalOosDays = forecasts.reduce((s, f) => s + f.oosDays,        0);

  const points = useMemo(() => aggregate(forecasts, grouping), [forecasts, grouping]);

  const showUnits   = metric === 'units'   || metric === 'both';
  const showRevenue = (metric === 'revenue' || metric === 'both') && hasPriceData;

  // Pre-compute positions and scales — memoized separately from rendering
  // so hover state changes don't re-run the expensive scale math
  const computed = useMemo(() => {
    if (points.length === 0) return null;
    const n = points.length;
    const xPos    = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * CW : CW / 2);
    const halfBW  = n > 1 ? (CW / (n - 1)) * 0.45 : CW * 0.45;

    const unitsMax = Math.max(...points.map(p => p.units), 0);
    const revMax   = Math.max(...points.map(p => p.revenue), 0);
    const uTicks   = niceScale(unitsMax);
    const rTicks   = niceScale(revMax);
    const uMax     = uTicks[uTicks.length - 1] || 1;
    const rMax     = rTicks[rTicks.length - 1] || 1;

    const yU = (v: number) => PAD_T + CH * (1 - v / uMax);
    const yR = (v: number) => PAD_T + CH * (1 - v / rMax);

    const unitsPts = points.map((p, i) => ({ x: xPos(i), y: yU(p.units) }));
    const revPts   = points.map((p, i) => ({ x: xPos(i), y: yR(p.revenue) }));
    const labelStep = Math.max(1, Math.ceil(n / 9));

    return { n, xPos, halfBW, uTicks, rTicks, uMax, rMax, yU, yR, unitsPts, revPts, labelStep };
  }, [points]);

  // Static SVG elements — only recompute when data or metric selection changes
  const staticSvg = useMemo(() => {
    if (!computed) return null;
    const { n, xPos, halfBW, uTicks, rTicks, uMax, rMax, yU, yR, unitsPts, revPts, labelStep } = computed;
    const baseline = PAD_T + CH;

    return (
      <>
        {/* Chart area background */}
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH} fill="#f8fafc" />

        {/* Horizontal grid lines with dashes */}
        {uTicks.map((t, i) => (
          <line key={`g${i}`}
            x1={PAD_L} y1={yU(t)} x2={PAD_L + CW} y2={yU(t)}
            stroke={i === 0 ? '#94a3b8' : '#dde3ec'}
            strokeWidth={i === 0 ? 1 : 0.8}
            strokeDasharray={i === 0 ? undefined : '5 4'}
          />
        ))}

        {/* OOS shaded bands */}
        {points.map((p, i) => p.hasOos ? (
          <rect key={`ob${i}`}
            x={xPos(i) - halfBW} y={PAD_T}
            width={halfBW * 2} height={CH}
            fill="#fee2e2" opacity={0.6}
          />
        ) : null)}

        {/* Chart border */}
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH}
          fill="none" stroke="#cbd5e1" strokeWidth={1}
        />

        {/* Subtle area fills under each line */}
        {showRevenue && rMax > 0 && (
          <path d={areaPath(revPts, baseline)} fill="#16a34a" opacity={0.06} />
        )}
        {showUnits && uMax > 0 && (
          <path d={areaPath(unitsPts, baseline)} fill="#2563eb" opacity={0.07} />
        )}

        {/* Revenue line */}
        {showRevenue && rMax > 0 && (
          <path d={linePath(revPts)}
            fill="none" stroke="#16a34a" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Units Sold line */}
        {showUnits && uMax > 0 && (
          <path d={linePath(unitsPts)}
            fill="none" stroke="#2563eb" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Left Y axis — Units Sold */}
        {showUnits && <>
          {uTicks.map((t, i) => (
            <text key={`yu${i}`}
              x={PAD_L - 8} y={yU(t) + 4}
              textAnchor="end" fontSize={11} fill="#475569"
            >
              {fmtAxis(t)}
            </text>
          ))}
          <text
            x={13} y={PAD_T + CH / 2}
            textAnchor="middle" fontSize={11} fill="#2563eb" fontWeight={600}
            transform={`rotate(-90,13,${PAD_T + CH / 2})`}
          >
            Units Sold
          </text>
        </>}

        {/* Right Y axis — Revenue */}
        {showRevenue && <>
          {rTicks.map((t, i) => (
            <text key={`yr${i}`}
              x={PAD_L + CW + 8} y={yR(t) + 4}
              textAnchor="start" fontSize={11} fill="#475569"
            >
              {fmtAxis(t, true)}
            </text>
          ))}
          <text
            x={VB_W - 13} y={PAD_T + CH / 2}
            textAnchor="middle" fontSize={11} fill="#16a34a" fontWeight={600}
            transform={`rotate(90,${VB_W - 13},${PAD_T + CH / 2})`}
          >
            Revenue ($)
          </text>
        </>}

        {/* X axis baseline */}
        <line
          x1={PAD_L} y1={baseline} x2={PAD_L + CW} y2={baseline}
          stroke="#94a3b8" strokeWidth={1}
        />

        {/* X axis labels */}
        {points.map((p, i) => {
          const isFirst = i === 0;
          const isLast  = i === n - 1;
          if (!isFirst && !isLast && i % labelStep !== 0) return null;
          return (
            <text key={`xl${i}`}
              x={xPos(i)} y={baseline + 16}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={11} fill="#64748b"
            >
              {p.label}
            </text>
          );
        })}

        {/* "Hover for details" hint */}
        <text
          x={PAD_L + CW - 4} y={PAD_T + 13}
          textAnchor="end" fontSize={9.5} fill="#94a3b8" fontStyle="italic"
        >
          Hover data points for details
        </text>
      </>
    );
  }, [computed, points, showUnits, showRevenue]);

  // Snap nearest data point to cursor on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !computed) return;
    const rect  = svgRef.current.getBoundingClientRect();
    const svgX  = (e.clientX - rect.left) * (VB_W / rect.width);
    const { n, xPos } = computed;

    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xPos(i) - svgX);
      if (d < minDist) { minDist = d; nearest = i; }
    }

    const threshold = n > 1 ? (CW / (n - 1)) * 0.6 : CW;
    if (minDist > threshold) {
      setHoveredIndex(null);
      setMousePos(null);
    } else {
      setHoveredIndex(nearest);
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [computed]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setMousePos(null);
  }, []);

  // Only show individual markers when there aren't too many points
  const showAllMarkers = computed !== null && computed.n <= 90;

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
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              width="100%"
              height={VB_H}
              preserveAspectRatio="xMidYMid meet"
              style={{ display: 'block', cursor: 'crosshair' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Static elements — gridlines, lines, axes */}
              {staticSvg}

              {/* Dynamic elements — re-render on hover without recomputing static SVG */}
              {computed && <>
                {/* Vertical crosshair at hovered point */}
                {hoveredIndex !== null && (
                  <line
                    x1={computed.xPos(hoveredIndex)} y1={PAD_T}
                    x2={computed.xPos(hoveredIndex)} y2={PAD_T + CH}
                    stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
                  />
                )}

                {/* Revenue markers — green dots */}
                {showRevenue && computed.rMax > 0 && computed.revPts.map((pt, i) => {
                  const isHovered = hoveredIndex === i;
                  if (!showAllMarkers && !isHovered) return null;
                  return (
                    <circle key={`rm${i}`}
                      cx={pt.x} cy={pt.y}
                      r={isHovered ? 6.5 : 4}
                      fill={isHovered ? '#15803d' : '#16a34a'}
                      stroke="#fff" strokeWidth={isHovered ? 2 : 1.5}
                    />
                  );
                })}

                {/* Units markers — blue dots (red if OOS) */}
                {showUnits && computed.uMax > 0 && computed.unitsPts.map((pt, i) => {
                  const isHovered = hoveredIndex === i;
                  const isOos     = points[i].hasOos;
                  if (!showAllMarkers && !isHovered) return null;
                  return (
                    <circle key={`um${i}`}
                      cx={pt.x} cy={pt.y}
                      r={isHovered ? 6.5 : (isOos ? 5 : 4)}
                      fill={isOos ? '#dc2626' : (isHovered ? '#1d4ed8' : '#2563eb')}
                      stroke="#fff" strokeWidth={isHovered ? 2 : 1.5}
                    />
                  );
                })}
              </>}
            </svg>

            {/* HTML Tooltip — rendered outside SVG for full CSS styling */}
            {hoveredIndex !== null && mousePos && (() => {
              const p = points[hoveredIndex];
              return (
                <div
                  className="chart-tooltip"
                  style={{
                    position: 'fixed',
                    left: mousePos.x + 18,
                    top:  mousePos.y - 14,
                    pointerEvents: 'none',
                    zIndex: 1000,
                  }}
                >
                  <div className="chart-tooltip__date">{p.label}</div>
                  {showUnits && (
                    <div className="chart-tooltip__row">
                      <span className="chart-tooltip__dot chart-tooltip__dot--blue" />
                      <span className="chart-tooltip__metric">Units Sold</span>
                      <span className="chart-tooltip__value">{p.units.toLocaleString()}</span>
                    </div>
                  )}
                  {showRevenue && hasPriceData && (
                    <div className="chart-tooltip__row">
                      <span className="chart-tooltip__dot chart-tooltip__dot--green" />
                      <span className="chart-tooltip__metric">Revenue</span>
                      <span className="chart-tooltip__value">
                        {'$' + p.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {p.hasOos && (
                    <div className="chart-tooltip__row chart-tooltip__row--oos">
                      <span className="chart-tooltip__dot chart-tooltip__dot--red" />
                      <span className="chart-tooltip__metric">OOS Days</span>
                      <span className="chart-tooltip__value chart-tooltip__value--oos">
                        {p.oosDayCount}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
