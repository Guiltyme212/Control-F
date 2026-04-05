import { motion } from 'framer-motion';
import { Search, LayoutGrid, BarChart3, Bell, Upload } from 'lucide-react';
import type { Page } from '../data/types';
import { metrics, trackers } from '../data/metrics';

const navItems: { id: Page; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'results', label: 'Results', icon: LayoutGrid, badge: String(metrics.length) },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'trackers', label: 'Trackers', icon: Bell, badge: String(trackers.filter(t => t.status === 'active').length) },
  { id: 'upload', label: 'Upload', icon: Upload },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <div className="w-60 bg-bg-secondary border-r border-border flex flex-col shrink-0 h-screen sticky top-0">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-text-primary tracking-tight flex items-center">
            Control<span className="inline-flex items-center justify-center rounded bg-accent/20 relative" style={{ height: '1.1em', width: '1.1em', top: '0.05em', position: 'relative' }}><img
              alt="F"
              src="/vector.svg"
              className="block"
              style={{ height: '0.7em', width: '0.7em', filter: 'brightness(0) invert(1)' }}
            /></span><span className="text-text-secondary">.ai</span>
          </span>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 ml-auto">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-green"
              animate={{
                opacity: [1, 0.4, 1],
                scale: [1, 0.85, 1],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-xs text-green font-medium">Live</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              whileHover={{ x: 2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer relative ${
                isActive
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.06) 60%, transparent 100%)',
                    borderLeft: '2px solid rgba(99,102,241,0.6)',
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon className="w-4.5 h-4.5 relative z-10" />
              <span className="relative z-10">{item.label}</span>
              {item.badge && (
                <span className="ml-auto relative z-10 bg-accent/20 text-accent-light text-xs px-1.5 py-0.5 rounded-full font-medium">
                  {item.badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Gradient separator before footer */}
      <div
        className="mx-4 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, var(--color-border-light) 50%, transparent 100%)',
        }}
      />

      <div className="p-4">
        <div className="text-xs text-text-muted font-light flex items-center">
          control<span className="inline-flex items-center justify-center rounded bg-white/5 relative" style={{ height: '0.95em', width: '0.95em', top: '0.05em', position: 'relative' }}><img
            alt="f"
            src="/vector.svg"
            className="block"
            style={{ height: '0.6em', width: '0.6em', filter: 'brightness(0) invert(0.45)' }}
          /></span>.ai
        </div>
      </div>
    </div>
  );
}
