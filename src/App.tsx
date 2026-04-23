import { AppProvider } from './context/AppContext';
import FileImport from './components/FileImport';
import DateRangeFilter from './components/DateRangeFilter';
import ForecastTable from './components/ForecastTable';
import './App.css';

export default function App() {
  return (
    <AppProvider>
      <div className="app">
        <header className="app-header">
          <div className="app-header__inner">
            <div className="app-header__logo">
              <span className="app-header__logo-icon">📦</span>
              <span className="app-header__logo-text">Inventory Dashboard</span>
            </div>
            <p className="app-header__sub">Sales Forecast &amp; Inventory Planning</p>
          </div>
        </header>

        <main className="app-main">
          {/* Import Section */}
          <section className="section">
            <h2 className="section__title">Data Import</h2>
            <div className="import-grid">
              <FileImport type="ledger" />
              <FileImport type="orders" />
            </div>
          </section>

          {/* Filter Section */}
          <section className="section">
            <h2 className="section__title">Filter</h2>
            <DateRangeFilter />
          </section>

          {/* Forecast Section */}
          <section className="section">
            <ForecastTable />
          </section>
        </main>

        <footer className="app-footer">
          <p>Inventory Dashboard — Sales Forecast Module</p>
        </footer>
      </div>
    </AppProvider>
  );
}
