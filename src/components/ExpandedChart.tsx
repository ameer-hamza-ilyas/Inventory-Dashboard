import { useState, useRef, useCallback, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { DailyPoint } from '../types';

interface ExpandedChartProps {
  data: DailyPoint[];
  hasPriceData: boolean;
}

interface TooltipState {
  pixelX: number;
  pixelY: number;
  svgW: number;
  idx: number;
}

const VB_W    = 720;
const VB_H    = 280;
const PAD_L   = 58;
const PAD_R   = 66;
const PAD_T   = 14;
const PAD_B   = 36;
const CHART_W = VB_W - PAD_L - PAD_R;
const CHART_H = VB_H - PAD_T - PAD_B;
const GRID_N  = 5;

function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

function fmtUnitsAxis(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'k';
  return v.toLocaleString();
}

function fmtRevAxis(v: number): string {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'k';
  return '$' + v.toLocaleString();
}

export default function ExpandedChart({ data, hasPriceData }: ExpandedChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const computed = useMemo(() => {
    const n = data.length;
    if (n === 0) return null;

    const maxUnits   = niceMax(Math.max(...data.map(d => d.units),   1));
    const maxRevenue = hasPriceData ? niceMax(Math.max(...data.map(d => d.revenue), 1)) : 1;

    const xPos = (i: number) =>
      PAD_L + (n > 1 ? (i / (n - 1)) * CHART_W : CHART_W / 2);
    const yU = (v: number) => PAD_T + CHART_H * (1 - v / maxUnits);
    const yR = (v: number) => PAD_T + CHART_H * (1 - v / maxRevenue);

    const unitsPts = data.map((d, i) => ({ x: xPos(i), y: yU(d.units) }));
    const revPts   = data.map((d, i) => ({ x: xPos(i), y: yR(d.revenue) }));

    const bandW = n > 1 ? CHART_W / (n - 1) : CHART_W;

    const labelStep = Math.max(1, Math.ceil(n / 8));
    const xLabels: { x: number; text: string }[] = [];
    for (let i = 0; i < n; i += labelStep) {
      xLabels.push({
        x: xPos(i),
        text: format(parseISO(data[i].date), n <= 14 ? 'MMM d' : 'M/d'),
      });
    }
    if (xLabels.length === 0 || xLabels[xLabels.length - 1].x < xPos(n - 1) - 2) {
      xLabels.push({
        x: xPos(n - 1),
        text: format(parseISO(data[n - 1].date), n <= 14 ? 'MMM d' : 'M/d'),
      });
    }

    const gridLines = Array.from({ length: GRID_N + 1 }, (_, i) => {
      const frac = i / GRID_N;
      return {
        y:        PAD_T + frac * CHART_H,
        unitsVal: Math.round(maxUnits   * (1 - frac)),
        revVal:   hasPriceData ? Math.round(maxRevenue * (1 - frac)) : null,
      };
    });

    const showDots = n <= 90;

    return { n, unitsPts, revPts, bandW, xLabels, gridLines, showDots };
  }, [data, hasPriceData]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !computed) return;
    const rect   = svgRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    const svgX   = (pixelX / rect.width) * VB_W;
    const frac   = Math.max(0, Math.min(1, (svgX - PAD_L) / CHART_W));
    const idx    = Math.round(frac * (computed.n - 1));
    setTooltip({ pixelX, pixelY, svgW: rect.width, idx });
  }, [computed]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (!computed) return null;

  const { n, unitsPts, revPts, bandW, xLabels, gridLines, showDots } = computed;
  const activeIdx   = tooltip?.idx ?? -1;
  const activePoint = activeIdx >= 0 ? data[activeIdx] : null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height={260}
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Axis border lines */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H}
          stroke="#cbd5e1" strokeWidth={1} />
        {hasPriceData && (
          <line x1={PAD_L + CHART_W} y1={PAD_T} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H}
            stroke="#dcfce7" strokeWidth={1} />
        )}

        {/* Horizontal grid lines */}
        {gridLines.map((gl, i) => (
          <line key={`g${i}`}
            x1={PAD_L} y1={gl.y} x2={PAD_L + CHART_W} y2={gl.y}
            stroke={i === GRID_N ? '#cbd5e1' : '#e2e8f0'}
            strokeWidth={i === GRID_N ? 1 : 0.75}
            strokeDasharray={i === 0 || i === GRID_N ? undefined : '3,3'}
          />
        ))}

        {/* Left Y-axis labels — Units Sold */}
        {gridLines.map((gl, i) => (
          <text key={`yu${i}`} x={PAD_L - 7} y={gl.y + 4}
            textAnchor="end" fontSize={9} fill="#475569">
            {fmtUnitsAxis(gl.unitsVal)}
          </text>
        ))}

        {/* Left Y-axis title */}
        <text
          x={9} y={PAD_T + CHART_H / 2}
          textAnchor="middle" fontSize={9} fill="#64748b"
          transform={`rotate(-90, 9, ${PAD_T + CHART_H / 2})`}
        >
          Units Sold
        </text>

        {/* Right Y-axis labels — Revenue */}
        {hasPriceData && gridLines.map((gl, i) => (
          <text key={`yr${i}`} x={PAD_L + CHART_W + 7} y={gl.y + 4}
            textAnchor="start" fontSize={9} fill="#15803d">
            {fmtRevAxis(gl.revVal!)}
          </text>
        ))}

        {/* Right Y-axis title */}
        {hasPriceData && (
          <text
            x={VB_W - 8} y={PAD_T + CHART_H / 2}
            textAnchor="middle" fontSize={9} fill="#15803d"
            transform={`rotate(90, ${VB_W - 8}, ${PAD_T + CHART_H / 2})`}
          >
            Revenue
          </text>
        )}

        {/* OOS bands — semi-transparent red vertical columns */}
        {data.map((d, i) =>
          d.isOos ? (
            <rect key={`oos${i}`}
              x={unitsPts[i].x - bandW / 2}
              y={PAD_T}
              width={Math.max(bandW, 2)}
              height={CHART_H}
              fill="#ef4444"
              opacity={0.18}
            />
          ) : null
        )}

        {/* Revenue line — green */}
        {hasPriceData && (
          <>
            <path
              d={buildPath(revPts)}
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {showDots && revPts.map((pt, i) => (
              <circle key={`rd${i}`}
                cx={pt.x} cy={pt.y}
                r={n > 45 ? 1.8 : 3}
                fill="#16a34a"
                stroke="#fff"
                strokeWidth={n > 45 ? 0.8 : 1.2}
              />
            ))}
          </>
        )}

        {/* Units Sold line — blue */}
        <path
          d={buildPath(unitsPts)}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showDots && unitsPts.map((pt, i) => (
          <circle key={`ud${i}`}
            cx={pt.x} cy={pt.y}
            r={n > 45 ? 1.8 : 3}
            fill={data[i].isOos ? '#dc2626' : '#2563eb'}
            stroke="#fff"
            strokeWidth={n > 45 ? 0.8 : 1.2}
          />
        ))}

        {/* Hover crosshair + enlarged markers */}
        {tooltip && activeIdx >= 0 && (
          <>
            <line
              x1={unitsPts[activeIdx].x} y1={PAD_T}
              x2={unitsPts[activeIdx].x} y2={PAD_T + CHART_H}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,2"
            />
            <circle
              cx={unitsPts[activeIdx].x} cy={unitsPts[activeIdx].y}
              r={5} fill="#2563eb" stroke="#fff" strokeWidth={1.5}
            />
            {hasPriceData && (
              <circle
                cx={revPts[activeIdx].x} cy={revPts[activeIdx].y}
                r={5} fill="#16a34a" stroke="#fff" strokeWidth={1.5}
              />
            )}
          </>
        )}

        {/* X-axis date labels */}
        {xLabels.map((lbl, i) => (
          <text key={`xl${i}`}
            x={lbl.x} y={VB_H - 7}
            textAnchor="middle" fontSize={9.5} fill="#64748b">
            {lbl.text}
          </text>
        ))}

        {/* Transparent overlay — captures mouse events across the full chart area */}
        <rect x={PAD_L} y={PAD_T} width={CHART_W} height={CHART_H} fill="transparent" />
      </svg>

      {/* Floating tooltip */}
      {tooltip && activePoint && (
        <div
          className="expanded-chart__tooltip"
          style={{
            left: tooltip.pixelX,
            top:  tooltip.pixelY,
            transform: tooltip.pixelX > tooltip.svgW * 0.62
              ? 'translate(calc(-100% - 14px), -50%)'
              : 'translate(14px, -50%)',
          }}
        >
          <div className="expanded-chart__tooltip-date">
            {format(parseISO(activePoint.date), 'MMM d, yyyy')}
          </div>
          <div className="expanded-chart__tooltip-row">
            <span className="expanded-chart__tooltip-dot expanded-chart__tooltip-dot--blue" />
            <span>Units Sold:&nbsp;<strong>{activePoint.units.toLocaleString()}</strong></span>
          </div>
          {hasPriceData && (
            <div className="expanded-chart__tooltip-row">
              <span className="expanded-chart__tooltip-dot expanded-chart__tooltip-dot--green" />
              <span>Revenue:&nbsp;<strong>
                {'$' + activePoint.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong></span>
            </div>
          )}
          {activePoint.isOos && (
            <div className="expanded-chart__tooltip-oos">
              ⚠ Out of Stock
            </div>
          )}
        </div>
      )}
    </div>
  );
}
