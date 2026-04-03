import { motion } from 'framer-motion';
import {
  TrendingDown, TrendingUp, Bell, Activity, FileText, Zap,
  DollarSign, AlertTriangle, Sparkles, Building2, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useAppContext } from '../context/AppContext';
import { useCountUp } from '../hooks/useCountUp';

/* ================================================================
   Static chart data (derived from metrics.ts canonical data)
   ================================================================ */

const commitmentsByAsset = [
  { name: 'Infrastructure', value: 1131, fill: '#6366f1' },
  { name: 'Credit', value: 200, fill: '#3b82f6' },
  { name: 'Private Equity', value: 113, fill: '#8b5cf6' },
  { name: 'Natural Resources', value: 108, fill: '#f97316' },
  { name: 'Real Assets', value: 324, fill: '#06b6d4' },
];

const commitmentsByMonth = [
  { month: 'Apr 2025', value: 8 },
  { month: 'Oct 2025', value: 15 },
  { month: 'Nov 2025', value: 1087 },
  { month: 'Dec 2025', value: 100 },
  { month: 'Jan 2026', value: 450 },
];

const topGPs = [
  { name: 'CVC DIF Mgmt', value: 540 },
  { name: 'Stonepeak', value: 324 },
  { name: 'Ardian', value: 300 },
  { name: 'BlackRock/Kreos', value: 200 },
  { name: 'Fund AN (Undiscl.)', value: 150 },
  { name: 'Quantum Energy', value: 100 },
  { name: 'Updata Partners', value: 100 },
];

const lpActivity = [
  { name: 'NY State CRF', transactions: 7, capital: 1087 },
  { name: 'DCRB', transactions: 4, capital: 464 },
  { name: 'NJ DOI', transactions: 5, capital: 300 },
  { name: 'Santa Barbara', transactions: 4, capital: 30 },
];

const COLORS = ['#6366f1', '#3b82f6', '#8b5cf6', '#f97316', '#06b6d4'];

const timelineEvents = [
  { date: 'Jan 29, 2026', type: 'Commitment', color: 'bg-green', headline: 'DCRB approves $150M to undisclosed infrastructure fund', amount: '$150M', lp: 'DCRB', isNew: true },
  { date: 'Jan 22, 2026', type: 'Commitment', color: 'bg-green', headline: 'NJ DOI commits $300M to Ardian infra secondaries', amount: '$300M', lp: 'NJ DOI', isNew: true },
  { date: 'Dec 5, 2025', type: 'Commitment', color: 'bg-green', headline: 'DCRB closes $100M re-up in Updata Fund VIII', amount: '$100M', lp: 'DCRB', isNew: false },
  { date: 'Nov 26, 2025', type: 'Commitment', color: 'bg-green', headline: 'DCRB closes $100M in Quantum Energy Partners IX', amount: '$100M', lp: 'DCRB', isNew: false },
  { date: 'Nov 18, 2025', type: 'Infrastructure', color: 'bg-accent', headline: 'NY State CRF commits EUR 500M to CVC DIF (two vehicles)', amount: '~$540M', lp: 'NY CRF', isNew: false },
  { date: 'Nov 4, 2025', type: 'Termination', color: 'bg-red', headline: 'NY State CRF terminates T. Rowe Price -- $2B exits', amount: '-$2.0B', lp: 'NY CRF', isNew: false },
  { date: 'Nov 3, 2025', type: 'High Conviction', color: 'bg-cyan', headline: 'NY State CRF places $323M with Stonepeak (fund + co-invest)', amount: '$323M', lp: 'NY CRF', isNew: false },
];

/* ================================================================
   Shared sub-components
   ================================================================ */

const ease = [0.22, 1, 0.36, 1] as const;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">${payload[0].value}M</p>
    </div>
  );
}

function BarGradientDefs() {
  return (
    <defs>
      <linearGradient id="barGradientV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="barGradientH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#818cf8" stopOpacity={1} />
      </linearGradient>
    </defs>
  );
}

function ChartCard({ children, delay, title }: { children: React.ReactNode; delay: number; title?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease }}
      className="chart-card"
    >
      {title && (
        <h3 className="text-sm font-semibold text-text-secondary mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)' }} />
          {title}
        </h3>
      )}
      {children}
    </motion.div>
  );
}

function ChartAnnotation({ icon: Icon, color, message }: { icon: React.ElementType; color: string; message: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 mt-3 px-2.5 py-2 rounded-lg ${color} border`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <p className="text-xs">{message}</p>
    </div>
  );
}

function ShimmerBar({ width, delay }: { width: string; delay: number }) {
  return (
    <div className="w-full bg-bg-primary rounded-full h-2 overflow-hidden relative">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light relative overflow-hidden"
        initial={{ width: 0 }}
        animate={{ width }}
        transition={{ delay, duration: 0.8 }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['-200% 0', '200% 0'] }}
          transition={{ delay: delay + 0.8, duration: 1.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
        />
      </motion.div>
    </div>
  );
}

/* ================================================================
   Hero Stat Card
   ================================================================ */

function HeroStat({ label, value, subtitle, icon: Icon, delay }: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.7, ease }}
      whileHover={{ y: -2, transition: { duration: 0.25, ease: 'easeOut' } }}
      className="stat-card"
    >
      <div className="stat-card-inner">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</span>
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-accent-light" />
          </div>
        </div>
        <p className="stat-value text-3xl font-bold tracking-tight leading-none mb-1.5">{value}</p>
        <p className="text-[11px] text-text-muted leading-relaxed">{subtitle}</p>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Main Dashboard
   ================================================================ */

export function DashboardPage() {
  const { searchQuery } = useAppContext();

  const capitalCount = useCountUp(176, 1400, true, { formatter: (n) => `$${(n / 100).toFixed(2)}B` });
  const metricsCount = useCountUp(31, 1200);
  const signalsCount = useCountUp(4, 1000);
  const gpCount = useCountUp(12, 800);

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

      <div className="relative z-10">
        {/* ---- 1. Intelligence Briefing / Tracker Banner ---- */}
        {searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease }}
            className="tracker-card mb-6"
          >
            <div className="tracker-card-inner">
              <div className="flex items-center gap-4">
                {/* Status icon with pulse ring */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-accent/12 border border-accent/25 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-accent-light" />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-xl border border-accent/30"
                    animate={{ scale: [1, 1.35, 1.35], opacity: [0.6, 0, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                  />
                </div>

                {/* Query + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-[11px] font-semibold text-accent-light uppercase tracking-[0.1em]">Now tracking</span>
                    <div className="h-3 w-px bg-border-light" />
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-light">
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full bg-green"
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-text-primary font-medium truncate">{searchQuery}</p>
                </div>

                {/* Stat pills */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="tracker-stat-pill">
                    <FileText className="w-3.5 h-3.5 text-accent-light/70" />
                    <span className="text-xs text-text-secondary font-medium">4 sources</span>
                  </div>
                  <div className="tracker-stat-pill">
                    <Activity className="w-3.5 h-3.5 text-accent-light/70" />
                    <span className="text-xs text-text-secondary font-medium">31 metrics</span>
                  </div>
                  <div className="tracker-stat-pill">
                    <Zap className="w-3.5 h-3.5 text-accent-light/70" />
                    <span className="text-xs text-text-secondary font-medium">4 signals</span>
                  </div>
                </div>
              </div>

              {/* Metadata strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="flex items-center gap-5 mt-3 pt-3 border-t border-border/40 text-[11px] text-text-muted"
              >
                <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Apr 2025 &mdash; Jan 2026</span>
                <span>High confidence &mdash; 28/31 metrics verified</span>
                <span>5 asset classes detected</span>
                <span>14 fund vehicles</span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ---- 2. Hero Stats ---- */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <HeroStat
            label="Capital Deployed"
            value={capitalCount}
            subtitle="Across 4 pension fund portfolios"
            icon={DollarSign}
            delay={0.1}
          />
          <HeroStat
            label="Infrastructure"
            value="$1.01B"
            subtitle="58% of all capital -- strongest signal"
            icon={TrendingUp}
            delay={0.15}
          />
          <HeroStat
            label="Terminated Mandates"
            value="$2.0B"
            subtitle="NY CRF -- T. Rowe Price exit"
            icon={AlertTriangle}
            delay={0.2}
          />
          <HeroStat
            label="Data Points"
            value={metricsCount}
            subtitle="4 docs -- 14 funds -- 12 GPs"
            icon={FileText}
            delay={0.25}
          />
        </div>

        {/* ---- 3. Key Insight Callout ---- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease }}
          className="insight-card mb-6"
          style={{ borderLeftColor: '#8b5cf6' }}
        >
          <div style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.06) 0%, transparent 60%)', position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-purple" />
              <span className="text-[11px] font-semibold text-purple uppercase tracking-[0.08em]">Key Finding</span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed">
              NY State CRF drove <span className="text-accent-light font-semibold">58%</span> of all capital activity this period.
              The <span className="text-red font-semibold">$2B T. Rowe Price termination</span> signals a rotation from public equities into alternatives
              &mdash; the fund deployed <span className="text-accent-light font-semibold">$1.08B</span> across 6 new alternative commitments in the same month.
            </p>
          </div>
        </motion.div>

        {/* ---- 4. Dashboard header ---- */}
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary mb-0.5">Market Intelligence</h2>
            <p className="text-xs text-text-secondary font-light">Aggregate data across 4 pension fund documents</p>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs text-text-muted font-medium"
          >
            Apr 2025 &mdash; Jan 2026
          </motion.div>
        </div>

        {/* ---- 5. Chart Grid ---- */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Commitments by Asset Class */}
          <ChartCard delay={0.4} title="Commitments by Asset Class">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={commitmentsByAsset}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  animationBegin={400}
                  animationDuration={1000}
                >
                  {commitmentsByAsset.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
                        <p className="text-xs text-text-muted">{d.name}</p>
                        <p className="text-sm font-semibold text-text-primary">${d.value}M</p>
                      </div>
                    );
                  }}
                />
                <Legend formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <ChartAnnotation
              icon={TrendingDown}
              color="bg-red/10 border-red/20 text-red"
              message={<><span className="font-semibold">Public Equities: -$2.0B</span> &mdash; T. Rowe Price termination (outflow)</>}
            />
          </ChartCard>

          {/* Commitment Activity Over Time */}
          <ChartCard delay={0.5} title="Commitment Activity Over Time">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={commitmentsByMonth}>
                <BarGradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2b38" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}M`} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="value" fill="url(#barGradientV)" radius={[4, 4, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            <ChartAnnotation
              icon={Zap}
              color="bg-accent-glow border-accent/20 text-accent-light"
              message={<><span className="font-semibold">Nov 2025 spike:</span> NY State CRF deployed $1.08B in a single month</>}
            />
          </ChartCard>

          {/* Top GPs by Capital */}
          <ChartCard delay={0.6} title="Top GPs by Capital Committed">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topGPs} layout="vertical">
                <BarGradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2b38" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}M`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="value" fill="url(#barGradientH)" radius={[0, 4, 4, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            <ChartAnnotation
              icon={Building2}
              color="bg-accent-glow border-accent/20 text-accent-light"
              message={<><span className="font-semibold">CVC DIF Mgmt</span> leads with EUR-denominated infra funds</>}
            />
          </ChartCard>

          {/* LP Activity */}
          <ChartCard delay={0.7} title="LP Activity Overview">
            <div className="space-y-3">
              {lpActivity.map((lp, i) => (
                <motion.div
                  key={lp.name}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.1, duration: 0.5, ease }}
                  className="bg-bg-tertiary rounded-lg p-3.5 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">{lp.name}</span>
                    <span className="text-xs text-text-muted">{lp.transactions} transactions</span>
                  </div>
                  <ShimmerBar width={`${Math.min((lp.capital / 1100) * 100, 100)}%`} delay={1.0 + i * 0.1} />
                  <div className="mt-1.5 text-xs text-text-muted">
                    ~<span className="text-accent-light/80">$</span>{lp.capital}M committed
                  </div>
                </motion.div>
              ))}
            </div>
            <ChartAnnotation
              icon={TrendingUp}
              color="bg-accent-glow border-accent/20 text-accent-light"
              message={<><span className="font-semibold">NY State CRF</span> accounts for 58% of total capital deployed</>}
            />
          </ChartCard>
        </div>

        {/* ---- 6. Activity Timeline ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6, ease }}
          className="chart-card"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-5 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)' }} />
            Recent Activity
          </h3>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-4">
              {timelineEvents.map((event, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.9 + i * 0.06, duration: 0.4, ease }}
                  className="flex items-start gap-3 relative"
                >
                  {/* Dot */}
                  <div className={`w-[15px] h-[15px] rounded-full ${event.color} shrink-0 mt-0.5 border-2 border-bg-primary relative z-10`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] text-text-muted font-medium">{event.date}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-muted font-medium">{event.lp}</span>
                      {event.isNew && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-light font-semibold">NEW</span>
                      )}
                    </div>
                    <p className="text-sm text-text-primary leading-snug">{event.headline}</p>
                  </div>

                  {/* Amount */}
                  <span className={`text-sm font-mono font-semibold tabular-nums shrink-0 ${
                    event.amount.startsWith('-') ? 'text-red' : 'text-green-light'
                  }`}>
                    {event.amount}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
