import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { LedgerEntry, OrderEntry, DateRange } from '../types';

interface AppState {
  ledger: LedgerEntry[];
  orders: OrderEntry[];
  dateRange: DateRange;
  loadingLedger: boolean;
  loadingOrders: boolean;
}

type Action =
  | { type: 'SET_LEDGER'; payload: LedgerEntry[] }
  | { type: 'SET_ORDERS'; payload: OrderEntry[] }
  | { type: 'SET_DATE_RANGE'; payload: DateRange }
  | { type: 'SET_LOADING_LEDGER'; payload: boolean }
  | { type: 'SET_LOADING_ORDERS'; payload: boolean };

const initialState: AppState = {
  ledger: [],
  orders: [],
  dateRange: { option: '30', customStart: '', customEnd: '' },
  loadingLedger: false,
  loadingOrders: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LEDGER':
      return { ...state, ledger: action.payload, loadingLedger: false };
    case 'SET_ORDERS':
      return { ...state, orders: action.payload, loadingOrders: false };
    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload };
    case 'SET_LOADING_LEDGER':
      return { ...state, loadingLedger: action.payload };
    case 'SET_LOADING_ORDERS':
      return { ...state, loadingOrders: action.payload };
    default:
      return state;
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
