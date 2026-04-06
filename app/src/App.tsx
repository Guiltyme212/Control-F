import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, Bell, FileText, Activity, Zap } from 'lucide-react';
import { Sidebar, EXPANDED_W, COLLAPSED_W } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal } from './components/SettingsModal';
import { SearchPage } from './pages/SearchPage';
import { ResultsPage } from './pages/ResultsPage';
import { MonitorPage } from './pages/MonitorPage';
import { TrackersPage } from './pages/TrackersPage';
import { UploadPage } from './pages/UploadPage';
import { EvalPage } from './pages/EvalPage';
import { useAppContext } from './context/AppContext';
import { metrics } from './data/metrics';
import type { LiveSearchTrackerSeed, Page } from './data/types';

const pageOrder: Page[] = ['search', 'results', 'monitor', 'trackers', 'upload', 'eval'];

/* ------------------------------------------------------------------ */
/*  Flying Tracker Card — animates from search center to dashboard    */
/* ------------------------------------------------------------------ */

interface FlyingTrackerCardProps {
  query: string;
  onComplete: () => void;
  sidebarWidth: number;
}

interface TrackerFlightRect {
  top: number;
  left: number;
  width: number;
}

function FlyingTrackerCard({ query, onComplete, sidebarWidth }: FlyingTrackerCardProps) {
  const [landed, setLanded] = useState(false);
  const [targetRect, setTargetRect] = useState<TrackerFlightRect | null>(null);
  const completionTriggeredRef = useRef(false);

  const SIDEBAR_W = sidebarWidth;
  const PADDING = 24;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const contentW = vw - SIDEBAR_W;
  const startW = Math.min(380, Math.max(300, contentW - PADDING * 2));
  const startTop = Math.max(88, vh / 2 - 56);
  const startLeft = SIDEBAR_W + Math.max(PADDING, (contentW - startW) / 2);

  const fallbackTargetRect = useMemo<TrackerFlightRect>(() => {
    const containerW = Math.min(1100, Math.max(320, contentW - PADDING * 2));
    return {
      top: 212,
      left: SIDEBAR_W + Math.max(PADDING, (contentW - containerW) / 2),
      width: containerW,
    };
  }, [SIDEBAR_W, contentW]);

  useLayoutEffect(() => {
    let frameId = 0;
    let cancelled = false;
    const startedAt = performance.now();

    const measureTarget = () => {
      if (cancelled) return;

      const target = document.querySelector('[data-live-tracker-slot="true"]') as HTMLElement | null;
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0) {
          setTargetRect({
            top: rect.top,
            left: rect.left,
            width: rect.width,
          });
          return;
        }
      }

      if (performance.now() - startedAt > 900) {
        setTargetRect(fallbackTargetRect);
        return;
      }

      frameId = window.requestAnimationFrame(measureTarget);
    };

    frameId = window.requestAnimationFrame(measureTarget);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [fallbackTargetRect]);

  return (
    <motion.div
      className="fixed pointer-events-none"
      style={{ zIndex: 60 }}
      initial={{
        top: startTop,
        left: startLeft,
        width: startW,
        opacity: 1,
        scale: 1.04,
      }}
      animate={{
        top: targetRect?.top ?? startTop,
        left: targetRect?.left ?? startLeft,
        width: targetRect?.width ?? startW,
        opacity: 1,
        scale: 1,
      }}
      exit={{
        opacity: 0,
        transition: { duration: 0.35, ease: [0.4, 0, 1, 1] },
      }}
      transition={{
        type: 'spring',
        stiffness: 180,
        damping: 26,
        mass: 0.85,
        width: { type: 'spring', stiffness: 160, damping: 24 },
        scale: { type: 'spring', stiffness: 300, damping: 28 },
      }}
      onAnimationComplete={() => {
        if (!targetRect || completionTriggeredRef.current) return;
        completionTriggeredRef.current = true;
        setLanded(true);
        setTimeout(onComplete, 250);
      }}
    >
      {/* Glow aura during flight */}
      <motion.div
        className="absolute -inset-8 rounded-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 40%, transparent 70%)',
        }}
        initial={{ opacity: 1, scale: 1.15 }}
        animate={{ opacity: 0, scale: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Landing pulse ring */}
      <AnimatePresence>
        {landed && (
          <motion.div
            className="absolute -inset-2 rounded-[1.1rem] pointer-events-none"
            style={{ border: '1px solid rgba(99,102,241,0.35)' }}
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 1.06 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Card content — mirrors the dashboard tracker banner */}
      <div className="tracker-card" style={{ marginBottom: 0 }}>
        <div className="tracker-card-inner">
          <div className="flex items-center gap-4">
            {/* Status icon with pulse */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl bg-accent/12 border border-accent/25 flex items-center justify-center">
                <Bell className="w-5 h-5 text-accent-light" />
              </div>
              <motion.div
                className="absolute inset-0 rounded-xl border border-accent/30"
                animate={{ scale: [1, 1.35, 1.35], opacity: [0.6, 0, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
              />
            </div>

            {/* Query + status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-[11px] font-semibold text-accent-light uppercase tracking-[0.1em]">
                  Now tracking
                </span>
                <div className="h-3 w-px bg-border-light" />
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-light">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-green"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  Active
                </span>
              </div>
              <p className="text-sm text-text-primary font-medium truncate">{query}</p>
            </div>

            {/* Stat pills — fade in as card expands */}
            <motion.div
              className="flex items-center gap-2 shrink-0"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="tracker-stat-pill">
                <FileText className="w-3.5 h-3.5 text-accent-light/70" />
                <span className="text-xs text-text-secondary font-medium">4 sources</span>
              </div>
              <div className="tracker-stat-pill">
                <Activity className="w-3.5 h-3.5 text-accent-light/70" />
                <span className="text-xs text-text-secondary font-medium">31 metrics</span>
              </div>
              <div className="tracker-stat-pill">
                <Zap className="w-3.5 h-3.5 text-accent-light/70" />
                <span className="text-xs text-text-secondary font-medium">4 signals</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function App() {
  const [activePage, setActivePage] = useState<Page>('search');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const { setHasSearched, setSearchQuery, createLiveTracker } = useAppContext();
  const [flyingCard, setFlyingCard] = useState<string | null>(null);

  const handleSearchComplete = useCallback((seed: LiveSearchTrackerSeed) => {
    setSearchQuery(seed.query);
    createLiveTracker(seed);
    setFlyingCard(seed.query);
    setActivePage('monitor');
    setSidebarCollapsed(false); // expand sidebar when heading to dashboard
    setHasSearched(true);
  }, [createLiveTracker, setHasSearched, setSearchQuery]);

  const handleFlyingCardComplete = useCallback(() => {
    setFlyingCard(null);
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    setActivePage(page);
    if (page === 'monitor') {
      setSidebarCollapsed(false); // auto-expand on dashboard
    }
    if (page !== 'monitor') {
      setFlyingCard(null);
    }
  }, []);

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
        handleNavigate(pageOrder[index]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigate, showCommandPalette, showSettings]);

  return (
    <div className="flex w-full min-h-screen bg-bg-primary">
      <Sidebar activePage={activePage} onNavigate={handleNavigate} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
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
            {activePage === 'monitor' && <MonitorPage onNavigate={handleNavigate} trackerArrivalInProgress={Boolean(flyingCard)} />}
            {activePage === 'trackers' && <TrackersPage onNavigate={handleNavigate} />}
            {activePage === 'upload' && <UploadPage onNavigate={handleNavigate} />}
            {activePage === 'eval' && <EvalPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Flying tracker card transition overlay */}
      <AnimatePresence>
        {flyingCard && (
          <FlyingTrackerCard
            key="flying-tracker"
            query={flyingCard}
            onComplete={handleFlyingCardComplete}
            sidebarWidth={sidebarCollapsed ? COLLAPSED_W : EXPANDED_W}
          />
        )}
      </AnimatePresence>

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
        key={showCommandPalette ? 'command-open' : 'command-closed'}
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={handleNavigate}
        metrics={metrics}
      />
      <SettingsModal
        key={showSettings ? 'settings-open' : 'settings-closed'}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;
