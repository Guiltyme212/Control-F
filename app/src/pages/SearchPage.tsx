import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, Sparkles, Bell, Activity, X, Plus, ChevronRight } from 'lucide-react';
import { GradientDots } from '@/components/ui/gradient-dots';
import type { LiveSearchTrackerSeed, AlertMode } from '../data/types';
import { pensionFundNames } from '../data/sourceRegistry';
import { parseQueryConfig } from '../utils/queryParser';

const presets = [
  'PSERS private markets IRR, TVPI, DPI, and NAV',
  'Minnesota SBI quarterly private markets performance',
  'SAMCERA private equity performance review',
  'PSERS new fund commitments and board approvals',
];

const processingMessages = [
  "Understanding your query...",
  "Scanning pension fund documents...",
  "Analyzing board meeting minutes...",
  "Cross-referencing fund data...",
  "Building intelligence signals...",
];

const PHASE_TIMINGS = {
  lifting: 600,
  thinking: 4600,
  morphing: 1400,
  departure: 100,
};

const MESSAGE_INTERVAL = 1100;

type Phase = 'idle' | 'refine' | 'lifting' | 'thinking' | 'morphing';

/* ------------------------------------------------------------------ */
/*  Refine constants                                                   */
/* ------------------------------------------------------------------ */

const ALL_ENTITIES: string[] = [...pensionFundNames];
const ALL_METRICS = ['Commitments', 'NAV', 'IRR', 'TVPI', 'DPI', 'Terminations', 'Manager Changes', 'AUM', 'Fund Registrations'];
const ALL_ASSET_CLASSES = ['Infrastructure', 'Private Equity', 'Credit', 'Real Assets', 'Natural Resources', 'Real Estate', 'Public Equities'];
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly'] as const;
type Frequency = (typeof FREQUENCIES)[number];

const PRESET_CONFIGS: Record<string, { entities: string[]; metrics: string[]; assetClasses: string[] }> = {
  'PSERS private markets IRR, TVPI, DPI, and NAV': {
    entities: ['PSERS'],
    metrics: ['IRR', 'TVPI', 'DPI', 'NAV'],
    assetClasses: ['Private Equity', 'Infrastructure', 'Credit', 'Real Estate'],
  },
  'Minnesota SBI quarterly private markets performance': {
    entities: ['Minnesota SBI'],
    metrics: ['AUM', 'NAV', 'IRR', 'TVPI', 'DPI'],
    assetClasses: ['Private Equity', 'Infrastructure', 'Credit', 'Real Assets'],
  },
  'SAMCERA private equity performance review': {
    entities: ['SAMCERA'],
    metrics: ['IRR', 'TVPI', 'DPI'],
    assetClasses: ['Private Equity'],
  },
  'PSERS new fund commitments and board approvals': {
    entities: ['PSERS'],
    metrics: ['Commitments'],
    assetClasses: ['Infrastructure', 'Private Equity'],
  },
};

const DEFAULT_CONFIG = {
  entities: ['PSERS', 'Minnesota SBI', 'SAMCERA'],
  metrics: ['Commitments', 'NAV', 'IRR'],
  assetClasses: ['Infrastructure', 'Private Equity', 'Real Assets'],
};

const ALERT_MODES: { value: AlertMode; label: string }[] = [
  { value: 'new-reports-or-values', label: 'New reports or values' },
  { value: 'new-values-only', label: 'Only new values' },
  { value: 'new-documents-only', label: 'Only new documents' },
];

/** Join list naturally: "A, B, and C" */
function naturalJoin(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const AMBIENT_PARTICLES = [
  { angle: 8, delay: 0, duration: 3.2, distance: 70, size: 2.2 },
  { angle: 64, delay: 0.7, duration: 3.8, distance: 92, size: 2.1 },
  { angle: 126, delay: 1.4, duration: 4.1, distance: 78, size: 1.8 },
  { angle: 186, delay: 2.1, duration: 3.5, distance: 84, size: 2.4 },
  { angle: 248, delay: 2.8, duration: 4.3, distance: 98, size: 1.7 },
  { angle: 308, delay: 3.5, duration: 3.7, distance: 88, size: 2.0 },
] as const;

/* ------------------------------------------------------------------ */
/*  Chip Section                                                       */
/* ------------------------------------------------------------------ */

interface ChipSectionProps {
  label: string;
  items: string[];
  allItems: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
}

function ChipSection({ label, items, allItems, onAdd, onRemove }: ChipSectionProps) {
  const [editing, setEditing] = useState(false);
  const addable = allItems.filter((i) => !items.includes(i));

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
        {addable.length > 0 && (
          <button
            onClick={() => setEditing(!editing)}
            className={`text-[11px] transition-colors cursor-pointer flex items-center gap-0.5 ${
              editing
                ? 'text-accent-light hover:text-accent'
                : 'text-text-muted/40 hover:text-accent-light'
            }`}
          >
            {editing ? 'Done' : <><Plus className="w-3 h-3" /> Add</>}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {items.map((item) => (
            <motion.span
              key={item}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent-light text-sm border border-accent/20"
            >
              {item}
              <button onClick={() => onRemove(item)} className="hover:text-white transition-colors cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </motion.span>
          ))}
          {editing &&
            addable.map((item) => (
              <motion.button
                key={`add-${item}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.2 }}
                onClick={() => onAdd(item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-hover text-text-muted text-sm border border-border hover:border-accent/30 hover:text-text-primary transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                {item}
              </motion.button>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface SearchPageProps {
  onSearchComplete: (seed: LiveSearchTrackerSeed) => void;
}

/* ------------------------------------------------------------------ */
/*  Orbital progress ring with glowing leading dot                     */
/* ------------------------------------------------------------------ */
function OrbitalRing({ progress }: { progress: number }) {
  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const dotX = 100 + Math.cos(angle) * radius;
  const dotY = 100 + Math.sin(angle) * radius;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <motion.svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        className="absolute"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.4" />
          </linearGradient>
          <radialGradient id="dot-glow">
            <stop offset="0%" stopColor="#a5b4fc" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
          <filter id="ring-blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx="100" cy="100" r={radius}
          fill="none" stroke="rgba(99,102,241,0.07)" strokeWidth="1.5"
        />

        {/* Blurred glow layer behind progress arc */}
        <circle
          cx="100" cy="100" r={radius}
          fill="none" stroke="rgba(99,102,241,0.25)" strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }}
          filter="url(#ring-blur)"
        />

        {/* Crisp progress arc */}
        <circle
          cx="100" cy="100" r={radius}
          fill="none" stroke="url(#ring-grad)" strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px' }}
        />

        {/* Leading dot with glow */}
        {progress > 0.01 && (
          <>
            <circle cx={dotX} cy={dotY} r="8" fill="url(#dot-glow)" />
            <circle cx={dotX} cy={dotY} r="2.5" fill="#c7d2fe" />
          </>
        )}
      </motion.svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ambient particles that drift outward from center                   */
/* ------------------------------------------------------------------ */
function AmbientParticles() {
  return (
    <>
      {AMBIENT_PARTICLES.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-accent-light/60"
            style={{
              width: p.size,
              height: p.size,
              top: '50%',
              left: '50%',
            }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{
              x: [0, Math.cos(rad) * p.distance * 0.5, Math.cos(rad) * p.distance],
              y: [0, Math.sin(rad) * p.distance * 0.5, Math.sin(rad) * p.distance],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main SearchPage                                                    */
/* ------------------------------------------------------------------ */
export function SearchPage({ onSearchComplete }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Refine state
  const [refineEntities, setRefineEntities] = useState<string[]>(DEFAULT_CONFIG.entities);
  const [refineMetrics, setRefineMetrics] = useState<string[]>(DEFAULT_CONFIG.metrics);
  const [refineAssetClasses, setRefineAssetClasses] = useState<string[]>(DEFAULT_CONFIG.assetClasses);
  const [refineFrequency, setRefineFrequency] = useState<Frequency>('Weekly');
  const [refineAlertMode, setRefineAlertMode] = useState<AlertMode>('new-reports-or-values');

  const handleSearch = useCallback((searchQuery?: string) => {
    const q = searchQuery || query;
    if (searchQuery) setQuery(q);
    // Pre-populate refine options based on query
    const config = PRESET_CONFIGS[q] || parseQueryConfig(q);
    setRefineEntities(config.entities);
    setRefineMetrics(config.metrics);
    setRefineAssetClasses(config.assetClasses);
    setRefineFrequency('Weekly');
    setPhase('refine');
  }, [query]);

  const handleStartTracking = useCallback(() => {
    setPhase('lifting');
  }, []);

  const handleBackToIdle = useCallback(() => {
    setPhase('idle');
  }, []);

  // Phase transitions
  useEffect(() => {
    if (phase === 'idle' || phase === 'refine') return;
    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'lifting') {
      timer = setTimeout(() => setPhase('thinking'), PHASE_TIMINGS.lifting);
    } else if (phase === 'thinking') {
      timer = setTimeout(() => setPhase('morphing'), PHASE_TIMINGS.thinking);
    } else if (phase === 'morphing') {
      timer = setTimeout(
        () =>
          onSearchComplete({
            query,
            pensionFunds: refineEntities,
            metrics: refineMetrics,
            assetClasses: refineAssetClasses,
            frequency: refineFrequency,
            alertMode: refineAlertMode,
          }),
        PHASE_TIMINGS.morphing + PHASE_TIMINGS.departure,
      );
    }

    return () => clearTimeout(timer);
  }, [
    phase,
    onSearchComplete,
    query,
    refineAlertMode,
    refineAssetClasses,
    refineEntities,
    refineFrequency,
    refineMetrics,
  ]);

  // Message cycling during thinking
  useEffect(() => {
    if (phase !== 'thinking') return;
    const timer = setInterval(() => {
      setMessageIndex(prev =>
        prev >= processingMessages.length - 1 ? prev : prev + 1
      );
    }, MESSAGE_INTERVAL);
    return () => clearInterval(timer);
  }, [phase]);

  // Smooth progress curve across thinking + morphing
  useEffect(() => {
    if (phase !== 'thinking' && phase !== 'morphing') return;

    const startTime = performance.now();
    const total = PHASE_TIMINGS.thinking + PHASE_TIMINGS.morphing;
    let frame: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / total, 1);

      // Three-phase easing: fast start, slow middle, quick finish
      let eased: number;
      if (t < 0.12) {
        eased = (t / 0.12) * 0.2;
      } else if (t < 0.78) {
        const sub = (t - 0.12) / 0.66;
        eased = 0.2 + sub * sub * (3 - 2 * sub) * 0.6;
      } else {
        const sub = (t - 0.78) / 0.22;
        eased = 0.8 + (1 - Math.pow(1 - sub, 3)) * 0.2;
      }

      setProgress(eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const displayQuery = useMemo(() => {
    if (!query) return '';
    return query.length > 55 ? query.slice(0, 52) + '...' : query;
  }, [query]);

  const isProcessing = phase === 'lifting' || phase === 'thinking' || phase === 'morphing';
  const isMorphing = phase === 'morphing';

  // Chip handlers
  const addEntity = useCallback((item: string) => setRefineEntities((p) => [...p, item]), []);
  const removeEntity = useCallback((item: string) => setRefineEntities((p) => p.filter((e) => e !== item)), []);
  const addMetric = useCallback((item: string) => setRefineMetrics((p) => [...p, item]), []);
  const removeMetric = useCallback((item: string) => setRefineMetrics((p) => p.filter((m) => m !== item)), []);
  const addAssetClass = useCallback((item: string) => setRefineAssetClasses((p) => [...p, item]), []);
  const removeAssetClass = useCallback((item: string) => setRefineAssetClasses((p) => p.filter((a) => a !== item)), []);

  return (
    <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
      {/* Ambient background glow during processing */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          >
            <div
              className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.02) 45%, transparent 70%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          IDLE STATE — Branding, search bar, presets
          ============================================================ */}
      {/* Full-screen animated grid background — behind all content */}
      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="grid-bg"
            className="absolute inset-0 z-0 pointer-events-none"
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
          >
            <GradientDots
              duration={20}
              backgroundColor="var(--color-bg-primary)"
              className="w-full h-full opacity-60"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'idle' && (
          <motion.div
            key="idle-content"
            className="flex-1 flex flex-col items-center justify-center px-6 relative z-10"
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
          >
            {/* Branding */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10 relative"
            >
              <div className="flex items-center justify-center gap-3 mb-4 relative">
                <div className="w-12 h-12 rounded-xl border border-accent/25 flex items-center justify-center">
                  <img
                    alt="F"
                    src="/vector.svg"
                    className="w-7 h-7"
                    style={{ filter: 'brightness(0) invert(1)' }}
                  />
                </div>
              </div>
              <h1 className="text-4xl font-bold text-text-primary tracking-tight mb-2 relative flex items-center justify-center gap-0.5">
                Control<span className="inline-flex items-center justify-center rounded-md relative" style={{ height: '1.15em', width: '1.15em', top: '0.04em', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}><img
                  alt="F"
                  src="/vector.svg"
                  className="block"
                  style={{ height: '0.7em', width: '0.7em', filter: 'brightness(0) invert(1)' }}
                /></span>
              </h1>
              <p className="text-text-secondary text-base font-light relative">
                Pension fund data, extracted from the source
              </p>
            </motion.div>

            {/* Search bar */}
            <div className="w-full max-w-2xl">
              <div className="search-glow-wrapper">
                <div className="search-glow-inner">
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-accent-light transition-colors" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && query.trim()) handleSearch();
                      }}
                      placeholder="Search any fund, metric, or document..."
                      className="w-full bg-transparent rounded-xl pl-12 pr-12 py-4 text-text-primary placeholder:text-text-muted focus:outline-none text-base"
                    />
                    {query.trim() && (
                      <button
                        onClick={() => handleSearch()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-accent/20 hover:bg-accent/40 text-accent-light transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {query.trim().length > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-text-muted mt-2 text-center"
                  >
                    Press Enter to search
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Preset pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-wrap justify-center gap-2 max-w-2xl mt-8"
            >
              {presets.map((preset, i) => (
                <motion.button
                  key={preset}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  whileHover={{
                    scale: 1.03,
                    borderColor: 'rgba(99,102,241,0.5)',
                    boxShadow: '0 0 16px rgba(99,102,241,0.12)',
                  }}
                  onClick={() => handleSearch(preset)}
                  className="px-4 py-2 rounded-lg bg-bg-card/80 border border-border text-text-secondary text-sm hover:text-text-primary transition-all cursor-pointer backdrop-blur-sm"
                >
                  <Zap className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                  {preset}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          UNIFIED BUBBLE — Refine + processing in one continuous bubble
          ============================================================ */}
      <AnimatePresence>
        {(phase === 'refine' || isProcessing) && (
          <motion.div
            key="bubble-scene"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              y: -60,
              scale: 0.85,
              filter: 'blur(6px)',
              transition: { duration: 0.45, ease: [0.4, 0, 1, 1] },
            }}
            transition={{ duration: 0.4 }}
          >
            {/* Orbital ring + particles — only during thinking/morphing */}
            {(phase === 'thinking' || phase === 'morphing') && (
              <div className="absolute pointer-events-none" style={{ width: 200, height: 200 }}>
                <OrbitalRing progress={progress} />
              </div>
            )}
            {phase === 'thinking' && (
              <div className="absolute pointer-events-none">
                <AmbientParticles />
              </div>
            )}

            {/* The evolving bubble card */}
            <motion.div
              className="relative z-10 w-full flex justify-center"
              initial={{ y: 30, opacity: 0, scale: 0.95 }}
              animate={{
                y: 0,
                opacity: 1,
                scale: isMorphing ? 1.02 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 280,
                damping: 26,
                mass: 0.9,
              }}
            >
              <motion.div
                className="relative overflow-hidden rounded-2xl w-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(26, 27, 36, 0.97) 0%, rgba(17, 18, 24, 0.99) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
                animate={{
                  maxWidth: phase === 'refine' ? 560 : 420,
                  boxShadow: isMorphing
                    ? [
                      '0 0 30px rgba(99,102,241,0.15), 0 0 60px rgba(99,102,241,0.08)',
                      '0 0 50px rgba(99,102,241,0.25), 0 0 100px rgba(99,102,241,0.12)',
                      '0 0 30px rgba(16,185,129,0.15), 0 0 60px rgba(16,185,129,0.06)',
                    ]
                    : phase === 'refine'
                      ? '0 0 40px rgba(99,102,241,0.12), 0 0 80px rgba(99,102,241,0.06)'
                      : [
                        '0 0 24px rgba(99,102,241,0.1), 0 0 48px rgba(99,102,241,0.05)',
                        '0 0 36px rgba(99,102,241,0.18), 0 0 72px rgba(99,102,241,0.08)',
                        '0 0 24px rgba(99,102,241,0.1), 0 0 48px rgba(99,102,241,0.05)',
                      ],
                  borderColor: isMorphing
                    ? 'rgba(16, 185, 129, 0.35)'
                    : 'rgba(99, 102, 241, 0.3)',
                }}
                transition={{
                  maxWidth: { type: 'spring', stiffness: 200, damping: 24 },
                  boxShadow: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
                  borderColor: { duration: 0.6, ease: 'easeOut' },
                }}
              >
                {/* Shimmer sweep */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(129,140,248,0.06) 50%, transparent 60%)',
                  }}
                  animate={{ x: ['-150%', '250%'] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'linear', delay: 0.5 }}
                />

                {/* Query header — always visible */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 relative">
                  <motion.div
                    animate={{ rotate: phase === 'refine' ? 0 : [0, 15, -15, 0] }}
                    transition={{ duration: 4, repeat: phase === 'refine' ? 0 : Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="w-4 h-4 text-accent-light/70 shrink-0" />
                  </motion.div>
                  <span className="text-sm text-text-primary font-medium whitespace-nowrap flex-1 min-w-0 truncate">
                    {displayQuery}
                  </span>
                  {phase === 'refine' && (
                    <button
                      onClick={handleBackToIdle}
                      className="text-[11px] text-text-muted/40 hover:text-text-muted transition-colors shrink-0 cursor-pointer"
                    >
                      Back
                    </button>
                  )}
                </div>

                {/* ---- Refine content — collapses when processing starts ---- */}
                <AnimatePresence>
                  {phase === 'refine' && (
                    <motion.div
                      key="refine-inner"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 28,
                        opacity: { duration: 0.25 },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pt-1">
                        {/* Divider */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-1 h-px bg-gradient-to-r from-accent/20 via-border/50 to-transparent" />
                        </div>

                        <ChipSection
                          label="Pension Funds"
                          items={refineEntities}
                          allItems={ALL_ENTITIES}
                          onAdd={addEntity}
                          onRemove={removeEntity}
                        />
                        <ChipSection
                          label="Metrics"
                          items={refineMetrics}
                          allItems={ALL_METRICS}
                          onAdd={addMetric}
                          onRemove={removeMetric}
                        />
                        <ChipSection
                          label="Asset Classes"
                          items={refineAssetClasses}
                          allItems={ALL_ASSET_CLASSES}
                          onAdd={addAssetClass}
                          onRemove={removeAssetClass}
                        />

                        {/* Frequency */}
                        <div className="mb-4">
                          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 block">
                            Frequency
                          </span>
                          <div className="flex gap-1.5">
                            {FREQUENCIES.map((f) => (
                              <button
                                key={f}
                                onClick={() => setRefineFrequency(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${refineFrequency === f
                                  ? 'bg-accent text-white'
                                  : 'bg-bg-hover/50 text-text-muted border border-border/50 hover:text-text-primary'
                                  }`}
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Alert mode */}
                        <div className="mb-4">
                          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2 block">
                            Alert Me When
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {ALERT_MODES.map((mode) => (
                              <button
                                key={mode.value}
                                onClick={() => setRefineAlertMode(mode.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${refineAlertMode === mode.value
                                  ? 'bg-accent/20 text-accent-light border border-accent/30'
                                  : 'bg-bg-hover/50 text-text-muted border border-border/50 hover:text-text-primary'
                                  }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Summary sentence */}
                        <div className="mb-4 py-3 px-3.5 rounded-lg bg-bg-hover/30 border border-border/30">
                          <p className="text-[12px] text-text-secondary leading-relaxed">
                            {refineFrequency === 'Daily' ? 'Every day' : refineFrequency === 'Weekly' ? 'Every week' : 'Every month'}, monitor{' '}
                            <span className="text-text-primary font-medium">{naturalJoin(refineEntities)}</span> performance reports for{' '}
                            <span className="text-text-primary font-medium">{naturalJoin(refineMetrics)}</span>
                            {refineAssetClasses.length > 0 && (
                              <> across <span className="text-text-primary font-medium">{naturalJoin(refineAssetClasses)}</span></>
                            )}.
                          </p>
                          <p className="text-[11px] text-text-muted/60 mt-1">
                            {refineAlertMode === 'new-reports-or-values'
                              ? 'Alert when new matching reports appear or values change.'
                              : refineAlertMode === 'new-values-only'
                              ? 'Alert only when metric values change.'
                              : 'Alert only when new matching documents appear.'}
                          </p>
                        </div>

                        {/* Baseline explanation */}
                        <p className="text-[10px] text-text-muted/40 text-center mb-2">
                          The first scan establishes your baseline. Future scans detect changes.
                        </p>

                        {/* CTA */}
                        <motion.button
                          onClick={handleStartTracking}
                          disabled={refineMetrics.length === 0}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          Create & Run First Scan
                          <ChevronRight className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ---- Morph metadata — slides in during morph phase ---- */}
                <AnimatePresence>
                  {isMorphing && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-5 pb-3.5 pt-0">
                        <div className="flex-1 h-px bg-gradient-to-r from-accent/20 via-border/50 to-transparent" />
                      </div>
                      <motion.div
                        className="flex items-center gap-3 px-5 pb-4"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="flex items-center gap-1.5">
                          <motion.div
                            className="w-1.5 h-1.5 rounded-full bg-green"
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <span className="text-xs text-green font-medium">Active</span>
                        </div>
                        <span className="text-[10px] text-text-muted/40">|</span>
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Bell className="w-3 h-3" />
                          <span>{refineFrequency}</span>
                        </div>
                        <span className="text-[10px] text-text-muted/40">|</span>
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Activity className="w-3 h-3" />
                          <span>{refineEntities.length} funds</span>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>

            {/* Processing status message */}
            <div className="h-8 mt-2">
              <AnimatePresence mode="wait">
                {phase === 'thinking' && (
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="text-text-secondary text-sm tracking-wide text-center"
                  >
                    {processingMessages[messageIndex]}
                  </motion.p>
                )}
                {phase === 'morphing' && (
                  <motion.p
                    key="morph-msg"
                    initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="text-accent-light text-sm font-medium tracking-wide text-center"
                  >
                    Tracker created
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Progress percentage */}
            {(phase === 'thinking' || phase === 'morphing') && (
              <motion.p
                className="text-[11px] text-text-muted/40 mt-1 tabular-nums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {Math.round(progress * 100)}%
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
