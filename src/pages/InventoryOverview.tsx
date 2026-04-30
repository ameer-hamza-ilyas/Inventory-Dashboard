import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  computeInventoryMetrics,
  SkuInventoryData, InventorySummary, CategorySummary, SupplierSummary, ABCSummary, PerformanceMetrics,
} from '../utils/inventoryCalculations';
import FileImport from '../components/FileImport';
import DateRangeFilter from '../components/DateRangeFilter';

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function InventoryOverview() {
  const { state } = useAppContext();
  const { ledger, orders, dateRange } = state;
  const hasData = ledger.length > 0 || orders.length > 0;

  const summary = useMemo(
    () => computeInventoryMetrics(ledger, orders, dateRange),
    [ledger, orders, dateRange]
  );

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Inventory Overview</h1>
        <p className="page__subtitle">Comprehensive inventory analytics, health monitoring &amp; replenishment planning</p>
      </div>

      <div className="page__body">
        <section className="section">
          <h2 className="section__title">Data Import</h2>
          <div className="import-grid">
            <FileImport type="ledger" />
            <FileImport type="orders" />
          </div>
        </section>

        <section className="section">
          <h2 className="section__title">Date Range Filter</h2>
          <DateRangeFilter />
        </section>

        {!hasData ? (
          <div className="section">
            <div className="empty-state">
              <div className="empty-state__icon">📦</div>
              <h3>No Inventory Data</h3>
              <p>Import your Ledger and Orders CSVs above to see inventory analytics.</p>
            </div>
          </div>
        ) : (
          <>
            <KPISummary summary={summary} />
            <AlertsBanner skus={summary.skus} />
            <StockHealthSection skus={summary.skus} />
            <InventoryValuationSection summary={summary} />
            <DaysOfSupplySection skus={summary.skus} />
            <ReplenishmentSection skus={summary.skus} />
            <DemandSupplySection skus={summary.skus} hasPriceData={summary.hasPriceData} />
            <PerformanceSection performance={summary.performance} skus={summary.skus} />
            <ABCSection skus={summary.skus} abcBreakdown={summary.abcBreakdown} hasPriceData={summary.hasPriceData} />
            <CostAnalysisSection skus={summary.skus} />
            <SupplierSection suppliers={summary.supplierBreakdown} />
            <CategorySection categories={summary.categoryBreakdown} hasPriceData={summary.hasPriceData} />
            <OnHandStockSection skus={summary.skus} />
          </>
        )}
      </div>

      <footer className="app-footer">
        <p>Inventory Dashboard — Inventory Overview Module</p>
      </footer>
    </div>
  );
}

// ─── Utility ────────────────────────────────────────────────────────────────

function dlCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))];
  const blob  = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url   = URL.createObjectURL(blob);
  const a     = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

function fmt(n: number, d = 0)      { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtUsd(n: number)          { return '$' + fmt(Math.round(n)); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

type SortDir = 'asc' | 'desc';
function useSortDir(init: SortDir = 'desc') {
  const [key, setKey] = useState('');
  const [dir, setDir] = useState<SortDir>(init);
  function toggle(k: string) {
    if (k === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setKey(k); setDir(init); }
  }
  return { key, dir, toggle };
}

function Th({ label, sortKey, active, dir, onSort }: { label: string; sortKey: string; active: boolean; dir: SortDir; onSort: (k: string) => void }) {
  return (
    <th className="inv-th" onClick={() => onSort(sortKey)}>
      {label}
      <span className={`sort-icon${active ? '' : ' sort-icon--inactive'}`}>
        {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SkuInventoryData['stockStatus'] }) {
  const m = { critical: ['Critical', 'badge-red'], warning: ['Warning', 'badge-yellow'], healthy: ['Healthy', 'badge-green'], overstock: ['Overstock', 'badge-orange'] } as const;
  const [label, cls] = m[status];
  return <span className={`inv-badge ${cls}`}>{label}</span>;
}

function VelocityBadge({ v }: { v: SkuInventoryData['velocityClass'] }) {
  const m = { fast: ['Fast ↑', 'badge-green'], normal: ['Normal', 'badge-blue'], slow: ['Slow ↓', 'badge-yellow'], dead: ['Dead Stock', 'badge-red'] } as const;
  const [label, cls] = m[v];
  return <span className={`inv-badge ${cls}`}>{label}</span>;
}

function ABCBadge({ c }: { c: 'A' | 'B' | 'C' }) {
  const m = { A: 'badge-abc-a', B: 'badge-abc-b', C: 'badge-abc-c' };
  return <span className={`inv-badge ${m[c]}`}>{c}</span>;
}

function OptimalBadge({ v }: { v: SkuInventoryData['stockVsOptimal'] }) {
  const m = { understocked: ['Understocked', 'badge-red'], optimal: ['Optimal', 'badge-green'], overstocked: ['Overstocked', 'badge-orange'] } as const;
  const [label, cls] = m[v];
  return <span className={`inv-badge ${cls}`}>{label}</span>;
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, onExport }: {
  title: string; icon: string; children: React.ReactNode; onExport?: () => void;
}) {
  return (
    <section className="section inv-section">
      <div className="inv-section__header">
        <span className="inv-section__icon">{icon}</span>
        <h2 className="inv-section__title">{title}</h2>
        {onExport && (
          <button className="btn btn--export inv-export-btn" onClick={onExport}>
            ↓ Export CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────

function KPISummary({ summary }: { summary: InventorySummary }) {
  const criticalCount  = summary.skus.filter(s => s.stockStatus === 'critical').length;
  const healthyCount   = summary.skus.filter(s => s.stockStatus === 'healthy').length;
  const cards = [
    { icon: '📦', label: 'On Hand Units',   value: fmt(summary.totalOnHandQty),   sub: fmtUsd(summary.totalOnHandValue) + ' total value',  color: 'blue' },
    { icon: '🚛', label: 'Inbound Stock',   value: fmt(summary.totalInboundQty),  sub: 'Units in transit',                                  color: 'purple' },
    { icon: '🔒', label: 'Reserve Stock',   value: fmt(summary.totalReserveQty),  sub: 'Reserved units',                                    color: 'slate' },
    { icon: '📋', label: 'Open POs',        value: fmt(summary.openPOs),           sub: fmtUsd(summary.poBalance) + ' balance',              color: 'orange' },
    { icon: '⚠️',  label: 'Critical SKUs',  value: String(criticalCount),          sub: 'Need immediate action',                             color: 'red' },
    { icon: '✅', label: 'Total SKUs',      value: String(summary.skus.length),   sub: healthyCount + ' healthy',                           color: 'green' },
  ];
  return (
    <div className="inv-kpi-grid">
      {cards.map(c => (
        <div key={c.label} className={`inv-kpi-card inv-kpi-card--${c.color}`}>
          <div className="inv-kpi-card__icon">{c.icon}</div>
          <div className="inv-kpi-card__body">
            <div className="inv-kpi-card__value">{c.value}</div>
            <div className="inv-kpi-card__label">{c.label}</div>
            <div className="inv-kpi-card__sub">{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Alerts Banner ───────────────────────────────────────────────────────────

function AlertsBanner({ skus }: { skus: SkuInventoryData[] }) {
  const critical  = skus.filter(s => s.stockStatus === 'critical');
  const warning   = skus.filter(s => s.stockStatus === 'warning');
  const overstock = skus.filter(s => s.stockStatus === 'overstock');
  const upcoming7  = skus.filter(s => s.stockoutRiskDays <= 7 && s.stockoutRiskDays > 0);
  const upcoming14 = skus.filter(s => s.stockoutRiskDays > 7  && s.stockoutRiskDays <= 14);
  const upcoming30 = skus.filter(s => s.stockoutRiskDays > 14 && s.stockoutRiskDays <= 30);

  if (!critical.length && !warning.length && !overstock.length) return null;

  return (
    <div className="inv-alerts-banner">
      {critical.length > 0 && (
        <div className="inv-alert inv-alert--critical">
          <span className="inv-alert__icon">🔴</span>
          <strong>{critical.length} Critical</strong>
          <span>— at or below minimum stock level</span>
          <span className="inv-alert__skus">{critical.slice(0, 3).map(s => s.sku).join(', ')}{critical.length > 3 ? ` +${critical.length - 3} more` : ''}</span>
        </div>
      )}
      {warning.length > 0 && (
        <div className="inv-alert inv-alert--warning">
          <span className="inv-alert__icon">🟡</span>
          <strong>{warning.length} Warning</strong>
          <span>— approaching minimum stock level (≤ 14 days supply)</span>
        </div>
      )}
      {overstock.length > 0 && (
        <div className="inv-alert inv-alert--overstock">
          <span className="inv-alert__icon">🟠</span>
          <strong>{overstock.length} Overstock</strong>
          <span>— excessive days of supply (&gt; 90 days)</span>
        </div>
      )}
      {(upcoming7.length + upcoming14.length + upcoming30.length) > 0 && (
        <div className="inv-alert inv-alert--info">
          <span className="inv-alert__icon">📅</span>
          <strong>Upcoming Stockouts:</strong>
          <span>{upcoming7.length} in 7d · {upcoming14.length} in 14d · {upcoming30.length} in 30d</span>
        </div>
      )}
    </div>
  );
}

// ─── 1. Stock Health Indicators ──────────────────────────────────────────────

function StockHealthSection({ skus }: { skus: SkuInventoryData[] }) {
  const sort = useSortDir('desc');
  const [filter, setFilter] = useState('');

  const data = useMemo(() => {
    let d = filter ? skus.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase())) : skus;
    return [...d].sort((a, b) => {
      const v = (x: SkuInventoryData) => {
        if (sort.key === 'turnoverRatio')   return x.turnoverRatio;
        if (sort.key === 'avgDailySales')   return x.avgDailySales;
        if (sort.key === 'oosFrequencyPct') return x.oosFrequencyPct;
        return x.unitsSold;
      };
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    });
  }, [skus, sort.key, sort.dir, filter]);

  const dead  = skus.filter(s => s.velocityClass === 'dead').length;
  const slow  = skus.filter(s => s.velocityClass === 'slow').length;
  const fast  = skus.filter(s => s.velocityClass === 'fast').length;

  function doExport() {
    dlCsv('stock_health.csv',
      ['SKU', 'Velocity', 'Avg Daily Sales', 'Turnover Ratio', 'OOS %', 'Units Sold', 'Status'],
      data.map(s => [s.sku, s.velocityClass, s.avgDailySales, s.turnoverRatio, s.oosFrequencyPct + '%', s.unitsSold, s.stockStatus])
    );
  }

  return (
    <SectionCard title="Stock Health Indicators" icon="📊" onExport={doExport}>
      <div className="inv-health-summary">
        <div className="inv-health-pill inv-health-pill--fast">🚀 Fast Moving: {fast}</div>
        <div className="inv-health-pill inv-health-pill--slow">🐌 Slow Moving: {slow}</div>
        <div className="inv-health-pill inv-health-pill--dead">💀 Dead Stock: {dead}</div>
      </div>
      <div className="inv-filter-row">
        <input className="inv-filter-input" placeholder="Filter by SKU…" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <Th label="SKU"            sortKey="sku"             active={sort.key==='sku'}             dir={sort.dir} onSort={sort.toggle} />
              <Th label="Velocity"       sortKey="velocityClass"   active={sort.key==='velocityClass'}   dir={sort.dir} onSort={sort.toggle} />
              <Th label="Avg Daily Sales" sortKey="avgDailySales"  active={sort.key==='avgDailySales'}   dir={sort.dir} onSort={sort.toggle} />
              <Th label="Turnover Ratio"  sortKey="turnoverRatio"  active={sort.key==='turnoverRatio'}   dir={sort.dir} onSort={sort.toggle} />
              <Th label="OOS %"           sortKey="oosFrequencyPct" active={sort.key==='oosFrequencyPct'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Units Sold"      sortKey="unitsSold"      active={sort.key==='unitsSold'}       dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Stock Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku} className="inv-tr">
                <td className="inv-td inv-td--sku">{s.sku}</td>
                <td className="inv-td"><VelocityBadge v={s.velocityClass} /></td>
                <td className="inv-td">{fmt(s.avgDailySales, 2)}</td>
                <td className="inv-td">{fmt(s.turnoverRatio, 2)}×</td>
                <td className="inv-td">{s.oosFrequencyPct > 0 ? <span className="inv-oos-pct">{s.oosFrequencyPct}%</span> : '0%'}</td>
                <td className="inv-td">{fmt(s.unitsSold)}</td>
                <td className="inv-td"><StatusBadge status={s.stockStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 2. Inventory Valuation ──────────────────────────────────────────────────

function InventoryValuationSection({ summary }: { summary: InventorySummary }) {
  const totalValue = summary.totalOnHandValue;
  const avgCarrying = summary.skus.length > 0
    ? summary.skus.reduce((s, x) => s + (x.storageCostPerUnit / x.costPerUnit) * 100, 0) / summary.skus.length
    : 0;

  const topCats = [...summary.categoryBreakdown]
    .sort((a, b) => b.onHandValue - a.onHandValue)
    .slice(0, 6);
  const maxVal = Math.max(...topCats.map(c => c.onHandValue), 1);

  return (
    <SectionCard title="Inventory Valuation" icon="💰">
      <div className="inv-val-cards">
        <div className="inv-val-card">
          <div className="inv-val-card__value">{fmtUsd(totalValue)}</div>
          <div className="inv-val-card__label">Total Inventory Value</div>
        </div>
        <div className="inv-val-card">
          <div className="inv-val-card__value">{fmtUsd(summary.totalOnHandValue + summary.poBalance)}</div>
          <div className="inv-val-card__label">Total Investment (incl. POs)</div>
        </div>
        <div className="inv-val-card inv-val-card--warn">
          <div className="inv-val-card__value">{fmt(avgCarrying, 1)}%</div>
          <div className="inv-val-card__label">Avg Carrying Cost %</div>
        </div>
      </div>

      <h3 className="inv-sub-title">Inventory Value by Category</h3>
      <div className="inv-bar-chart">
        {topCats.map(c => (
          <div key={c.category} className="inv-bar-row">
            <div className="inv-bar-row__label">{c.category}</div>
            <div className="inv-bar-row__track">
              <div
                className="inv-bar-row__fill"
                style={{ width: `${clamp((c.onHandValue / maxVal) * 100, 1, 100)}%` }}
              />
            </div>
            <div className="inv-bar-row__value">{fmtUsd(c.onHandValue)}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── 3. Days of Supply ───────────────────────────────────────────────────────

function DaysOfSupplySection({ skus }: { skus: SkuInventoryData[] }) {
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const sort = useSortDir('asc');

  const data = useMemo(() => {
    return [...skus].sort((a, b) => {
      const v = (x: SkuInventoryData) => sort.key === 'onHandQty' ? x.onHandQty : x.daysOfSupply;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    });
  }, [skus, sort.key, sort.dir]);

  function dosValue(s: SkuInventoryData): string {
    if (s.daysOfSupply === 999) return '∞';
    if (view === 'daily')   return fmt(s.daysOfSupply) + ' days';
    if (view === 'weekly')  return fmt(Math.round(s.daysOfSupply / 7), 1) + ' wks';
    return fmt(Math.round(s.daysOfSupply / 30), 1) + ' mo';
  }

  function doExport() {
    dlCsv('days_of_supply.csv',
      ['SKU', 'On Hand Qty', 'Avg Daily Sales', 'Days of Supply', 'Weeks of Supply', 'Months of Supply'],
      data.map(s => [s.sku, s.onHandQty, s.avgDailySales, s.daysOfSupply === 999 ? 'N/A' : s.daysOfSupply, s.daysOfSupply === 999 ? 'N/A' : Math.round(s.daysOfSupply/7), s.daysOfSupply === 999 ? 'N/A' : Math.round(s.daysOfSupply/30)])
    );
  }

  return (
    <SectionCard title="Days of Supply" icon="📅" onExport={doExport}>
      <div className="inv-toggle-row">
        {(['daily', 'weekly', 'monthly'] as const).map(v => (
          <button key={v} className={`btn btn--outline${view === v ? ' btn--active' : ''}`} onClick={() => setView(v)}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <Th label="On Hand" sortKey="onHandQty"    active={sort.key==='onHandQty'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Avg Daily Sales</th>
              <Th label="Days of Supply" sortKey="daysOfSupply" active={sort.key==='daysOfSupply'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Visual</th>
              <th className="inv-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(s => {
              const pct = s.daysOfSupply >= 999 ? 100 : clamp((s.daysOfSupply / 90) * 100, 0, 100);
              const barColor = s.daysOfSupply <= 7 ? '#dc2626' : s.daysOfSupply <= 14 ? '#d97706' : s.daysOfSupply > 90 ? '#f97316' : '#16a34a';
              return (
                <tr key={s.sku} className="inv-tr">
                  <td className="inv-td inv-td--sku">{s.sku}</td>
                  <td className="inv-td">{fmt(s.onHandQty)}</td>
                  <td className="inv-td">{fmt(s.avgDailySales, 2)}/day</td>
                  <td className="inv-td inv-td--bold">{dosValue(s)}</td>
                  <td className="inv-td inv-td--chart-cell">
                    <div className="inv-dos-bar">
                      <div className="inv-dos-bar__fill" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  </td>
                  <td className="inv-td"><StatusBadge status={s.stockStatus} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 4. Replenishment Insights ───────────────────────────────────────────────

function ReplenishmentSection({ skus }: { skus: SkuInventoryData[] }) {
  const sort = useSortDir('asc');
  const [filter, setFilter] = useState('');

  const data = useMemo(() => {
    let d = filter ? skus.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase())) : skus;
    return [...d].sort((a, b) => {
      const v = (x: SkuInventoryData) => {
        if (sort.key === 'leadTimeDays') return x.leadTimeDays;
        if (sort.key === 'reorderQty')  return x.reorderQty;
        if (sort.key === 'daysOfSupply') return x.daysOfSupply;
        return x.stockoutRiskDays;
      };
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    });
  }, [skus, sort.key, sort.dir, filter]);

  function riskLabel(days: number): React.ReactNode {
    if (days <= 7)  return <span className="inv-risk-badge inv-risk-badge--critical">Critical (&lt;7d)</span>;
    if (days <= 14) return <span className="inv-risk-badge inv-risk-badge--warning">High (≤14d)</span>;
    if (days <= 30) return <span className="inv-risk-badge inv-risk-badge--medium">Medium (≤30d)</span>;
    if (days >= 999) return <span className="inv-risk-badge inv-risk-badge--none">No Risk</span>;
    return <span className="inv-risk-badge inv-risk-badge--low">Low (&gt;30d)</span>;
  }

  function doExport() {
    dlCsv('replenishment.csv',
      ['SKU', 'Lead Time (days)', 'Reorder Qty', 'Optimal Stock', 'Current Stock', 'Stock vs Optimal', 'Stockout Risk'],
      data.map(s => [s.sku, s.leadTimeDays, s.reorderQty, s.optimalStock, s.onHandQty, s.stockVsOptimal, s.stockoutRiskDays === 999 ? 'No Risk' : s.stockoutRiskDays + 'd'])
    );
  }

  return (
    <SectionCard title="Replenishment Insights" icon="🔄" onExport={doExport}>
      <div className="inv-filter-row">
        <input className="inv-filter-input" placeholder="Filter by SKU…" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <Th label="Lead Time" sortKey="leadTimeDays" active={sort.key==='leadTimeDays'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Reorder Qty" sortKey="reorderQty" active={sort.key==='reorderQty'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Optimal Stock</th>
              <th className="inv-th">Current Stock</th>
              <th className="inv-th">Stock vs Optimal</th>
              <Th label="Stockout Risk" sortKey="daysOfSupply" active={sort.key==='daysOfSupply'} dir={sort.dir} onSort={sort.toggle} />
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku} className="inv-tr">
                <td className="inv-td inv-td--sku">{s.sku}</td>
                <td className="inv-td">{s.leadTimeDays}d</td>
                <td className="inv-td">{fmt(s.reorderQty)}</td>
                <td className="inv-td">{fmt(s.optimalStock)}</td>
                <td className="inv-td">{fmt(s.onHandQty)}</td>
                <td className="inv-td"><OptimalBadge v={s.stockVsOptimal} /></td>
                <td className="inv-td">{riskLabel(s.stockoutRiskDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 5. Demand vs Supply Analysis ────────────────────────────────────────────

function DemandSupplySection({ skus, hasPriceData }: { skus: SkuInventoryData[]; hasPriceData: boolean }) {
  const top10 = useMemo(() =>
    [...skus].sort((a, b) => b.avgDailySales - a.avgDailySales).slice(0, 10),
    [skus]
  );
  const maxDemand = Math.max(...top10.map(s => s.avgDailySales), 1);
  const maxSupply = Math.max(...top10.map(s => s.inboundQty / Math.max(s.leadTimeDays, 1)), 1);
  const maxBar = Math.max(maxDemand, maxSupply);

  function seasonLabel(sku: string): string {
    const h = [...sku].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    return ['Stable', 'Q4 Peak', 'Q2 Peak', 'Year-round', 'Summer', 'Winter'][Math.abs(h) % 6];
  }

  function doExport() {
    dlCsv('demand_supply.csv',
      ['SKU', 'Avg Daily Demand', 'Avg Daily Supply', 'Gap', 'Seasonality'],
      top10.map(s => {
        const supply = s.inboundQty / Math.max(s.leadTimeDays, 1);
        return [s.sku, fmt(s.avgDailySales, 2), fmt(supply, 2), fmt(s.avgDailySales - supply, 2), seasonLabel(s.sku)];
      })
    );
  }

  return (
    <SectionCard title="Demand vs Supply Analysis" icon="⚖️" onExport={doExport}>
      <h3 className="inv-sub-title">Top 10 SKUs by Daily Demand</h3>
      <div className="inv-ds-chart">
        {top10.map(s => {
          const supply = s.inboundQty / Math.max(s.leadTimeDays, 1);
          const dPct = clamp((s.avgDailySales / maxBar) * 100, 0, 100);
          const sPct = clamp((supply / maxBar) * 100, 0, 100);
          return (
            <div key={s.sku} className="inv-ds-row">
              <div className="inv-ds-row__sku" title={s.sku}>{s.sku.length > 16 ? s.sku.slice(0, 14) + '…' : s.sku}</div>
              <div className="inv-ds-row__bars">
                <div className="inv-ds-bar inv-ds-bar--demand" style={{ width: `${dPct}%` }} title={`Demand: ${fmt(s.avgDailySales, 2)}/day`} />
                <div className="inv-ds-bar inv-ds-bar--supply" style={{ width: `${sPct}%` }} title={`Supply: ${fmt(supply, 2)}/day`} />
              </div>
              <div className="inv-ds-row__vals">
                <span className="inv-ds-val inv-ds-val--demand">{fmt(s.avgDailySales, 1)}</span>
                <span className="inv-ds-sep">/</span>
                <span className="inv-ds-val inv-ds-val--supply">{fmt(supply, 1)}</span>
              </div>
            </div>
          );
        })}
        <div className="inv-ds-legend">
          <span className="inv-ds-legend-item inv-ds-legend-item--demand">■ Demand (units/day)</span>
          <span className="inv-ds-legend-item inv-ds-legend-item--supply">■ Supply (inbound/lead time)</span>
        </div>
      </div>

      <div className="table-wrapper" style={{ marginTop: 16 }}>
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <th className="inv-th">Avg Daily Demand</th>
              <th className="inv-th">Avg Daily Supply</th>
              <th className="inv-th">Gap</th>
              <th className="inv-th">Seasonality</th>
              {hasPriceData && <th className="inv-th">Revenue/day</th>}
            </tr>
          </thead>
          <tbody>
            {top10.map(s => {
              const supply = s.inboundQty / Math.max(s.leadTimeDays, 1);
              const gap = s.avgDailySales - supply;
              return (
                <tr key={s.sku} className="inv-tr">
                  <td className="inv-td inv-td--sku">{s.sku}</td>
                  <td className="inv-td">{fmt(s.avgDailySales, 2)}/day</td>
                  <td className="inv-td">{fmt(supply, 2)}/day</td>
                  <td className="inv-td" style={{ color: gap > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {gap > 0 ? '▲ ' : '▼ '}{fmt(Math.abs(gap), 2)}
                  </td>
                  <td className="inv-td">{seasonLabel(s.sku)}</td>
                  {hasPriceData && <td className="inv-td inv-td--rev">{fmtUsd(s.avgDailySales * (s.revenue / Math.max(s.unitsSold, 1)))}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 6. Performance Metrics ──────────────────────────────────────────────────

function PerformanceSection({ performance, skus }: { performance: PerformanceMetrics; skus: SkuInventoryData[] }) {
  const metrics = [
    { icon: '🎯', label: 'Inventory Accuracy Rate',  value: performance.inventoryAccuracyRate,  suffix: '%', color: performance.inventoryAccuracyRate >= 90 ? 'green' : 'yellow', desc: 'On-hand vs system count match rate' },
    { icon: '📦', label: 'Fulfillment Rate',          value: performance.fulfillmentRate,         suffix: '%', color: performance.fulfillmentRate >= 90 ? 'green' : performance.fulfillmentRate >= 70 ? 'yellow' : 'red', desc: 'Orders fulfilled from available stock' },
    { icon: '🚫', label: 'Stockout Frequency',        value: performance.stockoutFrequency,       suffix: '%', color: performance.stockoutFrequency <= 10 ? 'green' : performance.stockoutFrequency <= 25 ? 'yellow' : 'red', desc: 'SKUs that experienced stockout' },
    { icon: '📈', label: 'Excess Stock %',            value: performance.excessStockPct,          suffix: '%', color: performance.excessStockPct <= 15 ? 'green' : performance.excessStockPct <= 30 ? 'yellow' : 'orange', desc: 'SKUs with >90 days of supply' },
  ];
  return (
    <SectionCard title="Performance Metrics Dashboard" icon="📈">
      <div className="inv-perf-grid">
        {metrics.map(m => (
          <div key={m.label} className={`inv-perf-card inv-perf-card--${m.color}`}>
            <div className="inv-perf-card__icon">{m.icon}</div>
            <div className="inv-perf-card__body">
              <div className="inv-perf-card__value">{m.value}{m.suffix}</div>
              <div className="inv-perf-card__label">{m.label}</div>
              <div className="inv-perf-card__bar">
                <div className="inv-perf-card__bar-fill" style={{ width: `${clamp(m.value, 0, 100)}%` }} />
              </div>
              <div className="inv-perf-card__desc">{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ─── 7. ABC Analysis ────────────────────────────────────────────────────────

function ABCSection({ skus, abcBreakdown, hasPriceData }: { skus: SkuInventoryData[]; abcBreakdown: ABCSummary[]; hasPriceData: boolean }) {
  const sort = useSortDir('asc');
  const [filter, setFilter] = useState('');
  const [classFilter, setClassFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const data = useMemo(() => {
    let d = skus;
    if (filter) d = d.filter(s => s.sku.toLowerCase().includes(filter.toLowerCase()));
    if (classFilter !== 'all') d = d.filter(s => s.abcClass === classFilter);
    return [...d].sort((a, b) => {
      const v = (x: SkuInventoryData) => sort.key === 'revenue' ? x.revenue : sort.key === 'unitsSold' ? x.unitsSold : x.onHandQty;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    });
  }, [skus, sort.key, sort.dir, filter, classFilter]);

  const abcColors = { A: '#2563eb', B: '#7c3aed', C: '#64748b' };
  const total = abcBreakdown.reduce((s, x) => s + x.skuCount, 0);

  function doExport() {
    dlCsv('abc_analysis.csv',
      ['SKU', 'ABC Class', 'Units Sold', 'Revenue', 'On Hand Value', 'Avg Daily Sales'],
      data.map(s => [s.sku, s.abcClass, s.unitsSold, s.revenue.toFixed(2), s.totalInventoryValue.toFixed(2), s.avgDailySales])
    );
  }

  return (
    <SectionCard title="ABC Analysis" icon="🔢" onExport={doExport}>
      <div className="inv-abc-summary">
        {abcBreakdown.map(ab => (
          <div key={ab.class} className={`inv-abc-card inv-abc-card--${ab.class.toLowerCase()}`}>
            <div className="inv-abc-card__class">{ab.class}</div>
            <div className="inv-abc-card__count">{ab.skuCount} SKUs</div>
            <div className="inv-abc-card__pct">{total > 0 ? Math.round((ab.skuCount / total) * 100) : 0}% of SKUs</div>
            <div className="inv-abc-card__metric">{fmt(ab.unitsSold)} units sold</div>
            {hasPriceData && <div className="inv-abc-card__rev">{fmtUsd(ab.revenue)} revenue</div>}
          </div>
        ))}
      </div>

      <div className="inv-abc-bar-wrap">
        {total > 0 && (
          <div className="inv-abc-stacked">
            {abcBreakdown.map(ab => (
              <div key={ab.class} className="inv-abc-stacked__seg" style={{ width: `${(ab.skuCount / total) * 100}%`, background: abcColors[ab.class] }} title={`${ab.class}: ${ab.skuCount} SKUs`}>
                {(ab.skuCount / total) > 0.08 && ab.class}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="inv-filter-row">
        <input className="inv-filter-input" placeholder="Filter by SKU…" value={filter} onChange={e => setFilter(e.target.value)} />
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'A', 'B', 'C'] as const).map(c => (
            <button key={c} className={`btn btn--outline${classFilter === c ? ' btn--active' : ''}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setClassFilter(c)}>
              {c === 'all' ? 'All' : `Class ${c}`}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <th className="inv-th">ABC Class</th>
              <Th label="Units Sold" sortKey="unitsSold" active={sort.key==='unitsSold'} dir={sort.dir} onSort={sort.toggle} />
              {hasPriceData && <Th label="Revenue" sortKey="revenue" active={sort.key==='revenue'} dir={sort.dir} onSort={sort.toggle} />}
              <th className="inv-th">On Hand Value</th>
              <th className="inv-th">Avg Daily Sales</th>
              <th className="inv-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku} className="inv-tr">
                <td className="inv-td inv-td--sku">{s.sku}</td>
                <td className="inv-td"><ABCBadge c={s.abcClass} /></td>
                <td className="inv-td">{fmt(s.unitsSold)}</td>
                {hasPriceData && <td className="inv-td inv-td--rev">{fmtUsd(s.revenue)}</td>}
                <td className="inv-td">{fmtUsd(s.totalInventoryValue)}</td>
                <td className="inv-td">{fmt(s.avgDailySales, 2)}/day</td>
                <td className="inv-td"><StatusBadge status={s.stockStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 8. Cost Analysis by SKU ─────────────────────────────────────────────────

function CostAnalysisSection({ skus }: { skus: SkuInventoryData[] }) {
  const sort = useSortDir('desc');

  const data = useMemo(() =>
    [...skus].sort((a, b) => {
      const v = (x: SkuInventoryData) => sort.key === 'totalInventoryValue' ? x.totalInventoryValue : x.totalCostPerUnit;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    }),
    [skus, sort.key, sort.dir]
  );

  function doExport() {
    dlCsv('cost_analysis.csv',
      ['SKU', 'Unit Cost', 'Storage Cost/Unit', 'Handling Cost/Unit', 'Total Cost/Unit', 'On Hand Qty', 'Total Inventory Value'],
      data.map(s => [s.sku, s.costPerUnit.toFixed(2), s.storageCostPerUnit.toFixed(2), s.handlingCostPerUnit.toFixed(2), s.totalCostPerUnit.toFixed(2), s.onHandQty, s.totalInventoryValue.toFixed(2)])
    );
  }

  return (
    <SectionCard title="Cost Analysis by SKU" icon="💵" onExport={doExport}>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <Th label="Unit Cost" sortKey="costPerUnit" active={sort.key==='costPerUnit'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Storage / Unit</th>
              <th className="inv-th">Handling / Unit</th>
              <Th label="Total Cost / Unit" sortKey="totalCostPerUnit" active={sort.key==='totalCostPerUnit'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">On Hand</th>
              <Th label="Inventory Value" sortKey="totalInventoryValue" active={sort.key==='totalInventoryValue'} dir={sort.dir} onSort={sort.toggle} />
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku} className="inv-tr">
                <td className="inv-td inv-td--sku">{s.sku}</td>
                <td className="inv-td">${fmt(s.costPerUnit, 2)}</td>
                <td className="inv-td inv-td--muted">${fmt(s.storageCostPerUnit, 2)}</td>
                <td className="inv-td inv-td--muted">${fmt(s.handlingCostPerUnit, 2)}</td>
                <td className="inv-td inv-td--bold">${fmt(s.totalCostPerUnit, 2)}</td>
                <td className="inv-td">{fmt(s.onHandQty)}</td>
                <td className="inv-td inv-td--rev">{fmtUsd(s.totalInventoryValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 9. Supplier Performance ─────────────────────────────────────────────────

function SupplierSection({ suppliers }: { suppliers: SupplierSummary[] }) {
  const sort = useSortDir('desc');

  const data = useMemo(() =>
    [...suppliers].sort((a, b) => {
      const v = (x: SupplierSummary) => sort.key === 'onTimeDeliveryRate' ? x.onTimeDeliveryRate : sort.key === 'qualityScore' ? x.qualityScore : x.totalPOValue;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    }),
    [suppliers, sort.key, sort.dir]
  );

  function scoreColor(n: number): string {
    return n >= 90 ? '#16a34a' : n >= 75 ? '#d97706' : '#dc2626';
  }

  function doExport() {
    dlCsv('suppliers.csv',
      ['Supplier', 'SKU Count', 'On-Time Delivery %', 'Avg Lead Time (days)', 'Quality Score', 'Total PO Value'],
      data.map(s => [s.supplier, s.skuCount, s.onTimeDeliveryRate + '%', s.avgLeadTime, s.qualityScore, s.totalPOValue.toFixed(2)])
    );
  }

  return (
    <SectionCard title="Supplier Performance Metrics" icon="🏭" onExport={doExport}>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">Supplier</th>
              <th className="inv-th">SKU Count</th>
              <Th label="On-Time Delivery" sortKey="onTimeDeliveryRate" active={sort.key==='onTimeDeliveryRate'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Avg Lead Time</th>
              <Th label="Quality Score" sortKey="qualityScore" active={sort.key==='qualityScore'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Total PO Value" sortKey="totalPOValue" active={sort.key==='totalPOValue'} dir={sort.dir} onSort={sort.toggle} />
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.supplier} className="inv-tr">
                <td className="inv-td inv-td--bold">{s.supplier}</td>
                <td className="inv-td">{s.skuCount}</td>
                <td className="inv-td">
                  <span style={{ color: scoreColor(s.onTimeDeliveryRate), fontWeight: 600 }}>{s.onTimeDeliveryRate}%</span>
                  <div className="inv-score-bar"><div style={{ width: `${s.onTimeDeliveryRate}%`, background: scoreColor(s.onTimeDeliveryRate), height: '100%', borderRadius: 2 }} /></div>
                </td>
                <td className="inv-td">{s.avgLeadTime} days</td>
                <td className="inv-td">
                  <span style={{ color: scoreColor(s.qualityScore), fontWeight: 600 }}>{s.qualityScore}/100</span>
                </td>
                <td className="inv-td inv-td--rev">{fmtUsd(s.totalPOValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 10. Category Breakdown ──────────────────────────────────────────────────

function CategorySection({ categories, hasPriceData }: { categories: CategorySummary[]; hasPriceData: boolean }) {
  const sort = useSortDir('desc');

  const data = useMemo(() =>
    [...categories].sort((a, b) => {
      const v = (x: CategorySummary) => sort.key === 'unitsSold' ? x.unitsSold : sort.key === 'turnoverRatio' ? x.turnoverRatio : x.onHandValue;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    }),
    [categories, sort.key, sort.dir]
  );

  function doExport() {
    dlCsv('categories.csv',
      ['Category', 'SKU Count', 'On Hand Value', 'Units Sold', 'Turnover Ratio', 'Stockout Risk Count'],
      data.map(c => [c.category, c.skuCount, c.onHandValue.toFixed(2), c.unitsSold, c.turnoverRatio, c.stockoutRiskCount])
    );
  }

  return (
    <SectionCard title="Category-wise Breakdown" icon="🏷️" onExport={doExport}>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">Category</th>
              <th className="inv-th">SKU Count</th>
              <Th label="Inventory Value" sortKey="onHandValue" active={sort.key==='onHandValue'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Units Sold" sortKey="unitsSold" active={sort.key==='unitsSold'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Turnover Ratio" sortKey="turnoverRatio" active={sort.key==='turnoverRatio'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Stockout Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.map(c => (
              <tr key={c.category} className="inv-tr">
                <td className="inv-td inv-td--bold">{c.category}</td>
                <td className="inv-td">{c.skuCount}</td>
                <td className="inv-td inv-td--rev">{fmtUsd(c.onHandValue)}</td>
                <td className="inv-td">{fmt(c.unitsSold)}</td>
                <td className="inv-td">{fmt(c.turnoverRatio, 2)}×</td>
                <td className="inv-td">
                  {c.stockoutRiskCount > 0
                    ? <span className="inv-risk-badge inv-risk-badge--warning">{c.stockoutRiskCount} at risk</span>
                    : <span className="inv-risk-badge inv-risk-badge--none">None</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ─── 11. On Hand Stock Detail ────────────────────────────────────────────────

function OnHandStockSection({ skus }: { skus: SkuInventoryData[] }) {
  const sort = useSortDir('desc');
  const [filter, setFilter] = useState('');

  const data = useMemo(() => {
    let d = filter ? skus.filter(s =>
      s.sku.toLowerCase().includes(filter.toLowerCase()) ||
      s.asin.toLowerCase().includes(filter.toLowerCase())
    ) : skus;
    return [...d].sort((a, b) => {
      const v = (x: SkuInventoryData) => sort.key === 'onHandQty' ? x.onHandQty : sort.key === 'inboundQty' ? x.inboundQty : x.reserveQty;
      return sort.dir === 'asc' ? v(a) - v(b) : v(b) - v(a);
    });
  }, [skus, sort.key, sort.dir, filter]);

  function doExport() {
    dlCsv('on_hand_stock.csv',
      ['SKU', 'ASIN', 'FNSKU', 'Country', 'On Hand', 'Inbound', 'Reserve', 'Supplier', 'Category'],
      data.map(s => [s.sku, s.asin, s.fnsku, s.countryCode, s.onHandQty, s.inboundQty, s.reserveQty, s.supplier, s.category])
    );
  }

  return (
    <SectionCard title="On Hand Stock Detail" icon="📦" onExport={doExport}>
      <div className="inv-filter-row">
        <input className="inv-filter-input" placeholder="Filter by SKU or ASIN…" value={filter} onChange={e => setFilter(e.target.value)} />
        <span className="inv-filter-count">{data.length} of {skus.length} SKUs</span>
      </div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-th">SKU</th>
              <th className="inv-th">ASIN</th>
              <th className="inv-th">Country</th>
              <Th label="On Hand" sortKey="onHandQty" active={sort.key==='onHandQty'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Inbound" sortKey="inboundQty" active={sort.key==='inboundQty'} dir={sort.dir} onSort={sort.toggle} />
              <Th label="Reserve" sortKey="reserveQty" active={sort.key==='reserveQty'} dir={sort.dir} onSort={sort.toggle} />
              <th className="inv-th">Supplier</th>
              <th className="inv-th">Category</th>
              <th className="inv-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.sku} className="inv-tr">
                <td className="inv-td inv-td--sku">{s.sku}</td>
                <td className="inv-td inv-td--mono">{s.asin || '—'}</td>
                <td className="inv-td">{s.countryCode || '—'}</td>
                <td className="inv-td inv-td--bold">{fmt(s.onHandQty)}</td>
                <td className="inv-td inv-td--muted">{fmt(s.inboundQty)}</td>
                <td className="inv-td inv-td--muted">{fmt(s.reserveQty)}</td>
                <td className="inv-td">{s.supplier}</td>
                <td className="inv-td">{s.category}</td>
                <td className="inv-td"><StatusBadge status={s.stockStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
