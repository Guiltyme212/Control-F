import { motion } from 'framer-motion';
import { TrendingDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

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

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">${payload[0].value}M</p>
    </div>
  );
};

export function DashboardPage() {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-text-primary mb-1">Dashboard</h2>
        <p className="text-sm text-text-secondary font-light">Aggregate intelligence across 4 pension fund documents</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Commitments by Asset Class - Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-4">Commitments by Asset Class</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={commitmentsByAsset}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                animationBegin={200}
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
              <Legend
                formatter={(value) => <span className="text-xs text-text-secondary">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-2 mt-2 px-2 py-2 rounded-lg bg-red/10 border border-red/20">
            <TrendingDown className="w-3.5 h-3.5 text-red shrink-0" />
            <p className="text-xs text-red">
              <span className="font-semibold">Public Equities: -$2.0B</span> — T. Rowe Price termination (outflow)
            </p>
          </div>
        </motion.div>

        {/* Commitment Activity Over Time */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-4">Commitment Activity Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={commitmentsByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b38" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}M`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Top GPs by Capital */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-4">Top GPs by Capital Committed</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topGPs} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2b38" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}M`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
              <Bar dataKey="value" fill="#818cf8" radius={[0, 4, 4, 0]} animationDuration={1000} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* LP Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-text-secondary mb-4">LP Activity Overview</h3>
          <div className="space-y-3">
            {lpActivity.map((lp, i) => (
              <motion.div
                key={lp.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="bg-bg-tertiary rounded-lg p-4 border border-border/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary">{lp.name}</span>
                  <span className="text-xs text-text-muted">{lp.transactions} transactions</span>
                </div>
                <div className="w-full bg-bg-primary rounded-full h-2 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((lp.capital / 1100) * 100, 100)}%` }}
                    transition={{ delay: 0.7 + i * 0.1, duration: 0.8 }}
                  />
                </div>
                <div className="mt-1.5 text-xs text-text-muted">
                  ~${lp.capital}M committed
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
