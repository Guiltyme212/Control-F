import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { SearchPage } from './pages/SearchPage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrackersPage } from './pages/TrackersPage';
import { UploadPage } from './pages/UploadPage';
import type { Page } from './data/types';

function App() {
  const [activePage, setActivePage] = useState<Page>('search');

  const handleSearchComplete = useCallback(() => {
    setActivePage('results');
  }, []);

  return (
    <div className="flex w-full min-h-screen bg-bg-primary">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
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
    </div>
  );
}

export default App;
