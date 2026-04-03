import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { SearchPage } from './pages/SearchPage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrackersPage } from './pages/TrackersPage';
import { UploadPage } from './pages/UploadPage';
import { useAppContext } from './context/AppContext';
import { metrics } from './data/metrics';
import type { Page } from './data/types';

const pageOrder: Page[] = ['search', 'results', 'dashboard', 'trackers', 'upload'];

function App() {
  const [activePage, setActivePage] = useState<Page>('search');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { setHasSearched } = useAppContext();

  const handleSearchComplete = useCallback(() => {
    setActivePage('dashboard');
    setHasSearched(true);
  }, [setHasSearched]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K - toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      // Escape - close modals
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          setShowCommandPalette(false);
          return;
        }
        if (showSettings) {
          setShowSettings(false);
          return;
        }
      }

      // Alt+1 through Alt+5 - navigate to pages
      if (e.altKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        setActivePage(pageOrder[index]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCommandPalette, showSettings]);

  return (
    <div className="flex w-full min-h-screen bg-bg-primary">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col overflow-auto"
          >
            {activePage === 'search' && <SearchPage onSearchComplete={handleSearchComplete} />}
            {activePage === 'results' && <ResultsPage />}
            {activePage === 'dashboard' && <DashboardPage />}
            {activePage === 'trackers' && <TrackersPage />}
            {activePage === 'upload' && <UploadPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Settings gear button */}
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-6 right-6 p-2.5 rounded-full bg-bg-card border border-border text-text-muted hover:text-text-primary hover:border-accent/40 transition-all shadow-lg z-40 cursor-pointer"
        aria-label="Settings"
      >
        <Settings className="w-4.5 h-4.5" />
      </button>

      {/* Modals */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={setActivePage}
        metrics={metrics}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;
