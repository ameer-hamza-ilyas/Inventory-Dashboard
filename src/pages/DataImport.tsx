import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import { parseLedgerCsv, parseOrdersCsv, parseCostPricingCsv, parseSupplierCsv, parseParentProductCsv } from '../utils/csvParser';
import type { LedgerEntry, OrderEntry, CostPricingEntry, SupplierImportEntry, ParentProductEntry } from '../types';

type ImportType = 'ledger' | 'orders' | 'costPricing' | 'supplier' | 'parentProduct';

interface ImportConfig {
  type: ImportType;
  title: string;
  icon: string;
  description: string;
  instructions: string[];
  exampleHeaders: string;
  exampleRow: string;
}

const CONFIGS: ImportConfig[] = [
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
  {
    type: 'costPricing',
    title: 'Import Cost & Pricing Report',
    icon: '💰',
    description: 'Upload a CSV with per-SKU unit cost and selling price to enable profit analysis.',
    instructions: [
      'Required columns: SKU, Unit Cost, Selling Price',
      'Unit Cost = your cost to procure or manufacture each unit',
      'Selling Price = the price you sell at (before fees)',
      'This data unlocks ABC Analysis by Profit in Inventory Overview',
    ],
    exampleHeaders: 'SKU, Unit Cost, Selling Price',
    exampleRow: 'ABC-SKU-001, 12.50, 29.99',
  },
  {
    type: 'supplier',
    title: 'Import Supplier Data',
    icon: '🏭',
    description: 'Upload a CSV with supplier information to track performance and lead times.',
    instructions: [
      'Required columns: Supplier Name, SKU',
      'Optional columns: Lead Time Days, On-Time Delivery Rate (%), Quality Score (0–100)',
      'One row per SKU–supplier relationship',
      'Replaces estimated supplier data in Inventory Overview',
    ],
    exampleHeaders: 'Supplier Name, SKU, Lead Time Days, On-Time Delivery Rate, Quality Score',
    exampleRow: 'Acme Corp, ABC-SKU-001, 14, 95, 88',
  },
  {
    type: 'parentProduct',
    title: 'Import Parent Product Report',
    icon: '🗂️',
    description: 'Upload a CSV mapping child SKUs to their parent products. Required to enable ABC Analysis by Parent Product in Inventory Overview.',
    instructions: [
      'Required columns: Parent Product ID, Child SKU',
      'Optional columns: Parent Product Name, Child ASIN, Child FNSKU',
      'Each row maps one child SKU to its parent product',
      'A parent product can have multiple child SKUs (e.g., colour/size variants)',
      'This unlocks the ABC Analysis section in Inventory Overview',
    ],
    exampleHeaders: 'Parent Product ID, Parent Product Name, Child SKU, Child ASIN, Child FNSKU',
    exampleRow: 'PARENT-001, Blue Widget Bundle, WIDGET-BLUE-SM, B00EXAMPLE1, X001111111',
  },
];

export default function DataImport() {
  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Data Import</h1>
        <p className="page__subtitle">Central hub for all CSV report imports — manage your data sources in one place</p>
      </div>
      <div className="page__body">
        {CONFIGS.map(cfg => (
          <ImportSection key={cfg.type} config={cfg} />
        ))}
      </div>
      <footer className="app-footer">
        <p>Inventory Dashboard — Data Import Module</p>
      </footer>
    </div>
  );
}

function ImportSection({ config }: { config: ImportConfig }) {
  const { state, dispatch } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isLoading = config.type === 'ledger' ? state.loadingLedger
    : config.type === 'orders' ? state.loadingOrders
    : config.type === 'costPricing' ? state.loadingCostPricing
    : config.type === 'parentProduct' ? state.loadingParentProducts
    : state.loadingSupplier;

  const hasData = config.type === 'ledger' ? state.ledger.length > 0
    : config.type === 'orders' ? state.orders.length > 0
    : config.type === 'costPricing' ? state.costPricing.length > 0
    : config.type === 'parentProduct' ? state.parentProducts.length > 0
    : state.supplierData.length > 0;

  const rowCount = config.type === 'ledger' ? state.ledger.length
    : config.type === 'orders' ? state.orders.length
    : config.type === 'costPricing' ? state.costPricing.length
    : config.type === 'parentProduct' ? state.parentProducts.length
    : state.supplierData.length;

  function setLoading(v: boolean) {
    if (config.type === 'ledger')             dispatch({ type: 'SET_LOADING_LEDGER', payload: v });
    else if (config.type === 'orders')        dispatch({ type: 'SET_LOADING_ORDERS', payload: v });
    else if (config.type === 'costPricing')   dispatch({ type: 'SET_LOADING_COST_PRICING', payload: v });
    else if (config.type === 'parentProduct') dispatch({ type: 'SET_LOADING_PARENT_PRODUCTS', payload: v });
    else                                      dispatch({ type: 'SET_LOADING_SUPPLIER', payload: v });
  }

  function clear() {
    if (config.type === 'ledger')             dispatch({ type: 'CLEAR_LEDGER' });
    else if (config.type === 'orders')        dispatch({ type: 'CLEAR_ORDERS' });
    else if (config.type === 'costPricing')   dispatch({ type: 'CLEAR_COST_PRICING' });
    else if (config.type === 'parentProduct') dispatch({ type: 'CLEAR_PARENT_PRODUCTS' });
    else                                      dispatch({ type: 'CLEAR_SUPPLIER_DATA' });
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
        } else if (config.type === 'orders') {
          dispatch({ type: 'SET_ORDERS', payload: parseOrdersCsv(text) });
        } else if (config.type === 'costPricing') {
          dispatch({ type: 'SET_COST_PRICING', payload: parseCostPricingCsv(text) });
        } else if (config.type === 'parentProduct') {
          dispatch({ type: 'SET_PARENT_PRODUCTS', payload: parseParentProductCsv(text) });
        } else {
          dispatch({ type: 'SET_SUPPLIER_DATA', payload: parseSupplierCsv(text) });
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

      {/* Drop Zone */}
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
            <div className="di-dropzone__upload-icon">
              <UploadCloudIcon />
            </div>
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

      {/* Error */}
      {error && (
        <div className="di-error">
          <span className="di-error__icon">⚠️</span>
          <pre className="di-error__text">{error}</pre>
        </div>
      )}

      {/* Actions row */}
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

      {/* Format instructions */}
      {showInstructions && (
        <div className="di-instructions">
          <h4 className="di-instructions__title">Expected CSV Format</h4>
          <ul className="di-instructions__list">
            {config.instructions.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
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

      {/* Data preview */}
      {hasData && showPreview && (
        <DataPreview type={config.type} />
      )}
    </section>
  );
}

function DataPreview({ type }: { type: ImportType }) {
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

  if (type === 'orders') {
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

  if (type === 'costPricing') {
    const rows = state.costPricing.slice(0, 5);
    return (
      <div className="di-preview">
        <div className="di-preview__label">Preview — first {rows.length} of {state.costPricing.length.toLocaleString()} rows</div>
        <div className="table-wrapper">
          <table className="inv-table">
            <thead>
              <tr>
                {['SKU', 'Unit Cost', 'Selling Price', 'Profit / Unit'].map(h => (
                  <th key={h} className="inv-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: CostPricingEntry, i) => {
                const profit = r.sellingPrice - r.unitCost;
                return (
                  <tr key={i} className="inv-tr">
                    <td className="inv-td inv-td--sku">{r.sku}</td>
                    <td className="inv-td">${r.unitCost.toFixed(2)}</td>
                    <td className="inv-td">${r.sellingPrice.toFixed(2)}</td>
                    <td className="inv-td" style={{ color: profit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                      {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (type === 'supplier') {
    const rows = state.supplierData.slice(0, 5);
    return (
      <div className="di-preview">
        <div className="di-preview__label">Preview — first {rows.length} of {state.supplierData.length.toLocaleString()} rows</div>
        <div className="table-wrapper">
          <table className="inv-table">
            <thead>
              <tr>
                {['Supplier Name', 'SKU', 'Lead Time (days)', 'On-Time Delivery %', 'Quality Score'].map(h => (
                  <th key={h} className="inv-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: SupplierImportEntry, i) => (
                <tr key={i} className="inv-tr">
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
      </div>
    );
  }

  // parentProduct
  const rows = state.parentProducts.slice(0, 5);
  return (
    <div className="di-preview">
      <div className="di-preview__label">Preview — first {rows.length} of {state.parentProducts.length.toLocaleString()} rows</div>
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
            {rows.map((r: ParentProductEntry, i) => (
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
