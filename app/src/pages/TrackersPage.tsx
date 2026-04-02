import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, MoreVertical, Clock, Database, Activity, Pause, Play, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { trackers as defaultTrackers } from '../data/metrics';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import type { Tracker } from '../data/types';

interface TrackerWithId extends Tracker {
  id: string;
  _editing?: boolean;
}

function generateId(): string {
  return `tracker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TrackersPage() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [trackerList, setTrackerList] = useState<TrackerWithId[]>([]);
  const [editState, setEditState] = useState<Record<string, { name: string; frequency: string }>>({});
  const { toasts, showToast, dismissToast } = useToast();
  const undoTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Initialize trackers from default data + sessionStorage
  useEffect(() => {
    const base: TrackerWithId[] = defaultTrackers.map((t, i) => ({
      ...t,
      id: t.id || `default-${i}`,
    }));

    const savedRaw = sessionStorage.getItem('saved_trackers');
    if (savedRaw) {
      try {
        const saved: Tracker[] = JSON.parse(savedRaw);
        const savedWithIds: TrackerWithId[] = saved.map((t, i) => ({
          ...t,
          id: t.id || `saved-${i}`,
        }));
        setTrackerList([...savedWithIds, ...base]);
      } catch {
        setTrackerList(base);
      }
    } else {
      setTrackerList(base);
    }
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

  const handlePauseResume = (id: string) => {
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
  };

  const handleDelete = (id: string) => {
    const tracker = trackerList.find(t => t.id === id);
    if (!tracker) return;

    const deletedTracker = { ...tracker };
    setTrackerList(prev => prev.filter(t => t.id !== id));
    setOpenMenu(null);

    // Set a timer to permanently delete (clear undo option)
    const timer = setTimeout(() => {
      undoTimerRef.current.delete(id);
    }, 5000);
    undoTimerRef.current.set(id, timer);

    showToast('Tracker deleted', 'info', {
      label: 'Undo',
      onClick: () => {
        // Restore the tracker
        setTrackerList(prev => {
          // Insert back in roughly original position
          const newList = [...prev];
          newList.push(deletedTracker);
          return newList;
        });
        const undoTimer = undoTimerRef.current.get(id);
        if (undoTimer) {
          clearTimeout(undoTimer);
          undoTimerRef.current.delete(id);
        }
        showToast('Tracker restored', 'success');
      },
    });
  };

  const handleStartEdit = (id: string) => {
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
  };

  const handleSaveEdit = (id: string) => {
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
  };

  const handleCancelEdit = (id: string) => {
    setTrackerList(prev => prev.map(t =>
      t.id === id ? { ...t, _editing: false } : t
    ));
    setEditState(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleNewTracker = () => {
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
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Trackers</h2>
          <p className="text-sm text-text-secondary font-light">Monitoring queries that run automatically</p>
        </div>
        <button
          onClick={handleNewTracker}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Tracker
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence>
          {trackerList.map((tracker) => (
            <motion.div
              key={tracker.id}
              layout
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0, marginBottom: 0, padding: 0, overflow: 'hidden' }}
              transition={{ duration: 0.3 }}
              className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors relative"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {tracker._editing ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Bell className="w-4.5 h-4.5 text-text-muted" />
                        <input
                          type="text"
                          value={editState[tracker.id]?.name ?? tracker.name}
                          onChange={(e) => setEditState(prev => ({
                            ...prev,
                            [tracker.id]: { ...prev[tracker.id], name: e.target.value },
                          }))}
                          placeholder="Tracker name..."
                          autoFocus
                          className="bg-bg-hover border border-border rounded-lg px-3 py-1.5 text-base font-semibold text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-3 ml-7">
                        <label className="text-xs text-text-muted">Frequency:</label>
                        <select
                          value={editState[tracker.id]?.frequency ?? tracker.frequency}
                          onChange={(e) => setEditState(prev => ({
                            ...prev,
                            [tracker.id]: { ...prev[tracker.id], frequency: e.target.value },
                          }))}
                          className="bg-bg-hover border border-border rounded-lg px-3 py-1 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none cursor-pointer"
                        >
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Monthly">Monthly</option>
                        </select>
                        <div className="flex gap-2 ml-auto">
                          <button
                            onClick={() => handleSaveEdit(tracker.id)}
                            className="px-3 py-1 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button
                            onClick={() => handleCancelEdit(tracker.id)}
                            className="px-3 py-1 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <Bell className="w-4.5 h-4.5 text-text-muted" />
                        <h3 className="text-base font-semibold text-text-primary">{tracker.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          tracker.status === 'active'
                            ? 'bg-green/15 text-green-light'
                            : 'bg-yellow/15 text-yellow'
                        }`}>
                          {tracker.status === 'active' ? 'Active' : 'Paused'}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Database className="w-3.5 h-3.5" />
                          <span>{tracker.sources} sources</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Activity className="w-3.5 h-3.5" />
                          <span>{tracker.metrics} metrics</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-text-muted">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Last match: {tracker.last_match}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-bg-hover text-text-secondary text-xs font-medium">
                          {tracker.frequency}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {!tracker._editing && (
                  <div className="relative" data-menu-container>
                    <button
                      onClick={() => setOpenMenu(openMenu === tracker.id ? null : tracker.id)}
                      className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {openMenu === tracker.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-8 w-40 bg-bg-secondary border border-border rounded-lg shadow-xl z-10 overflow-hidden"
                        >
                          <button
                            onClick={() => handlePauseResume(tracker.id)}
                            className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            {tracker.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            {tracker.status === 'active' ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => handleStartEdit(tracker.id)}
                            className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tracker.id)}
                            className="w-full px-3 py-2 text-sm text-red hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {trackerList.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Bell className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary">No trackers yet</p>
            <p className="text-sm text-text-muted mt-1">Create a new tracker to start monitoring</p>
          </motion.div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
