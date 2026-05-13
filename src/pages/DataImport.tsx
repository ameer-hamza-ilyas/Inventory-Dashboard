import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import { parseLedgerCsv, parseOrdersCsv, parseMasterDataCsv } from '../utils/csvParser';
import type { LedgerEntry, OrderEntry, CostPricingEntry, SupplierImportEntry, ParentProductEntry } from '../types';

type AmazonImportType = 'ledger' | 'orders';

interface AmazonImportConfig {
  type: AmazonImportType;
  title: string;
  icon: string;
  description: string;
  instructions: string[];
  exampleHeaders: string;
  exampleRow: string;
}

const AMAZON_CONFIGS: AmazonImportConfig[] = [
  {
    type: 'ledger',
    title: 'Import Inventory Ledger Report',
    icon: '📦',
    description: 'Upload Amazon Inventory Ledger CSV to extract daily on-hand stock counts per SKU.',
    instructions: [
      'Export from Amazon Seller Central → Reports → Fulfillment → Inventory Ledger',
      'Required columns: Date, SKU (MSKU or FNSKU), Ending Warehouse Balance',
      'Optional columns: ASIN, Country Code',
      'Supports both Summary and Detailed report formats',
    ],
    exampleHeaders: 'Date, MSKU, FNSKU, ASIN, Ending Warehouse Balance, Country Code',
    exampleRow: '2024-01-15, ABC-SKU-001, X001234567, B00EXAMPLE, 150, US',
  },
  {
    type: 'orders',
    title: 'Import Orders Report',
    icon: '🛒',
    description: 'Upload Amazon Orders/Sales CSV to extract daily units sold per SKU.',
    instructions: [
      'Export from Amazon Seller Central → Reports → Fulfillment → All Orders',
      'Required columns: Purchase Date, SKU, Quantity',
      'Optional columns: Item Price (for revenue tracking), ASIN',
      'Supports both order-level and aggregated sales reports',
    ],
    exampleHeaders: 'purchase-date, sku, quantity, item-price, asin',
    exampleRow: '2024-01-15T10:30:00Z, ABC-SKU-001, 3, 89.97, B00EXAMPLE',
  },
];

// ─── Master Data template ─────────────────────────────────────────────────────

const MASTER_TEMPLATE_HEADERS = [
  'Supplier ID',
  'Supplier Name',
  'Lead Time Days',
  'On Time Delivery Rate (%)',
  'Quality Score',
  'Parent Product ID',
  'Parent Product Name',
  'Child SKU',
  'Child ASIN',
  'Child FNSKU',
  'Country Code',
  'Unit Cost (COGS)',
  'Selling Price',
  'Associated Fees',
].join(',');

const MASTER_TEMPLATE_SAMPLE =
  'SUP-001,Acme Corp,14,95.0,88.0,PARENT-001,Blue Widget Bundle,WIDGET-BLUE-SM,B00EXAMPLE1,X001111111,US,12.50,29.99,2.50';

function downloadMasterTemplate() {
  const csv = `${MASTER_TEMPLATE_HEADERS}\n${MASTER_TEMPLATE_SAMPLE}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'master-data-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataImport() {
  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Data Import</h1>
        <p className="page__subtitle">Central hub for all CSV report imports — manage your data sources in one place</p>
      </div>
      <div className="page__body">
        {AMAZON_CONFIGS.map(cfg => (
          <AmazonImportSection key={cfg.type} config={cfg} />
        ))}
        <MasterDataSection />
      </div>
      <footer className="app-footer">
        <p>Inventory Dashboard — Data Import Module</p>
      </footer>
    </div>
  );
}

// ─── Generic Amazon report section (Ledger / Orders) ─────────────────────────

function AmazonImportSection({ config }: { config: AmazonImportConfig }) {
  const { state, dispatch } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isLoading = config.type === 'ledger' ? state.loadingLedger : state.loadingOrders;
  const hasData   = config.type === 'ledger' ? state.ledger.length > 0 : state.orders.length > 0;
  const rowCount  = config.type === 'ledger' ? state.ledger.length : state.orders.length;

  function setLoading(v: boolean) {
    dispatch({ type: config.type === 'ledger' ? 'SET_LOADING_LEDGER' : 'SET_LOADING_ORDERS', payload: v });
  }

  function clear() {
    dispatch({ type: config.type === 'ledger' ? 'CLEAR_LEDGER' : 'CLEAR_ORDERS' });
    setError(null);
    setShowPreview(false);
  }

  const processFile = useCallback((file: File) => {
    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        if (config.type === 'ledger') {
          dispatch({ type: 'SET_LEDGER', payload: parseLedgerCsv(text) });
        } else {
          dispatch({ type: 'SET_ORDERS', payload: parseOrdersCsv(text) });
        }
        setShowPreview(true);
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
      }
      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsText(file);
  }, [config.type, dispatch]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  return (
    <section className="section di-section">
      <div className="di-section__header">
        <span className="di-section__icon">{config.icon}</span>
        <div className="di-section__meta">
          <h2 className="di-section__title">{config.title}</h2>
          <p className="di-section__desc">{config.description}</p>
        </div>
        {hasData && (
          <div className="di-section__status">
            <span className="di-status di-status--ok">✓ {rowCount.toLocaleString()} rows loaded</span>
          </div>
        )}
      </div>

      <div
        className={`di-dropzone${dragging ? ' di-dropzone--active' : ''}${hasData ? ' di-dropzone--has-data' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="di-dropzone__loading">
            <span className="spinner spinner--dark" />
            <span>Parsing file…</span>
          </div>
        ) : (
          <>
            <div className="di-dropzone__upload-icon"><UploadCloudIcon /></div>
            <p className="di-dropzone__text">
              {dragging ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
            </p>
            <p className="di-dropzone__sub">or</p>
            <label className="btn btn--primary">
              {hasData ? 'Re-import CSV' : 'Choose CSV File'}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                style={{ display: 'none' }}
                onChange={handleFile}
                disabled={isLoading}
              />
            </label>
            <p className="di-dropzone__hint">Accepts .csv, .tsv, .txt files</p>
          </>
        )}
      </div>

      {error && (
        <div className="di-error">
          <span className="di-error__icon">⚠️</span>
          <pre className="di-error__text">{error}</pre>
        </div>
      )}

      <div className="di-actions">
        <button
          className="btn btn--outline"
          style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => setShowInstructions(v => !v)}
        >
          {showInstructions ? 'Hide Format Guide' : 'Show Format Guide'}
        </button>
        {hasData && (
          <>
            <button
              className="btn btn--outline"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setShowPreview(v => !v)}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button
              className="btn btn--danger"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={clear}
            >
              Clear Data
            </button>
          </>
        )}
      </div>

      {showInstructions && (
        <div className="di-instructions">
          <h4 className="di-instructions__title">Expected CSV Format</h4>
          <ul className="di-instructions__list">
            {config.instructions.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <div className="di-instructions__example">
            <div className="di-instructions__example-label">Example:</div>
            <code className="di-instructions__code">
              {config.exampleHeaders}<br />
              {config.exampleRow}
            </code>
          </div>
        </div>
      )}

      {hasData && showPreview && <AmazonDataPreview type={config.type} />}
    </section>
  );
}

// ─── Unified Master Data section ──────────────────────────────────────────────

type MasterTab = 'pricing' | 'supplier' | 'hierarchy';

function MasterDataSection() {
  const { state, dispatch } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<MasterTab>('pricing');

  const isLoading = state.loadingMasterData;
  const hasData = state.costPricing.length > 0 || state.supplierData.length > 0 || state.parentProducts.length > 0;

  function clear() {
    dispatch({ type: 'CLEAR_MASTER_DATA' });
    setError(null);
    setShowPreview(false);
  }

  const processFile = useCallback((file: File) => {
    setError(null);
    dispatch({ type: 'SET_LOADING_MASTER_DATA', payload: true });
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseMasterDataCsv(reader.result as string);
        dispatch({ type: 'SET_MASTER_DATA', payload: result });
        setShowPreview(true);
        if (result.costPricing.length > 0) setActiveTab('pricing');
        else if (result.supplierData.length > 0) setActiveTab('supplier');
        else setActiveTab('hierarchy');
      } catch (err) {
        dispatch({ type: 'SET_LOADING_MASTER_DATA', payload: false });
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
      }
      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsText(file);
  }, [dispatch]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  return (
    <section className="section di-section">
      <div className="di-section__header">
        <span className="di-section__icon">🗄️</span>
        <div className="di-section__meta">
          <h2 className="di-section__title">Master Data Report</h2>
          <p className="di-section__desc">
            Single CSV combining supplier info, product hierarchy, and cost &amp; pricing — download the template, fill it in, then import.
          </p>
        </div>
        {hasData && (
          <div className="di-section__status" style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            {state.costPricing.length > 0 && (
              <span className="di-status di-status--ok">✓ {state.costPricing.length.toLocaleString()} pricing records</span>
            )}
            {state.supplierData.length > 0 && (
              <span className="di-status di-status--ok">✓ {state.supplierData.length.toLocaleString()} supplier records</span>
            )}
            {state.parentProducts.length > 0 && (
              <span className="di-status di-status--ok">✓ {state.parentProducts.length.toLocaleString()} product mappings</span>
            )}
          </div>
        )}
      </div>

      {/* Template download */}
      <div className="di-template-bar">
        <div className="di-template-bar__info">
          <span className="di-template-bar__icon">📋</span>
          <div>
            <div className="di-template-bar__title">Step 1 — Download the Master Data Template</div>
            <div className="di-template-bar__sub">
              Pre-filled headers with one sample row. Populate with your data and import below.
            </div>
          </div>
        </div>
        <button className="btn btn--outline" onClick={downloadMasterTemplate} style={{ whiteSpace: 'nowrap' }}>
          ⬇ Download Template CSV
        </button>
      </div>

      {/* Drop zone */}
      <div className="di-template-bar__step-label">Step 2 — Import your completed file</div>
      <div
        className={`di-dropzone${dragging ? ' di-dropzone--active' : ''}${hasData ? ' di-dropzone--has-data' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="di-dropzone__loading">
            <span className="spinner spinner--dark" />
            <span>Parsing file…</span>
          </div>
        ) : (
          <>
            <div className="di-dropzone__upload-icon"><UploadCloudIcon /></div>
            <p className="di-dropzone__text">
              {dragging ? 'Drop your Master Data CSV here' : 'Drag & drop your Master Data CSV here'}
            </p>
            <p className="di-dropzone__sub">or</p>
            <label className="btn btn--primary">
              {hasData ? 'Re-import CSV' : 'Choose CSV File'}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                style={{ display: 'none' }}
                onChange={handleFile}
                disabled={isLoading}
              />
            </label>
            <p className="di-dropzone__hint">Accepts .csv, .tsv, .txt files</p>
          </>
        )}
      </div>

      {error && (
        <div className="di-error">
          <span className="di-error__icon">⚠️</span>
          <pre className="di-error__text">{error}</pre>
        </div>
      )}

      <div className="di-actions">
        <button
          className="btn btn--outline"
          style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => setShowInstructions(v => !v)}
        >
          {showInstructions ? 'Hide Column Guide' : 'Show Column Guide'}
        </button>
        {hasData && (
          <>
            <button
              className="btn btn--outline"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setShowPreview(v => !v)}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button
              className="btn btn--danger"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={clear}
            >
              Clear All Master Data
            </button>
          </>
        )}
      </div>

      {showInstructions && (
        <div className="di-instructions">
          <h4 className="di-instructions__title">Master Data Template — Column Reference</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 24px', marginBottom: 12 }}>
            <div>
              <div className="di-instructions__group-label">Supplier Information</div>
              <ul className="di-instructions__list">
                <li><strong>Supplier ID</strong> — unique identifier for the supplier</li>
                <li><strong>Supplier Name</strong> — supplier display name</li>
                <li><strong>Lead Time Days</strong> — days from order to delivery</li>
                <li><strong>On Time Delivery Rate (%)</strong> — e.g. 95.0</li>
                <li><strong>Quality Score</strong> — 0–100</li>
              </ul>
            </div>
            <div>
              <div className="di-instructions__group-label">Product Hierarchy</div>
              <ul className="di-instructions__list">
                <li><strong>Parent Product ID</strong> — groups variants together</li>
                <li><strong>Parent Product Name</strong> — display name for the group</li>
                <li><strong>Child SKU</strong> — individual Amazon SKU (required)</li>
                <li><strong>Child ASIN</strong> — Amazon ASIN for this SKU</li>
                <li><strong>Child FNSKU</strong> — fulfillment network SKU</li>
                <li><strong>Country Code</strong> — marketplace code, e.g. US</li>
              </ul>
            </div>
            <div>
              <div className="di-instructions__group-label">Cost &amp; Pricing</div>
              <ul className="di-instructions__list">
                <li><strong>Unit Cost (COGS)</strong> — your procurement cost per unit</li>
                <li><strong>Selling Price</strong> — retail price before fees</li>
                <li><strong>Associated Fees</strong> — storage, handling, etc.</li>
              </ul>
            </div>
          </div>
          <div className="di-instructions__example">
            <div className="di-instructions__example-label">Template headers (row 1):</div>
            <code className="di-instructions__code" style={{ fontSize: 11 }}>
              {MASTER_TEMPLATE_HEADERS}<br />
              {MASTER_TEMPLATE_SAMPLE}
            </code>
          </div>
        </div>
      )}

      {hasData && showPreview && (
        <div className="di-preview">
          <div className="di-master-tabs">
            {(['pricing', 'supplier', 'hierarchy'] as MasterTab[]).map(tab => {
              const count = tab === 'pricing' ? state.costPricing.length
                : tab === 'supplier' ? state.supplierData.length
                : state.parentProducts.length;
              const label = tab === 'pricing' ? 'Cost & Pricing'
                : tab === 'supplier' ? 'Supplier'
                : 'Product Hierarchy';
              return (
                <button
                  key={tab}
                  className={`di-master-tab${activeTab === tab ? ' di-master-tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {label}
                  {count > 0 && <span className="di-master-tab__badge">{count.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>

          {activeTab === 'pricing' && <MasterPricingPreview rows={state.costPricing} />}
          {activeTab === 'supplier' && <MasterSupplierPreview rows={state.supplierData} />}
          {activeTab === 'hierarchy' && <MasterHierarchyPreview rows={state.parentProducts} />}
        </div>
      )}
    </section>
  );
}

// ─── Master data preview sub-components ──────────────────────────────────────

function MasterPricingPreview({ rows }: { rows: CostPricingEntry[] }) {
  const preview = rows.slice(0, 5);
  if (rows.length === 0) return <p className="di-preview__empty">No pricing data in this file.</p>;
  return (
    <>
      <div className="di-preview__label">Preview — first {preview.length} of {rows.length.toLocaleString()} rows</div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              {['SKU', 'Unit Cost (COGS)', 'Selling Price', 'Associated Fees', 'Net Profit / Unit'].map(h => (
                <th key={h} className="inv-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r: CostPricingEntry, i) => {
              const net = r.sellingPrice - r.unitCost - r.associatedFees;
              return (
                <tr key={i} className="inv-tr">
                  <td className="inv-td inv-td--sku">{r.sku}</td>
                  <td className="inv-td">${r.unitCost.toFixed(2)}</td>
                  <td className="inv-td">${r.sellingPrice.toFixed(2)}</td>
                  <td className="inv-td">{r.associatedFees > 0 ? `$${r.associatedFees.toFixed(2)}` : '—'}</td>
                  <td className="inv-td" style={{ color: net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {net >= 0 ? '+' : ''}${net.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MasterSupplierPreview({ rows }: { rows: SupplierImportEntry[] }) {
  const preview = rows.slice(0, 5);
  if (rows.length === 0) return <p className="di-preview__empty">No supplier data in this file.</p>;
  return (
    <>
      <div className="di-preview__label">Preview — first {preview.length} of {rows.length.toLocaleString()} rows</div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              {['Supplier ID', 'Supplier Name', 'SKU', 'Lead Time (days)', 'On-Time %', 'Quality Score'].map(h => (
                <th key={h} className="inv-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r: SupplierImportEntry, i) => (
              <tr key={i} className="inv-tr">
                <td className="inv-td inv-td--mono">{r.supplierId || '—'}</td>
                <td className="inv-td inv-td--bold">{r.supplierName}</td>
                <td className="inv-td inv-td--sku">{r.sku}</td>
                <td className="inv-td">{r.leadTimeDays || '—'}</td>
                <td className="inv-td">{r.onTimeDeliveryRate ? `${r.onTimeDeliveryRate}%` : '—'}</td>
                <td className="inv-td">{r.qualityScore || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MasterHierarchyPreview({ rows }: { rows: ParentProductEntry[] }) {
  const preview = rows.slice(0, 5);
  if (rows.length === 0) return <p className="di-preview__empty">No product hierarchy data in this file.</p>;
  return (
    <>
      <div className="di-preview__label">Preview — first {preview.length} of {rows.length.toLocaleString()} rows</div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              {['Parent ID', 'Parent Name', 'Child SKU', 'Child ASIN', 'Child FNSKU'].map(h => (
                <th key={h} className="inv-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r: ParentProductEntry, i) => (
              <tr key={i} className="inv-tr">
                <td className="inv-td inv-td--mono">{r.parentId}</td>
                <td className="inv-td inv-td--bold">{r.parentName || '—'}</td>
                <td className="inv-td inv-td--sku">{r.childSku}</td>
                <td className="inv-td inv-td--mono">{r.childAsin || '—'}</td>
                <td className="inv-td inv-td--mono">{r.childFnsku || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Amazon report preview (Ledger / Orders) ──────────────────────────────────

function AmazonDataPreview({ type }: { type: AmazonImportType }) {
  const { state } = useAppContext();

  if (type === 'ledger') {
    const rows = state.ledger.slice(0, 5);
    return (
      <div className="di-preview">
        <div className="di-preview__label">Preview — first {rows.length} of {state.ledger.length.toLocaleString()} rows</div>
        <div className="table-wrapper">
          <table className="inv-table">
            <thead>
              <tr>
                {['Date', 'SKU', 'ASIN', 'FNSKU', 'On Hand Qty', 'Country'].map(h => (
                  <th key={h} className="inv-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: LedgerEntry, i) => (
                <tr key={i} className="inv-tr">
                  <td className="inv-td">{r.date}</td>
                  <td className="inv-td inv-td--sku">{r.sku}</td>
                  <td className="inv-td inv-td--mono">{r.asin || '—'}</td>
                  <td className="inv-td inv-td--mono">{r.fnsku || '—'}</td>
                  <td className="inv-td inv-td--bold">{r.onHandQty.toLocaleString()}</td>
                  <td className="inv-td">{r.countryCode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const rows = state.orders.slice(0, 5);
  return (
    <div className="di-preview">
      <div className="di-preview__label">Preview — first {rows.length} of {state.orders.length.toLocaleString()} rows</div>
      <div className="table-wrapper">
        <table className="inv-table">
          <thead>
            <tr>
              {['Date', 'SKU', 'ASIN', 'Units Sold', 'Revenue', 'Country'].map(h => (
                <th key={h} className="inv-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: OrderEntry, i) => (
              <tr key={i} className="inv-tr">
                <td className="inv-td">{r.date}</td>
                <td className="inv-td inv-td--sku">{r.sku}</td>
                <td className="inv-td inv-td--mono">{r.asin || '—'}</td>
                <td className="inv-td inv-td--bold">{r.unitsSold.toLocaleString()}</td>
                <td className="inv-td">{r.priceFound ? `$${r.revenue.toFixed(2)}` : '—'}</td>
                <td className="inv-td">{r.countryCode || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadCloudIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
