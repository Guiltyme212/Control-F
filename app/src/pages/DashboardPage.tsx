import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, FileText, Zap, Sparkles, Clock, Database,
  CheckCircle2, Eye, AlertCircle, ShieldX, Plus,
  Play, Pause, Pencil, RotateCw, SlidersHorizontal,
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

type TrackerState = 'needs-review' | 'healthy' | 'partial' | 'paused';

interface DashboardTracker {
  name: string;
  state: TrackerState;
  freshness: string;
  change: string;
  watches: string;
  controls: string;
  footer: string;
  actionChips: string[];
}

const DONUT_COLORS = ['#818cf8', '#6366f1', '#8b5cf6', '#a78bfa', '#4f46e5'];

/* ================================================================
   Seeded data
   ================================================================ */

const dashboardTrackers: DashboardTracker[] = [
  {
    name: 'PSERS private markets IRR, TVPI, DPI, and NAV',
    state: 'needs-review',
    freshness: 'Updated today',
    change: 'Found 3 of 4 requested metrics in the latest reviewed report; DPI still not found in reviewed documents.',
    watches: 'PSERS • IRR, TVPI, DPI, NAV • Private Equity, Infrastructure, Credit, Real Estate',
    controls: 'Weekly • Performance reports only • Medium alert sensitivity',
    footer: '2 PDFs reviewed • 101 rows extracted • Performance Report',
    actionChips: ['Edit query', 'Edit scope', 'Run now', 'Pause'],
  },
  {
    name: 'Infrastructure commitments — top US pension funds',
    state: 'healthy',
    freshness: '3 new signals',
    change: 'Macquarie, Ardian, and related infrastructure activity surfaced across board and memo-style documents.',
    watches: 'NY State CRF, SDCERS, NJ State • Commitments • Infrastructure / Real Assets',
    controls: 'Weekly • Board agendas + memos • High sensitivity',
    footer: '4 sources • 12 signals • Last run today',
    actionChips: ['Edit query', 'Edit scope', 'Run now', 'Pause'],
  },
  {
    name: 'Manager terminations Q4 2025',
    state: 'healthy',
    freshness: '1 new event',
    change: 'NY State CRF termination activity remains the most material governance-driven capital movement in the current sample.',
    watches: 'Manager terminations • Mandate exits • Public Equities / Alternatives rotation',
    controls: 'Daily • Transaction reports + board docs • High sensitivity',
    footer: '6 sources • 3 events • Last run 2 days ago',
    actionChips: ['Edit query', 'Edit scope', 'Run now', 'Pause'],
  },
  {
    name: 'Fee terms and fund economics',
    state: 'paused',
    freshness: 'Paused 12 days ago',
    change: 'Ardian ASF IX remains the clearest memo example for target return, fund size, and fee/carry extraction.',
    watches: 'Management fee • Carry • Target return • Fund size',
    controls: 'Monthly • Investment memos only • Medium sensitivity',
    footer: '2 sources • 5 extracted terms',
    actionChips: ['Edit query', 'Edit scope', 'Resume', 'Run now'],
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

const evidenceRows = [
  { date: '2026-01-29', tracker: 'PSERS private markets metrics', finding: 'DPI still not found in reviewed documents; NAV, IRR, and TVPI surfaced', source: 'Performance report', confidence: 'High' },
  { date: '2026-01-27', tracker: 'Fee terms and fund economics', finding: 'Ardian ASF IX target return surfaced at 12–14% net IRR; target size $7.5B', source: 'NJ State memo', confidence: 'High' },
  { date: '2026-01-22', tracker: 'Private markets performance watch', finding: 'One-year IRR extracted at 8.40%; market value and unfunded commitments visible', source: 'Santa Barbara PRR', confidence: 'High' },
  { date: '2025-11-04', tracker: 'Manager terminations Q4 2025', finding: 'T. Rowe Price termination surfaced at approximately $2.0B in public equities', source: 'NY State CRF transaction report', confidence: 'High' },
  { date: '2025-11-04', tracker: 'Infra commitments — top US pension funds', finding: 'Kreos Capital VIII commitment surfaced at $200M', source: 'NY State CRF transaction report', confidence: 'High' },
];

type FilterTab = 'all' | 'needs-review' | 'healthy' | 'paused';

/* ================================================================
   Sub-components
   ================================================================ */

function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{payload[0].value}{suffix || ''}</p>
    </div>
  );
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

function StateIndicator({ state }: { state: TrackerState }) {
  const config: Record<TrackerState, { label: string; dot: string; bg: string; text: string }> = {
    'needs-review': { label: 'Needs review', dot: 'bg-amber-400', bg: 'bg-amber-400/10 border-amber-400/25', text: 'text-amber-300' },
    'healthy': { label: 'Healthy', dot: 'bg-green', bg: 'bg-green/10 border-green/25', text: 'text-green-light' },
    'partial': { label: 'Partial', dot: 'bg-blue', bg: 'bg-blue/10 border-blue/25', text: 'text-blue' },
    'paused': { label: 'Paused', dot: 'bg-text-muted/40', bg: 'bg-text-muted/8 border-text-muted/20', text: 'text-text-muted' },
  };
  const c = config[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {state === 'needs-review' ? (
        <motion.div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
      ) : (
        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      )}
      {c.label}
    </span>
  );
}

function TrackerHeroCard({ tracker, index }: { tracker: DashboardTracker; index: number }) {
  const isNeedsReview = tracker.state === 'needs-review';
  const isPaused = tracker.state === 'paused';
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + index * 0.08, duration: 0.55, ease }}
      className={`group relative overflow-hidden transition-all ${
        isNeedsReview
          ? 'rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.04] to-bg-card/95 shadow-[0_20px_60px_rgba(5,10,20,0.28)]'
          : isPaused
            ? 'rounded-2xl border border-border/40 bg-bg-card/50 shadow-[0_12px_40px_rgba(5,10,20,0.18)]'
            : 'rounded-2xl border border-border/60 bg-bg-card/90 shadow-[0_20px_60px_rgba(5,10,20,0.24)] hover:border-accent/20'
      }`}
    >
      {/* Hover glow */}
      {!isPaused && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ background: isNeedsReview
            ? 'radial-gradient(ellipse at 20% 0%, rgba(251,191,36,0.06) 0%, transparent 60%)'
            : 'radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.05) 0%, transparent 60%)'
          }}
        />
      )}

      <div className="relative px-5 py-4">
        {/* Row 1: Name + State + Freshness */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1 mr-4">
            <h3 className={`text-[15px] font-semibold leading-snug ${isPaused ? 'text-text-muted' : 'text-text-primary'}`}>
              {tracker.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StateIndicator state={tracker.state} />
            <span className="text-[10px] text-text-muted/60 whitespace-nowrap">{tracker.freshness}</span>
          </div>
        </div>

        {/* Row 2: What changed */}
        <div className="mb-3">
          <p className={`text-[13px] leading-relaxed ${isPaused ? 'text-text-muted/50' : 'text-text-secondary'}`}>
            {tracker.change}
          </p>
        </div>

        {/* Row 3: What it watches */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-text-muted/50 font-semibold mb-1">Watches</p>
          <p className={`text-[11px] leading-relaxed ${isPaused ? 'text-text-muted/40' : 'text-text-muted'}`}>
            {tracker.watches}
          </p>
        </div>

        {/* Row 4: Controls info */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-[0.06em] text-text-muted/50 font-semibold mb-1">Controls</p>
          <p className={`text-[11px] ${isPaused ? 'text-text-muted/40' : 'text-text-muted'}`}>
            {tracker.controls}
          </p>
        </div>

        {/* Row 5: Action chips */}
        <div className="flex items-center gap-1.5 mb-3">
          {tracker.actionChips.map(chip => {
            const iconMap: Record<string, React.ElementType> = {
              'Edit query': Pencil, 'Edit scope': SlidersHorizontal,
              'Run now': Play, 'Pause': Pause, 'Resume': RotateCw,
            };
            const ChipIcon = iconMap[chip] || Pencil;
            return (
              <button
                key={chip}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                  isPaused
                    ? 'border border-border/40 bg-bg-hover/30 text-text-muted/50'
                    : chip === 'Run now'
                      ? 'border border-accent/25 bg-accent/10 text-accent-light hover:bg-accent/15'
                      : 'border border-border/50 bg-bg-hover/50 text-text-muted hover:text-text-secondary hover:border-border'
                }`}
              >
                <ChipIcon className="w-2.5 h-2.5" />
                {chip}
              </button>
            );
          })}
        </div>

        {/* Row 6: Mini footer */}
        <div className={`flex items-center gap-1.5 text-[10px] pt-2.5 border-t ${isPaused ? 'border-border/20 text-text-muted/30' : 'border-border/40 text-text-muted/50'}`}>
          <Database className="w-3 h-3" />
          <span>{tracker.footer}</span>
        </div>
      </div>
    </motion.div>
  );

  return card;
}

function DonutLabel({ viewBox, total }: { viewBox?: { cx: number; cy: number }; total: string }) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} y={cy - 6} className="fill-text-primary text-lg font-bold">{total}</tspan>
      <tspan x={cx} y={cy + 12} className="fill-text-muted text-[10px]">focus mix</tspan>
    </text>
  );
}

/* ================================================================
   Main Dashboard
   ================================================================ */

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { liveTracker } = useAppContext();
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered = dashboardTrackers.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'needs-review') return t.state === 'needs-review';
    if (filter === 'healthy') return t.state === 'healthy';
    if (filter === 'paused') return t.state === 'paused';
    return true;
  });

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: dashboardTrackers.length },
    { key: 'needs-review', label: 'Needs review', count: dashboardTrackers.filter(t => t.state === 'needs-review').length },
    { key: 'healthy', label: 'Healthy', count: dashboardTrackers.filter(t => t.state === 'healthy').length },
    { key: 'paused', label: 'Paused', count: dashboardTrackers.filter(t => t.state === 'paused').length },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto relative">
      {/* Ambient page glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 20% 10%, rgba(99,102,241,0.05) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(139,92,246,0.03) 0%, transparent 70%)
          `,
        }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto">

        {/* ---- 1. Watchlist Pulse Cards ---- */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <PulseCard
            label="Trackers needing review"
            value={2}
            subtext="New signals or partial answers in the last 7 days"
            icon={Eye}
            delay={0.05}
            accent="bg-amber-400/10 border border-amber-400/20"
          />
          <PulseCard
            label="New documents detected"
            value={11}
            subtext="Across PSERS, NY State CRF, Santa Barbara, and NJ State"
            icon={FileText}
            delay={0.1}
          />
          <PulseCard
            label="High-confidence extractions"
            value={23}
            subtext="New metrics surfaced with strong evidence"
            icon={CheckCircle2}
            delay={0.15}
            accent="bg-green/10 border border-green/20"
          />
          <PulseCard
            label="Weak / rejected documents"
            value={3}
            subtext="Caught before full extraction or flagged low-confidence"
            icon={ShieldX}
            delay={0.2}
            accent="bg-red/10 border border-red/20"
          />
        </div>

        {/* ---- 2. Active Trackers — Hero Section ---- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease }}
          className="mb-6"
        >
          <ShineBorder
            borderWidth={2}
            duration={5}
            gradient="from-indigo-500 via-purple-500 to-emerald-400"
          >
            {/* Tracker section inner */}
            <div className="p-5">
            {/* Section header */}
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)' }} />
                  Active Trackers
                </h2>
                <p className="text-[11px] text-text-muted mt-1 ml-3">
                  Monitor new documents, metric changes, and off-target reports across your watchlist.
                </p>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent-light transition-colors hover:bg-accent/15 cursor-pointer shrink-0">
                <Plus className="w-3 h-3" />
                New Tracker
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-4 ml-3">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
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

            {/* Live tracker if running */}
            {liveTracker && (
              <div className="mb-3">
                <ShineBorder
                  borderWidth={1.5}
                  duration={4}
                  gradient="from-amber-400 via-orange-500 to-yellow-300"
                >
                  <LiveSearchTrackerCard onNavigate={onNavigate} />
                </ShineBorder>
              </div>
            )}

            {/* Tracker cards */}
            <div className="flex flex-col gap-3">
              {filtered.map((tracker, i) => (
                <TrackerHeroCard key={tracker.name} tracker={tracker} index={i} />
              ))}
            </div>
          </div>
          </ShineBorder>
        </motion.div>

        {/* ---- 3. Watchlist Takeaway ---- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease }}
          className="insight-card mb-6"
          style={{ borderLeftColor: '#8b5cf6' }}
        >
          <div style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.06) 0%, transparent 60%)', position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-purple" />
              <span className="text-[11px] font-semibold text-purple uppercase tracking-[0.08em]">Watchlist Takeaway</span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed">
              Your watchlist is currently generating the cleanest intelligence from transaction reports, performance updates,
              and memo-style recommendation documents. Noisy board minutes continue to generate low-value or rejectable results
              for performance-specific searches.
            </p>
          </div>
        </motion.div>

        {/* ---- 4. Charts ---- */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Donut: Watchlist Focus */}
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

        {/* ---- 5. Recent Tracker Evidence ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.6, ease }}
          className="chart-card mb-6"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)' }} />
            Recent tracker evidence
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/60 pr-3 whitespace-nowrap">Date</th>
                  <th className="pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/60 pr-3">Tracker</th>
                  <th className="pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/60 pr-3">Finding</th>
                  <th className="pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/60 pr-3">Source</th>
                  <th className="pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted/60">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {evidenceRows.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.05, duration: 0.4, ease }}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="py-2.5 pr-3 text-[11px] text-text-muted font-mono whitespace-nowrap">{row.date}</td>
                    <td className="py-2.5 pr-3 text-[11px] text-accent-light/80 font-medium whitespace-nowrap max-w-[180px] truncate">{row.tracker}</td>
                    <td className="py-2.5 pr-3 text-xs text-text-secondary leading-relaxed">{row.finding}</td>
                    <td className="py-2.5 pr-3 text-[11px] text-text-muted whitespace-nowrap">{row.source}</td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-light">
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

        {/* ---- 6. Pipeline Benchmark Footer ---- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5, ease }}
          className="rounded-xl border border-border/40 bg-bg-card/40 px-5 py-3.5 flex items-center gap-4"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-green/10 border border-green/20 flex items-center justify-center">
              <AlertCircle className="w-3 h-3 text-green-light" />
            </div>
            <div>
              <span className="text-xs font-semibold text-text-primary">Pipeline benchmark</span>
              <span className="text-xs text-text-muted ml-2">5 / 5 cases passing</span>
            </div>
          </div>
          <div className="h-4 w-px bg-border/40" />
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span>Avg cost ~$0.08</span>
            <span className="text-border/60">&middot;</span>
            <span>Early reject active on corporate false positives</span>
            <span className="text-border/60">&middot;</span>
            <span>Latest negative-control: <span className="text-green-light font-medium">rejected correctly</span></span>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
