import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface AppState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  hasSearched: boolean;
  setHasSearched: (v: boolean) => void;
}

const AppContext = createContext<AppState | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [apiKey, setApiKeyState] = useState(
    () => sessionStorage.getItem('anthropic_key') || ''
  );
  const [hasSearched, setHasSearched] = useState(false);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    sessionStorage.setItem('anthropic_key', key);
  }, []);

  return (
    <AppContext.Provider
      value={{
        searchQuery,
        setSearchQuery,
        apiKey,
        setApiKey,
        hasSearched,
        setHasSearched,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppState {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
