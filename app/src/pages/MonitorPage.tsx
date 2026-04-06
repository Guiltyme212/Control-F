import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Database, CheckCircle2, AlertTriangle, ShieldX, Plus,
  MoreVertical, ChevronDown, ChevronRight, Eye, Sparkles, Zap, AlertCircle,
} from 'lucide-react';
import type { Page } from '../data/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { useAppContext } from '../context/AppContext';
import { LiveSearchTrackerCard } from '../components/LiveSearchTrackerCard';
import { ShineBorder } from '../components/ui/shine-border';

/* ================================================================
   Constants & Types
   ================================================================ */

const ease = [0.22, 1, 0.36, 1] as const;

type TrackerStatus = 'new-evidence' | 'metric-changed' | 'missing-target' | 'healthy' | 'paused' | 'blocked';

interface EvidenceRow {
  metric: string;
  value: string;
  source: string;
  page: string;
}

interface MonitorTracker {
  name: string;
  status: TrackerStatus;
  updated: string;
  intelligence: string;
  scopeChips: string[];
  evidence: EvidenceRow[];
  footer: string;
  updateCount?: number;
}

const DONUT_COLORS = ['#818cf8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

/* ================================================================
   Seeded data
   ================================================================ */

const trackers: MonitorTracker[] = [
  {
    name: 'PSERS private markets IRR, TVPI, DPI, and NAV',
    status: 'missing-target',
    updated: 'Today',
    intelligence: 'Found **3 of 4** requested metrics; DPI still missing in reviewed reports.',
    scopeChips: ['PSERS', 'IRR', 'TVPI', 'DPI', 'NAV', 'Private Equity', 'Infrastructure', 'Weekly'],
    evidence: [
      { metric: 'NAV', value: '26,019.9', source: 'PSERS quarterly disclosure', page: 'p.2' },
      { metric: 'IRR', value: '10.0%', source: 'PSERS quarterly disclosure', page: 'p.2' },
      { metric: 'TVPI', value: '1.5x', source: 'PSERS quarterly disclosure', page: 'p.2' },
    ],
    footer: '2 PDFs reviewed \u2022 101 rows extracted \u2022 Performance Report',
  },
  {
    name: 'Infrastructure commitments \u2014 top US pension funds',
    status: 'new-evidence',
    updated: 'Today',
    updateCount: 3,
    intelligence: 'New commitment surfaced: **$200M** to Kreos Capital VIII from NY State CRF.',
    scopeChips: ['NY State CRF', 'SDCERS', 'NJ State', 'Commitments', 'Infrastructure', 'Weekly'],
    evidence: [
      { metric: 'Commitment', value: '$200M', source: 'NY State CRF transaction report', page: 'p.4' },
      { metric: 'Commitment', value: '$150M', source: 'SDCERS board materials', page: 'p.12' },
      { metric: 'Activity', value: 'Macquarie / Ardian', source: 'NJ State memo', page: 'p.3' },
    ],
    footer: '4 sources \u2022 12 signals \u2022 Last run today',
  },
  {
    name: 'Manager terminations Q4 2025',
    status: 'new-evidence',
    updated: '2 days ago',
    updateCount: 1,
    intelligence: 'New high-impact event: T. Rowe Price termination (**~$2.0B**) surfaced in NY State CRF materials.',
    scopeChips: ['Manager terminations', 'Mandate exits', 'Public Equities', 'Daily'],
    evidence: [
      { metric: 'Termination', value: '~$2.0B', source: 'NY State CRF', page: 'p.8' },
      { metric: 'Commitment', value: '$200M', source: 'Kreos Capital VIII', page: 'p.11' },
    ],
    footer: '6 sources \u2022 3 events \u2022 Last run 2 days ago',
  },
  {
    name: 'Fee terms and fund economics',
    status: 'paused',
    updated: '12 days ago',
    intelligence: 'Ardian ASF IX memo surfaced target return, fund size, and fee/carry terms.',
    scopeChips: ['Management fee', 'Carry', 'Target return', 'Fund size', 'Monthly'],
    evidence: [
      { metric: 'Target Return', value: '12\u201314% Net IRR', source: 'NJ State memo', page: 'p.6' },
      { metric: 'Fund Size', value: '$7.5B', source: 'NJ State memo', page: 'p.6' },
      { metric: 'Carry', value: '12.5%', source: 'NJ State memo', page: 'p.7' },
    ],
    footer: '2 sources \u2022 5 extracted terms',
  },
];

const watchlistFocusData = [
  { name: 'Performance metrics', value: 34 },
  { name: 'Commitments', value: 27 },
  { name: 'Manager events', value: 16 },
  { name: 'Fund terms', value: 13 },
  { name: 'Negative-control', value: 10 },
];

const signalsOverTimeData = [
  { month: 'Nov 2025', value: 8 },
  { month: 'Dec 2025', value: 2 },
  { month: 'Jan 2026', value: 11 },
];

const recentEvidence = [
  { date: '2026-01-29', tracker: 'PSERS private markets metrics', finding: 'DPI still not found in reviewed documents; NAV, IRR, and TVPI surfaced', source: 'Performance report', confidence: 'High' },
  { date: '2026-01-27', tracker: 'Fee terms and fund economics', finding: 'Ardian ASF IX target return surfaced at 12\u201314% net IRR; target size $7.5B', source: 'NJ State memo', confidence: 'High' },
  { date: '2026-01-22', tracker: 'Private markets performance watch', finding: 'One-year IRR extracted at 8.40%; market value and unfunded commitments visible', source: 'Santa Barbara PRR', confidence: 'High' },
  { date: '2025-11-04', tracker: 'Manager terminations Q4 2025', finding: 'T. Rowe Price termination surfaced at approximately $2.0B in public equities', source: 'NY State CRF transaction report', confidence: 'High' },
  { date: '2025-11-04', tracker: 'Infra commitments \u2014 top US pension funds', finding: 'Kreos Capital VIII commitment surfaced at $200M', source: 'NY State CRF transaction report', confidence: 'High' },
];

type FilterTab = 'all' | 'new-evidence' | 'missing-target' | 'healthy' | 'paused';

/* ================================================================
   Sub-components
   ================================================================ */

function StatusPill({ status }: { status: TrackerStatus }) {
  const config: Record<TrackerStatus, { label: string; dot: string; bg: string; text: string }> = {
    'new-evidence':   { label: 'New evidence',   dot: 'bg-accent-light', bg: 'bg-accent/12 border-accent/25',      text: 'text-accent-light' },
    'metric-changed': { label: 'Metric changed', dot: 'bg-green',        bg: 'bg-green/10 border-green/25',        text: 'text-green-light' },
    'missing-target': { label: 'Missing target', dot: 'bg-amber-400',    bg: 'bg-amber-400/10 border-amber-400/25', text: 'text-amber-300' },
    'healthy':        { label: 'Healthy',         dot: 'bg-green',        bg: 'bg-green/10 border-green/25',        text: 'text-green-light' },
    'paused':         { label: 'Paused',          dot: 'bg-text-muted/40', bg: 'bg-text-muted/8 border-text-muted/20', text: 'text-text-muted' },
    'blocked':        { label: 'Blocked doc',     dot: 'bg-red',          bg: 'bg-red/10 border-red/25',            text: 'text-red' },
  };
  const c = config[status];
  const pulsing = status === 'new-evidence' || status === 'missing-target';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {pulsing ? (
        <motion.div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
      ) : (
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      )}
      {c.label}
    </span>
  );
}

function IntelligenceLine({ text }: { text: string }) {
  // Render **bold** segments
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-[13px] text-text-secondary leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <span key={i} className="text-text-primary font-semibold">{part.slice(2, -2)}</span>
          : <span key={i}>{part}</span>
      )}
    </p>
  );
}

function TrackerCard({ tracker, index }: { tracker: MonitorTracker; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isPaused = tracker.status === 'paused';
  const hasUpdates = tracker.updateCount && tracker.updateCount > 0;
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + index * 0.06, duration: 0.45, ease }}
      className={`group relative overflow-hidden transition-all cursor-pointer ${
        isPaused
          ? 'rounded-xl border border-border/30 bg-bg-card/40'
          : 'rounded-xl border border-border/50 bg-bg-card/80 hover:border-accent/20'
      }`}
      style={{ boxShadow: isPaused ? 'none' : '0 4px 24px rgba(5,10,20,0.2)' }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Subtle hover glow */}
      {!isPaused && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 10% 50%, rgba(99,102,241,0.04) 0%, transparent 70%)' }}
        />
      )}

      <div className="relative">
        {/* ---- Row 1: Header ---- */}
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-1.5">
          {/* Expand chevron */}
          <div className="shrink-0 text-text-muted/40">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {/* Tracker name */}
          <h3 className={`text-[13px] font-semibold leading-tight flex-1 min-w-0 truncate ${isPaused ? 'text-text-muted/50' : 'text-text-primary'}`}>
            {tracker.name}
          </h3>

          {/* Right: status + updated + menu */}
          <div className="flex items-center gap-2.5 shrink-0">
            <StatusPill status={tracker.status} />
            <span className="text-[10px] text-text-muted/50 whitespace-nowrap">{tracker.updated}</span>
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-text-muted/30 hover:text-text-secondary hover:bg-bg-hover/60 transition-colors cursor-pointer"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ---- Row 2: Intelligence line ---- */}
        <div className="px-4 pb-1.5 pl-[2.75rem]">
          <IntelligenceLine text={tracker.intelligence} />
        </div>

        {/* ---- Row 3: Scope chips ---- */}
        <div className="px-4 pb-1.5 pl-[2.75rem] flex flex-wrap gap-1">
          {tracker.scopeChips.map(chip => (
            <span
              key={chip}
              className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                isPaused ? 'bg-bg-hover/30 text-text-muted/30' : 'bg-bg-hover/60 text-text-muted/80'
              }`}
            >
              {chip}
            </span>
          ))}
        </div>

        {/* ---- Expanded: evidence + actions ---- */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              className="overflow-hidden"
            >
              {/* Evidence rows */}
              {!isPaused && tracker.evidence.length > 0 && (
                <div className="px-4 pb-2 pl-[2.75rem]">
                  <div className="rounded-lg border border-border/30 bg-bg-primary/40 overflow-hidden">
                    {tracker.evidence.map((ev, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-1.5 text-[11px] ${i > 0 ? 'border-t border-border/20' : ''}`}>
                        <span className="text-text-primary font-semibold w-[90px] shrink-0 truncate">{ev.metric}</span>
                        <span className="text-accent-light font-medium w-[100px] shrink-0">{ev.value}</span>
                        <span className="text-text-muted truncate flex-1">{ev.source}</span>
                        <span className="text-text-muted/50 shrink-0">{ev.page}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="px-4 pb-2 pl-[2.75rem] flex items-center gap-2">
                {hasUpdates ? (
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent-light hover:bg-accent/15 transition-colors cursor-pointer">
                    <Eye className="w-3 h-3" />
                    View {tracker.updateCount} update{tracker.updateCount === 1 ? '' : 's'}
                  </button>
                ) : (
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent-light hover:bg-accent/15 transition-colors cursor-pointer">
                    <Eye className="w-3 h-3" />
                    Review updates
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Row 5: Footer ---- */}
        <div className={`flex items-center gap-1.5 text-[10px] px-4 py-1.5 pl-[2.75rem] border-t ${isPaused ? 'border-border/15 text-text-muted/25' : 'border-border/30 text-text-muted/40'}`}>
          <Database className="w-3 h-3" />
          <span>{tracker.footer}</span>
        </div>
      </div>
    </motion.div>
  );

  return card;
}

function PulseCard({ label, value, subtext, icon: Icon, delay, accent }: {
  label: string; value: string | number; subtext: string; icon: React.ElementType; delay: number; accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.6, ease }}
      whileHover={{ y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
      className="stat-card"
    >
      <div className="stat-card-inner">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</span>
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent || 'bg-accent/10 border border-accent/20'}`}>
            <Icon className="w-3 h-3 text-accent-light" />
          </div>
        </div>
        <p className="stat-value text-2xl font-bold tracking-tight leading-none mb-1">{value}</p>
        <p className="text-[10px] text-text-muted leading-relaxed">{subtext}</p>
      </div>
    </motion.div>
  );
}

function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{payload[0].value}{suffix || ''}</p>
    </div>
  );
}

/* ================================================================
   Main Monitor Page
   ================================================================ */

interface MonitorPageProps {
  onNavigate: (page: Page) => void;
  trackerArrivalInProgress?: boolean;
}

export function MonitorPage({ onNavigate, trackerArrivalInProgress = false }: MonitorPageProps) {
  const { liveTracker } = useAppContext();
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered = trackers.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'new-evidence') return t.status === 'new-evidence' || t.status === 'metric-changed';
    if (filter === 'missing-target') return t.status === 'missing-target';
    if (filter === 'healthy') return t.status === 'healthy';
    if (filter === 'paused') return t.status === 'paused';
    return true;
  });

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: trackers.length },
    { key: 'new-evidence', label: 'New evidence', count: trackers.filter(t => t.status === 'new-evidence' || t.status === 'metric-changed').length },
    { key: 'missing-target', label: 'Missing target', count: trackers.filter(t => t.status === 'missing-target').length },
    { key: 'paused', label: 'Paused', count: trackers.filter(t => t.status === 'paused').length },
  ];

  // Counters
  const newEvidenceCount = trackers.filter(t => t.status === 'new-evidence' || t.status === 'metric-changed').length;
  const metricUpdates = trackers.reduce((n, t) => n + (t.updateCount || 0), 0) + 4; // +4 from PSERS found metrics
  const needsAttention = trackers.filter(t => t.status === 'missing-target').length;
  const blockedDocs = 3;

  return (
    <div className="flex-1 p-6 overflow-auto relative">
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 20% 10%, rgba(99,102,241,0.04) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(139,92,246,0.025) 0%, transparent 70%)
          `,
        }}
      />

      <div className="relative z-10 max-w-[1100px] mx-auto">

        {/* ---- Top strip ---- */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="flex items-center justify-between mb-5"
        >
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Monitor</h1>
            <p className="text-[12px] text-text-muted mt-0.5">Evidence-backed updates from your saved trackers</p>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-2 text-[12px] font-semibold text-accent-light transition-colors hover:bg-accent/15 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            New Tracker
          </button>
        </motion.div>

        {/* ---- Summary pulse cards ---- */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <PulseCard
            label="Trackers with new evidence"
            value={newEvidenceCount}
            subtext="New signals or updated metrics in the last 7 days"
            icon={FileText}
            delay={0.05}
          />
          <PulseCard
            label="New metric updates"
            value={metricUpdates}
            subtext="Across PSERS, NY State CRF, Santa Barbara, and NJ State"
            icon={CheckCircle2}
            delay={0.1}
            accent="bg-green/10 border border-green/20"
          />
          <PulseCard
            label="Needs attention"
            value={needsAttention}
            subtext="Missing target metrics or low-confidence matches"
            icon={AlertTriangle}
            delay={0.15}
            accent="bg-amber-400/10 border border-amber-400/20"
          />
          <PulseCard
            label="Off-target docs blocked"
            value={blockedDocs}
            subtext="Caught before full extraction or flagged low-confidence"
            icon={ShieldX}
            delay={0.2}
            accent="bg-red/10 border border-red/20"
          />
        </div>

        {/* ---- Active Trackers (hero section) ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease }}
          className="mb-6"
        >
          <ShineBorder borderWidth={1.5} duration={6} gradient="from-indigo-500 via-purple-500 to-emerald-400">
            <div className="p-4">
              {/* Section header + filters */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-bold text-text-primary">Active Trackers</h2>
                <div className="flex items-center gap-1">
                  {filterTabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFilter(tab.key)}
                      className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                        filter === tab.key
                          ? 'bg-accent/15 text-accent-light border border-accent/25'
                          : 'text-text-muted hover:text-text-secondary border border-transparent'
                      }`}
                    >
                      {tab.label}
                      {tab.count !== undefined && <span className="ml-1 opacity-50">{tab.count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live tracker if running */}
              {liveTracker && (
                <div
                  data-live-tracker-slot="true"
                  className={`mb-2.5 transition-opacity duration-150 ${
                    trackerArrivalInProgress ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  <ShineBorder borderWidth={1.5} duration={4} gradient="from-amber-400 via-orange-500 to-yellow-300">
                    <LiveSearchTrackerCard onNavigate={onNavigate} />
                  </ShineBorder>
                </div>
              )}

              {/* Tracker cards */}
              <div className="flex flex-col gap-2">
                {filtered.map((tracker, i) => (
                  <TrackerCard key={tracker.name} tracker={tracker} index={i} />
                ))}
              </div>
            </div>
          </ShineBorder>
        </motion.div>

        {/* ---- Charts ---- */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Donut: Current watchlist focus */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6, ease }}
            className="chart-card"
          >
            <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)' }} />
              Current watchlist focus
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={watchlistFocusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={500}
                  animationDuration={1000}
                  label={({ name, value }) => `${name} ${value}%`}
                >
                  {watchlistFocusData.map((_entry, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
                        <p className="text-xs text-text-muted">{d.name}</p>
                        <p className="text-sm font-semibold text-text-primary">{d.value}%</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-text-muted leading-relaxed mt-2 px-1">
              Your current tracker mix is weighted toward performance monitoring and commitment activity.
            </p>
          </motion.div>

          {/* Bar: Signals Over Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6, ease }}
            className="chart-card"
          >
            <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)' }} />
              New signals over time
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={signalsOverTimeData}>
                <defs>
                  <linearGradient id="barGradientV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2b38" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip suffix=" signals" />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="value" fill="url(#barGradientV)" radius={[4, 4, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-2 mt-3 px-2.5 py-2 rounded-lg bg-accent-glow border border-accent/20 text-accent-light">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <p className="text-xs">
                Signal activity increased as new recommendation packets and tracker-relevant reports were added to the watchlist.
              </p>
            </div>
          </motion.div>
        </div>

        {/* ---- Watchlist Takeaway ---- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease }}
          className="relative rounded-xl border-l-2 border-border/40 bg-bg-card/50 px-5 py-3.5 mb-5 overflow-hidden"
          style={{ borderLeftColor: '#8b5cf6' }}
        >
          <div style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.05) 0%, transparent 60%)', position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple" />
              <span className="text-[10px] font-semibold text-purple uppercase tracking-[0.08em]">Watchlist Takeaway</span>
            </div>
            <p className="text-[12px] text-text-primary leading-relaxed">
              Your trackers are generating the cleanest intelligence from transaction reports, performance updates,
              and memo-style recommendation documents. Board minutes continue to produce low-value results
              for performance-specific queries.
            </p>
          </div>
        </motion.div>

        {/* ---- Recent Tracker Evidence ---- */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5, ease }}
          className="rounded-xl border border-border/40 bg-bg-card/60 p-4 mb-5"
        >
          <h3 className="text-[12px] font-semibold text-text-secondary mb-3 flex items-center gap-2">
            <span className="w-1 h-3.5 rounded-full bg-accent" />
            Recent tracker evidence
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/50 pr-3 whitespace-nowrap">Date</th>
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/50 pr-3">Tracker</th>
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/50 pr-3">Finding</th>
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/50 pr-3">Source</th>
                  <th className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/50">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recentEvidence.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.04, duration: 0.35, ease }}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="py-2 pr-3 text-[11px] text-text-muted font-mono whitespace-nowrap">{row.date}</td>
                    <td className="py-2 pr-3 text-[11px] text-accent-light/80 font-medium whitespace-nowrap max-w-[160px] truncate">{row.tracker}</td>
                    <td className="py-2 pr-3 text-[11px] text-text-secondary leading-relaxed">{row.finding}</td>
                    <td className="py-2 pr-3 text-[11px] text-text-muted whitespace-nowrap">{row.source}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-light">
                        <CheckCircle2 className="w-3 h-3" />
                        {row.confidence}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ---- Pipeline Benchmark Footer ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4, ease }}
          className="rounded-xl border border-border/30 bg-bg-card/30 px-4 py-3 flex items-center gap-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-green/10 border border-green/20 flex items-center justify-center">
              <AlertCircle className="w-3 h-3 text-green-light" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-text-primary">Pipeline benchmark</span>
              <span className="text-[11px] text-text-muted ml-2">5 / 5 cases passing</span>
            </div>
          </div>
          <div className="h-4 w-px bg-border/30" />
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span>Avg cost ~$0.08</span>
            <span className="text-border/50">&middot;</span>
            <span>Early reject active</span>
            <span className="text-border/50">&middot;</span>
            <span>Negative-control: <span className="text-green-light font-medium">rejected correctly</span></span>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
