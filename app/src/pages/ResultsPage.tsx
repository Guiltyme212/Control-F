import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Filter, Download, Bookmark, ChevronDown, ChevronUp, FileText, TrendingUp, AlertTriangle, Zap, DollarSign, BarChart3, ArrowUpDown } from 'lucide-react';
import { metrics, signals } from '../data/metrics';
import { useCountUp } from '../hooks/useCountUp';
import type { Metric } from '../data/types';

const metricTypes = ['All', 'Commitment', 'Termination', 'Performance', 'Fee Structure', 'AUM', 'NAV', 'Co-Investment', 'Target Fund Size'];
const assetClasses = ['All', 'Infrastructure', 'Real Assets', 'Private Equity', 'Credit', 'Public Equities', 'Natural Resources', 'Total Fund'];

const metricColors: Record<string, string> = {
  'Commitment': 'bg-green/20 text-green-light',
  'Termination': 'bg-red/20 text-red',
  'Performance': 'bg-blue/20 text-blue',
  'Co-Investment': 'bg-cyan/20 text-cyan',
  'Fee Structure': 'bg-yellow/20 text-yellow',
  'AUM': 'bg-purple/20 text-purple',
  'NAV': 'bg-purple/20 text-purple',
  'Target Fund Size': 'bg-orange/20 text-orange',
};

const signalIcons: Record<string, React.ElementType> = {
  'Multi-LP Signal': Zap,
  'Large Termination': AlertTriangle,
  'New High': TrendingUp,
  'Infrastructure Secondaries': BarChart3,
};

const signalColors: Record<string, string> = {
  'Multi-LP Signal': 'border-l-accent-light',
  'Large Termination': 'border-l-red',
  'New High': 'border-l-green',
  'Infrastructure Secondaries': 'border-l-cyan',
};

type SortField = 'date' | 'lp' | 'fund' | 'gp' | 'metric' | 'value' | 'asset_class';
type SortDir = 'asc' | 'desc';

function highlightEvidence(evidence: string, value: string): React.ReactNode {
  // Try to find a meaningful substring of the value in the evidence
  const candidates: string[] = [];

  // Try the full value first (e.g., "$243,545,000")
  candidates.push(value);

  // Extract the leading dollar/euro amount (e.g., "$2 billion", "$150 million", "$7.5M")
  const numMatch = value.match(/^[\$€]?([\d,.]+)/);
  if (numMatch) {
    const rawNum = numMatch[1].replace(/,/g, '');
    const num = parseFloat(rawNum);
    // Try common written forms
    if (num >= 1_000_000_000) candidates.push(`$${num / 1_000_000_000} billion`);
    if (num >= 1_000_000) candidates.push(`$${num / 1_000_000}M`, `$${num / 1_000_000} million`);
    candidates.push(numMatch[0]); // e.g. "$243,545,000" or "€250,000,000"
  }

  // Try percentage values (e.g., "16.7%", "59.6%")
  const pctMatch = value.match(/([\d.]+%)/);
  if (pctMatch) candidates.push(pctMatch[1]);

  for (const candidate of candidates) {
    const idx = evidence.toLowerCase().indexOf(candidate.toLowerCase());
    if (idx !== -1) {
      const before = evidence.slice(0, idx);
      const match = evidence.slice(idx, idx + candidate.length);
      const after = evidence.slice(idx + candidate.length);
      return (
        <>
          {before}<span className="font-bold text-accent-light not-italic">{match}</span>{after}
        </>
      );
    }
  }

  return evidence;
}

export function ResultsPage() {
  const [metricFilter, setMetricFilter] = useState('All');
  const [assetFilter, setAssetFilter] = useState('All');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const metricsCount = useCountUp(31, 1200);
  const commitmentsCount = useCountUp(12, 1200);
  const signalsCount = useCountUp(4, 1000);
  const fundsCount = useCountUp(4, 800);

  const filtered = useMemo(() => {
    let result = [...metrics];
    if (metricFilter !== 'All') result = result.filter(m => m.metric === metricFilter);
    if (assetFilter !== 'All') result = result.filter(m => m.asset_class === assetFilter);
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [metricFilter, assetFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="inline-flex ml-1">
      {sortField === field ? (
        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </span>
  );

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Alert Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 p-4 rounded-xl bg-gradient-to-r from-accent-glow to-transparent border border-accent/20 flex items-center gap-3"
      >
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Bell className="w-5 h-5 text-accent-light" />
        </motion.div>
        <p className="text-sm text-text-primary">
          <span className="font-semibold">Change detected</span> — DCRB total fund value reached new high of <span className="text-accent-light font-semibold">$14.1B</span> (up from $13.2B). Calendar year 2025 net return: 14.1%
        </p>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { value: metricsCount, label: 'metrics extracted', sub: 'from 4 documents', icon: FileText },
          { value: commitmentsCount, label: 'commitments found', sub: '~$1.8B total', icon: DollarSign },
          { value: signalsCount, label: 'intelligence signals', sub: 'actionable insights', icon: Zap },
          { value: fundsCount, label: 'pension funds scanned', sub: 'US public funds', icon: BarChart3 },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-accent-light" />
              <span className="text-3xl font-bold text-text-primary">{stat.value}</span>
            </div>
            <p className="text-sm text-text-secondary">{stat.label}</p>
            <p className="text-xs text-text-muted mt-0.5">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Intelligence Signals */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Intelligence Signals</h3>
        <div className="grid grid-cols-2 gap-3">
          {signals.map((signal, i) => {
            const Icon = signalIcons[signal.type] || Zap;
            return (
              <motion.div
                key={signal.type}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`bg-bg-card border border-border rounded-xl p-4 border-l-4 ${signalColors[signal.type] || 'border-l-accent'}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-text-secondary" />
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{signal.type}</span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{signal.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-text-muted" />
        <div className="relative">
          <select
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none pr-8 cursor-pointer"
          >
            {metricTypes.map(t => <option key={t} value={t}>{t === 'All' ? 'All Metrics' : t}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none pr-8 cursor-pointer"
          >
            {assetClasses.map(t => <option key={t} value={t}>{t === 'All' ? 'All Asset Classes' : t}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={filtered.length}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-text-muted ml-2"
          >
            Showing {filtered.length} of {metrics.length} metrics
          </motion.span>
        </AnimatePresence>
        <div className="ml-auto flex gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-all flex items-center gap-1.5 cursor-pointer">
            <Bookmark className="w-3.5 h-3.5" /> Save Search
          </button>
          <button className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-all flex items-center gap-1.5 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {([
                ['date', 'Date'],
                ['lp', 'LP'],
                ['fund', 'Fund'],
                ['gp', 'GP/Manager'],
                ['metric', 'Metric'],
                ['value', 'Value'],
                ['asset_class', 'Asset Class'],
              ] as [SortField, string][]).map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => toggleSort(field)}
                  className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors"
                >
                  {label}
                  <SortIcon field={field} />
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Src</th>
              <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Pg</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m: Metric, i: number) => (
              <TableRow
                key={`${m.fund}-${m.date}-${i}`}
                metric={m}
                index={i}
                isExpanded={expandedRow === i}
                onToggle={() => setExpandedRow(expandedRow === i ? null : i)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({ metric: m, index, isExpanded, onToggle }: {
  metric: Metric;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.03, 0.6) }}
        onClick={onToggle}
        className={`border-b border-border/50 cursor-pointer transition-colors ${
          isExpanded ? 'bg-bg-hover' : 'hover:bg-bg-hover/50'
        }`}
      >
        <td className="px-4 py-3 text-text-muted whitespace-nowrap">{m.date}</td>
        <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">{m.lp}</td>
        <td className="px-4 py-3 text-text-primary max-w-48 truncate">{m.fund}</td>
        <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{m.gp}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${metricColors[m.metric] || 'bg-bg-hover text-text-secondary'}`}>
            {m.metric}
          </span>
        </td>
        <td className="px-4 py-3 text-text-primary font-mono text-xs whitespace-nowrap">{m.value}</td>
        <td className="px-4 py-3 text-text-secondary text-xs">{m.asset_class}</td>
        <td className="px-4 py-3 text-text-muted text-xs max-w-24 truncate">{m.source}</td>
        <td className="px-4 py-3 text-text-muted text-xs">{m.page}</td>
      </motion.tr>
      <AnimatePresence>
        {isExpanded && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <td colSpan={9} className="px-0 py-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-6 py-5 bg-bg-tertiary border-b border-border"
              >
                <div className="flex gap-8">
                  <div className="space-y-2 min-w-64">
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Metadata</h4>
                    {[
                      ['LP', m.lp],
                      ['Fund', m.fund],
                      ['GP/Manager', m.gp],
                      ['Strategy', m.asset_class],
                      ['Currency', m.value.startsWith('\u20AC') ? 'EUR' : 'USD'],
                      ['Page', String(m.page)],
                      ['Confidence', m.confidence],
                    ].map(([label, val]) => (
                      <div key={label} className="flex text-sm">
                        <span className="text-text-muted w-24 shrink-0">{label}</span>
                        <span className="text-text-primary">{val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Source Evidence</h4>
                    <blockquote className="border-l-2 border-accent/40 pl-4 py-2 bg-bg-card rounded-r-lg">
                      <p className="text-sm text-text-secondary leading-relaxed italic">
                        "{highlightEvidence(m.evidence, m.value)}"
                      </p>
                    </blockquote>
                    <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      {m.source} — Page {m.page}
                    </p>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}
