import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LayoutGrid, BarChart3, Bell, Upload, Command } from 'lucide-react';
import type { Page } from '../data/types';
import type { Metric } from '../data/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  metrics: Metric[];
}

const pageItems: { id: Page; label: string; icon: React.ElementType; shortcut: string }[] = [
  { id: 'search', label: 'Search', icon: Search, shortcut: 'Alt+1' },
  { id: 'results', label: 'Results', icon: LayoutGrid, shortcut: 'Alt+2' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, shortcut: 'Alt+3' },
  { id: 'trackers', label: 'Trackers', icon: Bell, shortcut: 'Alt+4' },
  { id: 'upload', label: 'Upload', icon: Upload, shortcut: 'Alt+5' },
];

export function CommandPalette({ isOpen, onClose, onNavigate, metrics }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const recentMetrics = useMemo(() => {
    return [...metrics]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [metrics]);

  const filteredPages = useMemo(() => {
    if (!query) return pageItems;
    const lower = query.toLowerCase();
    return pageItems.filter((item) => item.label.toLowerCase().includes(lower));
  }, [query]);

  const filteredMetrics = useMemo(() => {
    if (!query) return recentMetrics;
    const lower = query.toLowerCase();
    return metrics
      .filter(
        (m) =>
          m.fund.toLowerCase().includes(lower) ||
          m.lp.toLowerCase().includes(lower) ||
          m.gp.toLowerCase().includes(lower) ||
          m.value.toLowerCase().includes(lower)
      )
      .slice(0, 5);
  }, [query, metrics, recentMetrics]);

  const totalItems = filteredPages.length + filteredMetrics.length;

  const handleSelect = useCallback(
    (index: number) => {
      if (index < filteredPages.length) {
        onNavigate(filteredPages[index].id);
        onClose();
      } else {
        onNavigate('results');
        onClose();
      }
    },
    [filteredPages, onNavigate, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelect(selectedIndex);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, totalItems, handleSelect]);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="fixed inset-0 bg-black/60"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative w-full max-w-lg bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-10"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, metrics, funds..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-text-muted bg-bg-primary border border-border rounded">
                ESC
              </kbd>
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
              {filteredPages.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-[11px] font-medium text-text-muted uppercase tracking-wider">
                    Pages
                  </div>
                  {filteredPages.map((item, i) => {
                    const isSelected = selectedIndex === i;
                    return (
                      <button
                        key={item.id}
                        data-selected={isSelected}
                        onClick={() => handleSelect(i)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent/15 text-accent-light'
                            : 'text-text-secondary hover:bg-bg-hover'
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        <span className="text-[11px] text-text-muted font-mono">{item.shortcut}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredMetrics.length > 0 && (
                <div className={filteredPages.length > 0 ? 'mt-2' : ''}>
                  <div className="px-2 py-1.5 text-[11px] font-medium text-text-muted uppercase tracking-wider">
                    {query ? 'Matching Metrics' : 'Recent Metrics'}
                  </div>
                  {filteredMetrics.map((m, i) => {
                    const idx = filteredPages.length + i;
                    const isSelected = selectedIndex === idx;
                    return (
                      <button
                        key={`${m.fund}-${m.date}-${i}`}
                        data-selected={isSelected}
                        onClick={() => handleSelect(idx)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent/15 text-accent-light'
                            : 'text-text-secondary hover:bg-bg-hover'
                        }`}
                      >
                        <div className="flex-1 text-left truncate">
                          <span className="text-text-primary">{m.fund}</span>
                          <span className="mx-1.5 text-text-muted">-</span>
                          <span className="text-text-muted">{m.lp}</span>
                        </div>
                        <span className="text-xs font-mono text-accent-light shrink-0">{m.value}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredPages.length === 0 && filteredMetrics.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-text-muted">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border text-[11px] text-text-muted">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-bg-primary border border-border rounded text-[10px]">&uarr;&darr;</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-bg-primary border border-border rounded text-[10px]">&crarr;</kbd>
                Select
              </span>
              <span className="flex items-center gap-1 ml-auto">
                <Command className="w-3 h-3" />
                <span>K to toggle</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
