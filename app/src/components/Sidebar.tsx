import { motion } from 'framer-motion';
import { Search, LayoutGrid, BarChart3, Bell, Upload } from 'lucide-react';
import type { Page } from '../data/types';

const navItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'results', label: 'Results', icon: LayoutGrid },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'trackers', label: 'Trackers', icon: Bell },
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
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-white text-sm">
            F
          </div>
          <span className="text-lg font-semibold text-text-primary tracking-tight">
            CONTROL <span className="text-accent-light">F</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer relative ${
                isActive
                  ? 'text-text-primary bg-bg-hover'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-bg-hover"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <item.icon className="w-4.5 h-4.5 relative z-10" />
              <span className="relative z-10">{item.label}</span>
              {item.id === 'results' && activePage !== 'search' && (
                <span className="ml-auto relative z-10 bg-accent/20 text-accent-light text-xs px-1.5 py-0.5 rounded-full">
                  31
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-text-muted font-light">
          controlf.ai
        </div>
      </div>
    </div>
  );
}
