import { motion, AnimatePresence } from 'framer-motion';
import { Search, LayoutGrid, BarChart3, Bell, Upload, FlaskConical, Menu, X } from 'lucide-react';
import type { Page } from '../data/types';
import { metrics, trackers } from '../data/metrics';

const navItems: { id: Page; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'results', label: 'Results', icon: LayoutGrid, badge: String(metrics.length) },
  { id: 'trackers', label: 'Trackers', icon: Bell, badge: String(trackers.filter(t => t.status === 'active').length) },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'eval', label: 'Eval', icon: FlaskConical },
];

const EXPANDED_W = 240;
const COLLAPSED_W = 64;

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export { EXPANDED_W, COLLAPSED_W };

export function Sidebar({ activePage, onNavigate, collapsed, onToggle }: SidebarProps) {
  return (
    <motion.div
      className="bg-bg-secondary border-r border-border flex flex-col shrink-0 h-screen sticky top-0 overflow-hidden"
      animate={{ width: collapsed ? COLLAPSED_W : EXPANDED_W }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
    >
      {/* Header */}
      <div className="border-b border-border" style={{ minHeight: 57 }}>
        <div className="flex items-center h-[57px]" style={{ padding: collapsed ? '0 14px' : '0 20px' }}>
          <AnimatePresence mode="wait" initial={false}>
            {collapsed ? (
              /* Collapsed: F logo + hamburger */
              <motion.div
                key="collapsed-header"
                className="flex items-center justify-between w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  onClick={onToggle}
                  className="flex items-center gap-0 cursor-pointer group relative"
                  aria-label="Expand sidebar"
                >
                  {/* F logo */}
                  <span className="inline-flex items-center justify-center rounded bg-accent/20 relative" style={{ height: '1.45em', width: '1.45em' }}>
                    <img
                      alt="F"
                      src="/vector.svg"
                      className="block"
                      style={{ height: '0.85em', width: '0.85em', filter: 'brightness(0) invert(1)' }}
                    />
                  </span>
                  {/* Hamburger overlaid bottom-right */}
                  <Menu className="w-3.5 h-3.5 text-text-muted group-hover:text-text-primary transition-colors absolute -bottom-1 -right-2" />
                </button>
              </motion.div>
            ) : (
              /* Expanded: full logo + close toggle */
              <motion.div
                key="expanded-header"
                className="flex items-center justify-between w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-2">
                  <motion.span
                    className="text-lg font-semibold text-text-primary tracking-tight flex items-center"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.1 }}
                    >
                      Control
                    </motion.span>
                    <span className="inline-flex items-center justify-center rounded bg-accent/20 relative" style={{ height: '1.1em', width: '1.1em', top: '0.05em', position: 'relative' }}>
                      <img
                        alt="F"
                        src="/vector.svg"
                        className="block"
                        style={{ height: '0.7em', width: '0.7em', filter: 'brightness(0) invert(1)' }}
                      />
                    </span>
                    <motion.span
                      className="text-text-secondary"
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.18 }}
                    >
                      .ai
                    </motion.span>
                  </motion.span>

                  {/* Live indicator */}
                  <motion.div
                    className="flex items-center gap-1.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.3 }}
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-green"
                      animate={{
                        opacity: [1, 0.4, 1],
                        scale: [1, 0.85, 1],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <span className="text-xs text-green font-medium">Live</span>
                  </motion.div>
                </div>

                {/* Collapse button */}
                <motion.button
                  onClick={onToggle}
                  className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover/50 transition-colors cursor-pointer"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.2 }}
                  aria-label="Collapse sidebar"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              whileHover={{ x: collapsed ? 0 : 2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer relative ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg"
                  style={{
                    background: collapsed
                      ? 'rgba(99,102,241,0.15)'
                      : 'linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.06) 60%, transparent 100%)',
                    borderLeft: collapsed ? 'none' : '2px solid rgba(99,102,241,0.6)',
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon className="w-4.5 h-4.5 relative z-10 shrink-0" />
              {!collapsed && (
                <motion.span
                  className="relative z-10 whitespace-nowrap"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.label}
                </motion.span>
              )}
              {!collapsed && item.badge && (
                <motion.span
                  className="ml-auto relative z-10 bg-accent/20 text-accent-light text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                >
                  {item.badge}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Gradient separator */}
      <div
        className="mx-3 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, var(--color-border-light) 50%, transparent 100%)',
        }}
      />

      {/* Footer */}
      <div className="p-3 flex justify-center">
        {collapsed ? (
          <span className="inline-flex items-center justify-center rounded bg-white/5" style={{ height: '1.1em', width: '1.1em' }}>
            <img
              alt="f"
              src="/vector.svg"
              className="block"
              style={{ height: '0.6em', width: '0.6em', filter: 'brightness(0) invert(0.35)' }}
            />
          </span>
        ) : (
          <motion.div
            className="text-xs text-text-muted font-light flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            control<span className="inline-flex items-center justify-center rounded bg-white/5 relative" style={{ height: '0.95em', width: '0.95em', top: '0.05em', position: 'relative' }}>
              <img
                alt="f"
                src="/vector.svg"
                className="block"
                style={{ height: '0.6em', width: '0.6em', filter: 'brightness(0) invert(0.45)' }}
              />
            </span>.ai
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
