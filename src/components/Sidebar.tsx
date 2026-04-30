import { useState } from 'react';

export type Page = 'forecast' | 'inventory';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function go(page: Page) {
    onNavigate(page);
    setMobileOpen(false);
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <button className="sidebar-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <HamIcon />
      </button>

      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <span className="sidebar__logo-icon"><PkgIcon /></span>
            {!collapsed && (
              <div className="sidebar__logo-text">
                <div className="sidebar__logo-name">Inventory</div>
                <div className="sidebar__logo-sub">Dashboard</div>
              </div>
            )}
          </div>
          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevIcon dir={collapsed ? 'right' : 'left'} />
          </button>
        </div>

        <nav className="sidebar__nav">
          {!collapsed && <div className="sidebar__nav-group-label">NAVIGATION</div>}

          <button
            className={`sidebar__item${currentPage === 'forecast' ? ' sidebar__item--active' : ''}`}
            onClick={() => go('forecast')}
            title={collapsed ? 'Sales Forecast' : undefined}
          >
            <span className="sidebar__item-icon"><ChartLineIcon /></span>
            {!collapsed && <span className="sidebar__item-label">Sales Forecast</span>}
          </button>

          <button
            className={`sidebar__item${currentPage === 'inventory' ? ' sidebar__item--active' : ''}`}
            onClick={() => go('inventory')}
            title={collapsed ? 'Inventory Overview' : undefined}
          >
            <span className="sidebar__item-icon"><WarehouseIcon /></span>
            {!collapsed && <span className="sidebar__item-label">Inventory Overview</span>}
          </button>
        </nav>

        {!collapsed && (
          <div className="sidebar__footer">
            <span className="sidebar__footer-text">© 2025 Inventory Dashboard</span>
          </div>
        )}
      </aside>
    </>
  );
}

function HamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function PkgIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ChartLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function WarehouseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChevIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left'
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}
