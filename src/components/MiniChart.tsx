import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { DailyPoint } from '../types';

interface MiniChartProps {
  data: DailyPoint[];
  height?: number;
  showLabels?: boolean;  // true for expanded view
}

const VB_W = 400; // SVG viewBox width (display size controlled by CSS width)

function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

export default function MiniChart({ data, height = 48, showLabels = false }: MiniChartProps) {
  const content = useMemo(() => {
    if (data.length === 0) return null;

    const n = data.length;
    const padX   = showLabels ? 10 : 3;
    const padTop = showLabels ? 6  : 3;
    const padBot = showLabels ? 24 : 3; // extra space for x-axis labels

    const chartW = VB_W - padX * 2;
    const chartH = height - padTop - padBot;

    const maxUnits   = Math.max(...data.map(d => d.units),   1);
    const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
    const hasRevenue = data.some(d => d.revenue > 0);

    const xPos = (i: number) =>
      padX + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const yU = (v: number) => padTop + chartH * (1 - v / maxUnits);
    const yR = (v: number) => padTop + chartH * (1 - v / maxRevenue);

    const unitsPts   = data.map((d, i) => ({ x: xPos(i), y: yU(d.units) }));
    const revPts     = data.map((d, i) => ({ x: xPos(i), y: yR(d.revenue) }));
    const bandW      = n > 1 ? (chartW / (n - 1)) : chartW;

    // X-axis date labels (expanded only, ~6 evenly spaced)
    const labelStep = Math.max(1, Math.ceil(n / 6));
    const labels: { x: number; text: string }[] = [];
    if (showLabels) {
      for (let i = 0; i < n; i += labelStep) {
        labels.push({
          x: xPos(i),
          text: format(parseISO(data[i].date), n <= 14 ? 'MMM d' : 'M/d'),
        });
      }
      // Always include last date if it wasn't already added
      const lastIdx = n - 1;
      if (labels.length === 0 || labels[labels.length - 1].x !== xPos(lastIdx)) {
        labels.push({
          x: xPos(lastIdx),
          text: format(parseISO(data[lastIdx].date), n <= 14 ? 'MMM d' : 'M/d'),
        });
      }
    }

    const strokeW = showLabels ? 2 : 1.5;

    return (
      <>
        {/* OOS day bands */}
        {data.map((d, i) =>
          d.isOos ? (
            <rect
              key={`band-${i}`}
              x={xPos(i) - bandW / 2}
              y={padTop}
              width={bandW}
              height={chartH}
              fill="#fecaca"
              opacity={0.65}
            />
          ) : null
        )}

        {/* Baseline */}
        <line
          x1={padX} y1={padTop + chartH}
          x2={padX + chartW} y2={padTop + chartH}
          stroke="#e2e8f0" strokeWidth={0.5}
        />

        {/* Revenue line — green */}
        {hasRevenue && (
          <path
            d={buildPath(revPts)}
            fill="none"
            stroke="#16a34a"
            strokeWidth={strokeW}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Units Sold line — blue */}
        <path
          d={buildPath(unitsPts)}
          fill="none"
          stroke="#2563eb"
          strokeWidth={strokeW}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* OOS dots on units line — red */}
        {data.map((d, i) =>
          d.isOos ? (
            <circle
              key={`dot-${i}`}
              cx={xPos(i)}
              cy={unitsPts[i].y}
              r={showLabels ? 3.5 : 2}
              fill="#dc2626"
              stroke="#fff"
              strokeWidth={0.8}
            />
          ) : null
        )}

        {/* Single-point dots when n === 1 */}
        {n === 1 && (
          <>
            <circle cx={xPos(0)} cy={unitsPts[0].y} r={3} fill="#2563eb" />
            {hasRevenue && (
              <circle cx={xPos(0)} cy={revPts[0].y} r={3} fill="#16a34a" />
            )}
          </>
        )}

        {/* X-axis date labels */}
        {labels.map((lbl, i) => (
          <text
            key={`lbl-${i}`}
            x={lbl.x}
            y={height - 5}
            textAnchor="middle"
            fontSize={10}
            fill="#64748b"
          >
            {lbl.text}
          </text>
        ))}
      </>
    );
  }, [data, height, showLabels]);

  if (!content) {
    return <span className="mini-chart__empty">—</span>;
  }

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {content}
    </svg>
  );
}
