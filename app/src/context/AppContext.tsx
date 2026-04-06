import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { ActiveResults, LiveSearchTracker, LiveSearchTrackerSeed } from '../data/types';

interface AppState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  hasSearched: boolean;
  setHasSearched: (v: boolean) => void;
  liveTracker: LiveSearchTracker | null;
  setLiveTracker: Dispatch<SetStateAction<LiveSearchTracker | null>>;
  activeResults: ActiveResults | null;
  setActiveResults: Dispatch<SetStateAction<ActiveResults | null>>;
  createLiveTracker: (seed: LiveSearchTrackerSeed) => void;
  clearLiveTracker: () => void;
  clearActiveResults: () => void;
}

const AppContext = createContext<AppState | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [apiKey, setApiKeyState] = useState(() => {
    const stored = sessionStorage.getItem('anthropic_key');
    if (stored) return stored;
    const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (envKey) {
      sessionStorage.setItem('anthropic_key', envKey);
      return envKey;
    }
    return '';
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [liveTracker, setLiveTracker] = useState<LiveSearchTracker | null>(null);
  const [activeResults, setActiveResults] = useState<ActiveResults | null>(null);

  useEffect(() => {
    function syncApiKeyFromSession() {
      const stored = sessionStorage.getItem('anthropic_key') || import.meta.env.VITE_ANTHROPIC_API_KEY || '';
      if (stored !== apiKey) {
        setApiKeyState(stored);
      }
    }

    syncApiKeyFromSession();
    window.addEventListener('focus', syncApiKeyFromSession);
    document.addEventListener('visibilitychange', syncApiKeyFromSession);

    return () => {
      window.removeEventListener('focus', syncApiKeyFromSession);
      document.removeEventListener('visibilitychange', syncApiKeyFromSession);
    };
  }, [apiKey]);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    if (key) {
      sessionStorage.setItem('anthropic_key', key);
    } else {
      sessionStorage.removeItem('anthropic_key');
    }
  }, []);

  const createLiveTracker = useCallback((seed: LiveSearchTrackerSeed) => {
    setLiveTracker({
      id: `live-tracker-${Date.now()}`,
      query: seed.query,
      pensionFunds: seed.pensionFunds,
      metrics: seed.metrics,
      assetClasses: seed.assetClasses,
      frequency: seed.frequency,
      status: 'finding_sources',
      message: 'Searching for relevant documents...',
      sourceCandidates: [],
      selectedSource: null,
      pdfLinks: [],
      selectedPdfUrls: [],
      attemptedPdfUrls: [],
      extractionLogs: [],
      progress: { current: 0, total: 0, currentFile: '' },
      foundMetrics: [],
      foundSignals: [],
      scorecards: [],
      errorMessage: '',
      createdAt: new Date().toISOString(),
    });
  }, []);

  const clearLiveTracker = useCallback(() => {
    setLiveTracker(null);
  }, []);

  const clearActiveResults = useCallback(() => {
    setActiveResults(null);
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
        liveTracker,
        setLiveTracker,
        activeResults,
        setActiveResults,
        createLiveTracker,
        clearLiveTracker,
        clearActiveResults,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppState {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
