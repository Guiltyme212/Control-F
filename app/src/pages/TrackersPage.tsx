import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, MoreVertical, Clock, Database, Activity, Pause, Play, Pencil, Trash2, Plus } from 'lucide-react';
import { trackers } from '../data/metrics';

export function TrackersPage() {
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Trackers</h2>
          <p className="text-sm text-text-secondary font-light">Monitoring queries that run automatically</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors flex items-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" />
          New Tracker
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {trackers.map((tracker, i) => (
          <motion.div
            key={tracker.name}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-bg-card border border-border rounded-xl p-5 hover:border-border-light transition-colors relative"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
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
              </div>

              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === i ? null : i)}
                  className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {openMenu === i && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute right-0 top-8 w-40 bg-bg-secondary border border-border rounded-lg shadow-xl z-10 overflow-hidden"
                  >
                    <button className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer">
                      {tracker.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {tracker.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                    <button className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button className="w-full px-3 py-2 text-sm text-red hover:bg-bg-hover flex items-center gap-2 transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
