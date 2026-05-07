import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { LedgerEntry, OrderEntry, DateRange, CostPricingEntry, SupplierImportEntry, ParentProductEntry } from '../types';

interface AppState {
  ledger: LedgerEntry[];
  orders: OrderEntry[];
  costPricing: CostPricingEntry[];
  supplierData: SupplierImportEntry[];
  parentProducts: ParentProductEntry[];
  dateRange: DateRange;
  loadingLedger: boolean;
  loadingOrders: boolean;
  loadingCostPricing: boolean;
  loadingSupplier: boolean;
  loadingParentProducts: boolean;
}

type Action =
  | { type: 'SET_LEDGER'; payload: LedgerEntry[] }
  | { type: 'SET_ORDERS'; payload: OrderEntry[] }
  | { type: 'SET_COST_PRICING'; payload: CostPricingEntry[] }
  | { type: 'SET_SUPPLIER_DATA'; payload: SupplierImportEntry[] }
  | { type: 'SET_PARENT_PRODUCTS'; payload: ParentProductEntry[] }
  | { type: 'SET_DATE_RANGE'; payload: DateRange }
  | { type: 'SET_LOADING_LEDGER'; payload: boolean }
  | { type: 'SET_LOADING_ORDERS'; payload: boolean }
  | { type: 'SET_LOADING_COST_PRICING'; payload: boolean }
  | { type: 'SET_LOADING_SUPPLIER'; payload: boolean }
  | { type: 'SET_LOADING_PARENT_PRODUCTS'; payload: boolean }
  | { type: 'CLEAR_LEDGER' }
  | { type: 'CLEAR_ORDERS' }
  | { type: 'CLEAR_COST_PRICING' }
  | { type: 'CLEAR_SUPPLIER_DATA' }
  | { type: 'CLEAR_PARENT_PRODUCTS' };

const initialState: AppState = {
  ledger: [],
  orders: [],
  costPricing: [],
  supplierData: [],
  parentProducts: [],
  dateRange: { option: '30', customStart: '', customEnd: '' },
  loadingLedger: false,
  loadingOrders: false,
  loadingCostPricing: false,
  loadingSupplier: false,
  loadingParentProducts: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LEDGER':           return { ...state, ledger: action.payload, loadingLedger: false };
    case 'SET_ORDERS':           return { ...state, orders: action.payload, loadingOrders: false };
    case 'SET_COST_PRICING':     return { ...state, costPricing: action.payload, loadingCostPricing: false };
    case 'SET_SUPPLIER_DATA':    return { ...state, supplierData: action.payload, loadingSupplier: false };
    case 'SET_PARENT_PRODUCTS':  return { ...state, parentProducts: action.payload, loadingParentProducts: false };
    case 'SET_DATE_RANGE':       return { ...state, dateRange: action.payload };
    case 'SET_LOADING_LEDGER':          return { ...state, loadingLedger: action.payload };
    case 'SET_LOADING_ORDERS':          return { ...state, loadingOrders: action.payload };
    case 'SET_LOADING_COST_PRICING':    return { ...state, loadingCostPricing: action.payload };
    case 'SET_LOADING_SUPPLIER':        return { ...state, loadingSupplier: action.payload };
    case 'SET_LOADING_PARENT_PRODUCTS': return { ...state, loadingParentProducts: action.payload };
    case 'CLEAR_LEDGER':          return { ...state, ledger: [] };
    case 'CLEAR_ORDERS':          return { ...state, orders: [] };
    case 'CLEAR_COST_PRICING':    return { ...state, costPricing: [] };
    case 'CLEAR_SUPPLIER_DATA':   return { ...state, supplierData: [] };
    case 'CLEAR_PARENT_PRODUCTS': return { ...state, parentProducts: [] };
    default: return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
