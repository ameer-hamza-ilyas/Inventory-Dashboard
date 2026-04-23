import { useRef, type ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import { parseLedgerCsv, parseOrdersCsv } from '../utils/csvParser';

interface FileImportProps {
  type: 'ledger' | 'orders';
}

export default function FileImport({ type }: FileImportProps) {
  const { state, dispatch } = useAppContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const isLedger = type === 'ledger';
  const isLoading = isLedger ? state.loadingLedger : state.loadingOrders;
  const hasData = isLedger ? state.ledger.length > 0 : state.orders.length > 0;
  const label = isLedger ? 'Import Inventory Ledger' : 'Import Orders Report';
  const count = isLedger ? state.ledger.length : state.orders.length;

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    dispatch({ type: isLedger ? 'SET_LOADING_LEDGER' : 'SET_LOADING_ORDERS', payload: true });

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        if (isLedger) {
          const entries = parseLedgerCsv(text);
          dispatch({ type: 'SET_LEDGER', payload: entries });
        } else {
          const entries = parseOrdersCsv(text);
          dispatch({ type: 'SET_ORDERS', payload: entries });
        }
      } catch (err) {
        dispatch({ type: isLedger ? 'SET_LOADING_LEDGER' : 'SET_LOADING_ORDERS', payload: false });
        alert(err instanceof Error ? err.message : 'Failed to parse file.');
      }
      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsText(file);
  }

  return (
    <div className="import-card">
      <div className="import-card__icon">{isLedger ? '📦' : '🛒'}</div>
      <div className="import-card__body">
        <p className="import-card__title">{label}</p>
        {hasData ? (
          <p className="import-card__status import-card__status--ok">
            ✓ {count.toLocaleString()} rows loaded
          </p>
        ) : (
          <p className="import-card__status">No file imported</p>
        )}
      </div>
      <label className={`btn btn--primary${isLoading ? ' btn--loading' : ''}`}>
        {isLoading ? (
          <>
            <span className="spinner" /> Parsing…
          </>
        ) : (
          hasData ? 'Re-import' : 'Choose CSV'
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv"
          style={{ display: 'none' }}
          onChange={handleFile}
          disabled={isLoading}
        />
      </label>
    </div>
  );
}
