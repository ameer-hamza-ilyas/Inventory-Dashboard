import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import Sidebar, { type Page } from './components/Sidebar';
import FileImport from './components/FileImport';
import DateRangeFilter from './components/DateRangeFilter';
import ForecastTable from './components/ForecastTable';
import InventoryOverview from './pages/InventoryOverview';
import './App.css';

export default function App() {
  const [page, setPage] = useState<Page>('forecast');

  return (
    <AppProvider>
      <div className="app-shell">
        <Sidebar currentPage={page} onNavigate={setPage} />
        <div className="app-content">
          <div className={`page-view page-view--${page}`} key={page}>
            {page === 'forecast' ? <ForecastPage /> : <InventoryOverview />}
          </div>
        </div>
      </div>
    </AppProvider>
  );
}

function ForecastPage() {
  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Sales Forecast</h1>
        <p className="page__subtitle">Analyze sales velocity and forecast future demand</p>
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
          <h2 className="section__title">Filter</h2>
          <DateRangeFilter />
        </section>
        <section className="section">
          <ForecastTable />
        </section>
      </div>
      <footer className="app-footer">
        <p>Inventory Dashboard — Sales Forecast Module</p>
      </footer>
    </div>
  );
}
