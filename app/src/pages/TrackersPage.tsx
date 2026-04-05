import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, MoreVertical, Clock, Database, Activity, Pause, Play,
  Pencil, Trash2, Plus, Check, X, Search, Loader2, FileText,
  Eye, Zap, AlertTriangle, Radio, ChevronRight, Sparkles,
  TrendingUp, Shield,
} from 'lucide-react';
import { trackers as defaultTrackers } from '../data/metrics';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import type { Tracker, Page } from '../data/types';

type ScanPhase = 'idle' | 'notification' | 'crawling' | 'extracting' | 'complete';
type FrequencyFilter = 'All' | 'Daily' | 'Weekly' | 'Monthly';

const ease = [0.22, 1, 0.36, 1] as const;

interface TrackerWithId extends Tracker {
  id: string;
  _editing?: boolean;
}

interface TrackersPageProps {
  onNavigate: (page: Page) => void;
}

function generateId(): string {
  return `tracker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadInitialTrackers(): TrackerWithId[] {
  const base: TrackerWithId[] = defaultTrackers.map((tracker, index) => ({
    ...tracker,
    id: tracker.id || `default-${index}`,
  }));

  const savedRaw = sessionStorage.getItem('saved_trackers');
  if (!savedRaw) {
    return base;
  }

  try {
    const saved: Tracker[] = JSON.parse(savedRaw);
    const savedWithIds: TrackerWithId[] = saved.map((tracker, index) => ({
      ...tracker,
      id: tracker.id || `saved-${index}`,
    }));
    return [...savedWithIds, ...base];
  } catch {
    return base;
  }
}

/* ================================================================
   Mini Stat Card
   ================================================================ */

function MiniStat({ label, value, icon: Icon, color, delay }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease }}
      className="stat-card flex-1 min-w-0"
    >
      <div className="stat-card-inner !py-4 !px-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="stat-value text-xl font-bold tracking-tight leading-none">{value}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted mt-0.5">{label}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Frequency Filter Tabs
   ================================================================ */

function FrequencyTabs({ active, onChange }: { active: FrequencyFilter; onChange: (f: FrequencyFilter) => void }) {
  const tabs: FrequencyFilter[] = ['All', 'Daily', 'Weekly', 'Monthly'];
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-secondary/80 border border-border/60">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`relative px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
            active === tab
              ? 'text-text-primary'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {active === tab && (
            <motion.div
              layoutId="frequency-tab"
              className="absolute inset-0 rounded-lg bg-accent/15 border border-accent/25"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{tab}</span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================
   Tracker Card (Premium)
   ================================================================ */

function TrackerCardView({
  tracker,
  index,
  openMenu,
  onToggleMenu,
  onPauseResume,
  onStartEdit,
  onDelete,
  editState,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
}: {
  tracker: TrackerWithId;
  index: number;
  openMenu: string | null;
  onToggleMenu: (id: string) => void;
  onPauseResume: (id: string) => void;
  onStartEdit: (id: string) => void;
  onDelete: (id: string) => void;
  editState: Record<string, { name: string; frequency: string }>;
  onEditChange: (id: string, field: 'name' | 'frequency', value: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: (id: string) => void;
}) {
  const hasAlerts = (tracker.newAlerts ?? 0) > 0;
  const isPaused = tracker.status === 'paused';

  if (tracker._editing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -80, height: 0, marginBottom: 0, overflow: 'hidden' }}
        transition={{ duration: 0.3, ease }}
        className="rounded-2xl border border-accent/25 bg-bg-card/90 p-5 shadow-[0_8px_32px_rgba(99,102,241,0.08)]"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4 text-accent-light" />
            </div>
            <input
              type="text"
              value={editState[tracker.id]?.name ?? tracker.name}
              onChange={(e) => onEditChange(tracker.id, 'name', e.target.value)}
              placeholder="Tracker name..."
              autoFocus
              className="bg-bg-hover/60 border border-border rounded-xl px-4 py-2.5 text-sm font-semibold text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 flex-1 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 ml-12">
            <label className="text-xs text-text-muted font-medium">Frequency</label>
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-bg-hover/60 border border-border/50">
              {['Daily', 'Weekly', 'Monthly'].map((freq) => (
                <button
                  key={freq}
                  onClick={() => onEditChange(tracker.id, 'frequency', freq)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    (editState[tracker.id]?.frequency ?? tracker.frequency) === freq
                      ? 'bg-accent/15 text-accent-light border border-accent/25'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => onSaveEdit(tracker.id)}
                className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-light transition-colors flex items-center gap-1.5 cursor-pointer shadow-[0_0_20px_rgba(99,102,241,0.2)]"
              >
                <Check className="w-3.5 h-3.5" /> Save
              </button>
              <button
                onClick={() => onCancelEdit(tracker.id)}
                className="px-4 py-2 rounded-xl bg-bg-hover border border-border text-xs font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -80, height: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ delay: 0.04 * index, duration: 0.4, ease }}
      whileHover={{ y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
      className={`group relative overflow-hidden rounded-2xl transition-all duration-300 ${
        hasAlerts
          ? 'shadow-[0_0_40px_rgba(99,102,241,0.1),0_20px_60px_rgba(5,10,20,0.25)]'
          : 'shadow-[0_20px_60px_rgba(5,10,20,0.18)]'
      } ${
        isPaused
          ? 'border border-border/40 bg-bg-card/50 opacity-70'
          : hasAlerts
            ? 'border border-accent/20 bg-gradient-to-br from-accent/[0.04] via-bg-card/95 to-bg-card/90'
            : 'border border-border/60 bg-bg-card/90 hover:border-border-light/80'
      }`}
    >
      {/* Top accent line for cards with alerts */}
      {hasAlerts && (
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-light/50 to-transparent" />
      )}

      {/* Subtle hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 0%, rgba(99,102,241,0.04) 0%, transparent 70%)' }}
      />

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Status indicator */}
            {tracker.status === 'active' ? (
              <motion.div
                className="relative w-2.5 h-2.5 rounded-full bg-green shrink-0 mt-0.5"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="absolute inset-0 rounded-full bg-green animate-ping opacity-30" />
              </motion.div>
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-text-muted/25 shrink-0 mt-0.5" />
            )}

            <h4 className="text-[15px] font-semibold text-text-primary truncate">{tracker.name}</h4>

            {/* Alert badge */}
            {hasAlerts && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="shrink-0 flex items-center gap-1 rounded-full bg-accent/12 border border-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent-light"
              >
                <Zap className="w-2.5 h-2.5" />
                {tracker.newAlerts} new
              </motion.span>
            )}

            {isPaused && (
              <span className="shrink-0 flex items-center gap-1 rounded-full bg-yellow/8 border border-yellow/15 px-2 py-0.5 text-[10px] font-medium text-yellow">
                <Pause className="w-2.5 h-2.5" />
                Paused
              </span>
            )}
          </div>

          {/* Menu */}
          <div className="relative shrink-0 ml-2" data-menu-container>
            <button
              onClick={() => onToggleMenu(tracker.id)}
              className="p-1.5 rounded-lg hover:bg-bg-hover/80 text-text-muted hover:text-text-secondary transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {openMenu === tracker.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.15, ease }}
                  className="absolute right-0 top-9 w-44 bg-bg-secondary/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] z-20 overflow-hidden"
                >
                  <div className="py-1">
                    <button
                      onClick={() => onPauseResume(tracker.id)}
                      className="w-full px-3.5 py-2.5 text-[13px] text-text-secondary hover:bg-bg-hover/80 hover:text-text-primary flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      {tracker.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {tracker.status === 'active' ? 'Pause Tracker' : 'Resume Tracker'}
                    </button>
                    <button
                      onClick={() => onStartEdit(tracker.id)}
                      className="w-full px-3.5 py-2.5 text-[13px] text-text-secondary hover:bg-bg-hover/80 hover:text-text-primary flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Tracker
                    </button>
                    <div className="mx-3 my-1 h-px bg-border/50" />
                    <button
                      onClick={() => onDelete(tracker.id)}
                      className="w-full px-3.5 py-2.5 text-[13px] text-red/80 hover:bg-red/5 hover:text-red flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Tracker
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Latest finding */}
        {tracker.latestFinding && (
          <div className={`mb-4 ml-[22px] pl-3 border-l-2 ${
            hasAlerts ? 'border-accent/30' : 'border-border/40'
          }`}>
            <p className={`text-[13px] leading-relaxed line-clamp-2 ${
              isPaused ? 'text-text-muted/50' : 'text-text-secondary'
            }`}>
              {tracker.latestFinding}
            </p>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-2 ml-[22px]">
          <div className="tracker-stat-pill">
            <Database className="w-3 h-3 text-accent-light/60" />
            <span className="text-[11px] font-medium text-text-secondary">{tracker.sources} sources</span>
          </div>
          <div className="tracker-stat-pill">
            <Activity className="w-3 h-3 text-accent-light/60" />
            <span className="text-[11px] font-medium text-text-secondary">{tracker.metrics} metrics</span>
          </div>
          <div className="tracker-stat-pill">
            <Clock className="w-3 h-3 text-accent-light/60" />
            <span className="text-[11px] font-medium text-text-secondary">{tracker.frequency}</span>
          </div>

          <span className="ml-auto text-[11px] text-text-muted/60 flex items-center gap-1">
            <Radio className="w-3 h-3" />
            {tracker.last_match}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Main Page
   ================================================================ */

export function TrackersPage({ onNavigate }: TrackersPageProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [trackerList, setTrackerList] = useState<TrackerWithId[]>(loadInitialTrackers);
  const [editState, setEditState] = useState<Record<string, { name: string; frequency: string }>>({});
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>('All');
  const { toasts, showToast, dismissToast } = useToast();
  const undoTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Scan demo state
  const [scanPhase, setScanPhase] = useState<ScanPhase>('notification');
  const [scanProgress, setScanProgress] = useState('');
  const [foundPdfs, setFoundPdfs] = useState<string[]>([]);

  // Derived stats
  const stats = useMemo(() => {
    const active = trackerList.filter(t => t.status === 'active').length;
    const totalMetrics = trackerList.reduce((sum, t) => sum + t.metrics, 0);
    const totalAlerts = trackerList.reduce((sum, t) => sum + (t.newAlerts ?? 0), 0);
    const totalSources = trackerList.reduce((sum, t) => sum + t.sources, 0);
    return { active, totalMetrics, totalAlerts, totalSources };
  }, [trackerList]);

  // Filtered trackers
  const filteredTrackers = useMemo(() => {
    if (frequencyFilter === 'All') return trackerList;
    return trackerList.filter(t => t.frequency === frequencyFilter);
  }, [trackerList, frequencyFilter]);

  const handleScanNow = useCallback(() => {
    setScanPhase('crawling');
    setScanProgress('Crawling isbinvestment.com for documents...');

    setTimeout(() => {
      setFoundPdfs(['ISBI_Board_Q1_2026.pdf', 'ISBI_IPC_Mar_2026.pdf', 'ISBI_Performance_Q4_2025.pdf']);
      setScanProgress('Found 3 PDF documents');
    }, 1500);

    setTimeout(() => {
      setScanPhase('extracting');
      setScanProgress('Extracting metrics from ISBI_Board_Q1_2026.pdf...');
    }, 2500);

    setTimeout(() => {
      setScanPhase('complete');
      setScanProgress('8 new metrics extracted from 3 documents');
      setTrackerList(prev => prev.map((t, i) =>
        i === 0 && t.status === 'active'
          ? { ...t, last_match: 'Just now', metrics: t.metrics + 8 }
          : t
      ));
      showToast('8 new metrics extracted from ISBI', 'success');
    }, 4500);
  }, [showToast]);

  const handleDismissNotification = useCallback(() => {
    setScanPhase('idle');
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-menu-container]')) {
      setOpenMenu(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const handleToggleMenu = useCallback((id: string) => {
    setOpenMenu(prev => prev === id ? null : id);
  }, []);

  const handlePauseResume = useCallback((id: string) => {
    setTrackerList(prev => prev.map(t =>
      t.id === id
        ? { ...t, status: t.status === 'active' ? 'paused' as const : 'active' as const }
        : t
    ));
    setOpenMenu(null);
    const tracker = trackerList.find(t => t.id === id);
    if (tracker) {
      showToast(
        tracker.status === 'active' ? 'Tracker paused' : 'Tracker resumed',
        'info'
      );
    }
  }, [trackerList, showToast]);

  const handleDelete = useCallback((id: string) => {
    const tracker = trackerList.find(t => t.id === id);
    if (!tracker) return;

    const deletedTracker = { ...tracker };
    setTrackerList(prev => prev.filter(t => t.id !== id));
    setOpenMenu(null);

    const timer = setTimeout(() => {
      undoTimerRef.current.delete(id);
    }, 5000);
    undoTimerRef.current.set(id, timer);

    showToast('Tracker deleted', 'info', {
      label: 'Undo',
      onClick: () => {
        setTrackerList(prev => [...prev, deletedTracker]);
        const undoTimer = undoTimerRef.current.get(id);
        if (undoTimer) {
          clearTimeout(undoTimer);
          undoTimerRef.current.delete(id);
        }
        showToast('Tracker restored', 'success');
      },
    });
  }, [trackerList, showToast]);

  const handleStartEdit = useCallback((id: string) => {
    const tracker = trackerList.find(t => t.id === id);
    if (!tracker) return;
    setEditState(prev => ({
      ...prev,
      [id]: { name: tracker.name, frequency: tracker.frequency },
    }));
    setTrackerList(prev => prev.map(t =>
      t.id === id ? { ...t, _editing: true } : t
    ));
    setOpenMenu(null);
  }, [trackerList]);

  const handleEditChange = useCallback((id: string, field: 'name' | 'frequency', value: string) => {
    setEditState(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    const edit = editState[id];
    if (!edit) return;
    setTrackerList(prev => prev.map(t =>
      t.id === id ? { ...t, name: edit.name || t.name, frequency: edit.frequency, _editing: false } : t
    ));
    setEditState(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    showToast('Tracker updated', 'success');
  }, [editState, showToast]);

  const handleCancelEdit = useCallback((id: string) => {
    setTrackerList(prev => prev.map(t =>
      t.id === id ? { ...t, _editing: false } : t
    ));
    setEditState(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleNewTracker = useCallback(() => {
    const id = generateId();
    const newTracker: TrackerWithId = {
      id,
      name: '',
      status: 'active',
      sources: 0,
      metrics: 0,
      last_match: 'Never',
      frequency: 'Weekly',
      _editing: true,
    };
    setEditState(prev => ({
      ...prev,
      [id]: { name: '', frequency: 'Weekly' },
    }));
    setTrackerList(prev => [newTracker, ...prev]);
  }, []);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="mb-8"
        >
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold text-text-primary tracking-tight">Trackers</h2>
                <span className="text-xs font-medium text-text-muted bg-bg-hover/60 border border-border/50 px-2 py-0.5 rounded-full">
                  {trackerList.length} total
                </span>
              </div>
              <p className="text-sm text-text-muted font-light">
                Automated monitoring queries that scan for new data on your schedule
              </p>
            </div>
            <motion.button
              onClick={handleNewTracker}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-light transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_24px_rgba(99,102,241,0.2)] hover:shadow-[0_0_32px_rgba(99,102,241,0.3)]"
            >
              <Plus className="w-4 h-4" />
              New Tracker
            </motion.button>
          </div>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <MiniStat
            label="Active"
            value={stats.active}
            icon={Radio}
            color="bg-green/10 border border-green/20 text-green"
            delay={0.05}
          />
          <MiniStat
            label="Alerts"
            value={stats.totalAlerts}
            icon={Zap}
            color="bg-accent/10 border border-accent/20 text-accent-light"
            delay={0.1}
          />
          <MiniStat
            label="Metrics"
            value={stats.totalMetrics}
            icon={TrendingUp}
            color="bg-blue/10 border border-blue/20 text-blue"
            delay={0.15}
          />
          <MiniStat
            label="Sources"
            value={stats.totalSources}
            icon={Shield}
            color="bg-purple/10 border border-purple/20 text-purple"
            delay={0.2}
          />
        </div>

        {/* Scan notification / progress panel */}
        <AnimatePresence mode="wait">
          {scanPhase === 'notification' && (
            <motion.div
              key="notification"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="relative overflow-hidden rounded-2xl border border-accent/20 mb-6"
            >
              {/* Animated gradient background */}
              <div className="absolute inset-0 bg-gradient-to-r from-accent/[0.06] via-accent/[0.03] to-transparent" />
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-light/40 to-transparent" />

              <div className="relative flex items-center gap-4 px-5 py-4">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0"
                >
                  <Sparkles className="w-5 h-5 text-accent-light" />
                </motion.div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    <span className="text-accent-light">3 new documents</span> detected
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">From ISBI since last scan</p>
                </div>
                <button
                  onClick={handleScanNow}
                  className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-light transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                >
                  <Search className="w-3.5 h-3.5" />
                  Scan Now
                </button>
                <button
                  onClick={handleDismissNotification}
                  className="p-2 rounded-lg hover:bg-bg-hover/60 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {scanPhase === 'crawling' && (
            <motion.div
              key="crawling"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-accent/15 bg-bg-card/80 p-5 mb-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 className="w-5 h-5 text-accent-light" />
                </motion.div>
                <p className="text-sm text-text-primary font-medium">{scanProgress}</p>
              </div>
              {foundPdfs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                  className="ml-8 space-y-2"
                >
                  {foundPdfs.map((pdf, i) => (
                    <motion.div
                      key={pdf}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.3 }}
                      className="flex items-center gap-2 text-sm text-text-secondary"
                    >
                      <FileText className="w-3.5 h-3.5 text-accent-light/50" />
                      <span>{pdf}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {scanPhase === 'extracting' && (
            <motion.div
              key="extracting"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-accent/15 bg-bg-card/80 p-5 mb-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 className="w-5 h-5 text-accent-light" />
                </motion.div>
                <p className="text-sm text-text-primary font-medium">{scanProgress}</p>
              </div>
              <div className="ml-8">
                <div className="progress-bar-track">
                  <motion.div
                    className="progress-bar-fill"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {scanPhase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="relative overflow-hidden rounded-2xl border border-green/20 bg-bg-card/80 p-5 mb-6"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green/40 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">{scanProgress}</p>
                  <p className="text-xs text-text-muted mt-0.5">Ready to review</p>
                </div>
                <button
                  onClick={() => onNavigate('results')}
                  className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-light transition-all cursor-pointer flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Results
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="flex items-center justify-between mb-5"
        >
          <FrequencyTabs active={frequencyFilter} onChange={setFrequencyFilter} />
          <span className="text-xs text-text-muted">
            {filteredTrackers.length} tracker{filteredTrackers.length !== 1 ? 's' : ''}
          </span>
        </motion.div>

        {/* Tracker list */}
        <div className="space-y-3">
          <AnimatePresence>
            {filteredTrackers.map((tracker, index) => (
              <TrackerCardView
                key={tracker.id}
                tracker={tracker}
                index={index}
                openMenu={openMenu}
                onToggleMenu={handleToggleMenu}
                onPauseResume={handlePauseResume}
                onStartEdit={handleStartEdit}
                onDelete={handleDelete}
                editState={editState}
                onEditChange={handleEditChange}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
              />
            ))}
          </AnimatePresence>

          {filteredTrackers.length === 0 && trackerList.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <AlertTriangle className="w-8 h-8 text-text-muted/40 mx-auto mb-3" />
              <p className="text-sm text-text-secondary">No {frequencyFilter.toLowerCase()} trackers</p>
              <p className="text-xs text-text-muted mt-1">Try a different frequency filter</p>
            </motion.div>
          )}

          {trackerList.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 rounded-2xl bg-bg-hover/40 border border-border/30 flex items-center justify-center mx-auto mb-4">
                <Bell className="w-7 h-7 text-text-muted/40" />
              </div>
              <p className="text-text-secondary font-medium">No trackers yet</p>
              <p className="text-sm text-text-muted mt-1 mb-5">Create a tracker to start automated monitoring</p>
              <button
                onClick={handleNewTracker}
                className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-light transition-colors flex items-center gap-2 cursor-pointer mx-auto"
              >
                <Plus className="w-4 h-4" />
                New Tracker
              </button>
            </motion.div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
