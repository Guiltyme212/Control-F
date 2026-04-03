import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Search, Zap, FileText, Check, Sparkles } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp';
import { useAppContext } from '../context/AppContext';

const presets = [
  "New LP commitments to infrastructure funds",
  "Manager terminations and replacements",
  "Private equity fund performance (IRR/TVPI/DPI)",
  "New funds registered in the SEC",
];

const TOTAL_DURATION = 7000;
const MESSAGE_INTERVAL = 2200;

const processingMessages = [
  "Understanding your query...",
  "Scanning NY State Common Retirement Fund...",
  "Analyzing NJ Division of Investment filings...",
  "Reading DC Retirement Board minutes...",
  "Cross-referencing fund commitments...",
  "Building intelligence signals...",
];

interface SearchPageProps {
  onSearchComplete: () => void;
}

/* ------------------------------------------------------------------ */
/*  Concentric ring — fades/scales in, then rotates slowly            */
/* ------------------------------------------------------------------ */
function ConcentricRing({ radius, duration, reverse, opacity, strokeWidth = 1.5, enterDelay = 0 }: {
  radius: number;
  duration: number;
  reverse?: boolean;
  opacity: number;
  strokeWidth?: number;
  enterDelay?: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full border border-accent"
      style={{
        width: radius * 2,
        height: radius * 2,
        top: '50%',
        left: '50%',
        marginTop: -radius,
        marginLeft: -radius,
        borderWidth: strokeWidth,
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity, scale: 1, rotate: reverse ? -360 : 360 }}
      transition={{
        opacity: { delay: enterDelay, duration: 0.9, ease: 'easeOut' },
        scale: { delay: enterDelay, duration: 1.0, ease: [0.22, 1, 0.36, 1] },
        rotate: { delay: enterDelay + 0.4, duration, repeat: Infinity, ease: 'linear' },
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Floating document — appears one at a time, scans, then checks     */
/* ------------------------------------------------------------------ */
function FloatingDoc({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const orbitRadius = 95;
  const x = Math.cos(angle) * orbitRadius;
  const y = Math.sin(angle) * orbitRadius;

  // Stagger docs across the timeline: first at ~1.5s, then every ~1s
  const enterDelay = 1.5 + index * 1.0;
  const scanDelay = enterDelay + 0.6;
  const checkDelay = scanDelay + 0.9;

  return (
    <motion.div
      className="absolute"
      style={{ top: '50%', left: '50%' }}
      initial={{ opacity: 0, scale: 0.4, x: x * 0.3, y: y * 0.3 }}
      animate={{ opacity: 1, scale: 1, x, y }}
      transition={{
        delay: enterDelay,
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="relative w-9 h-11 bg-bg-card border border-border rounded-md flex items-center justify-center overflow-hidden">
        <FileText className="w-4 h-4 text-accent-light/70" />

        {/* Scan line sweep — slower, more deliberate */}
        <motion.div
          className="absolute inset-x-0"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.18) 45%, rgba(129,140,248,0.3) 50%, rgba(99,102,241,0.18) 55%, transparent 100%)',
            height: '50%',
          }}
          initial={{ y: '-120%', opacity: 0 }}
          animate={{ y: '280%', opacity: [0, 0.8, 1, 0.8, 0] }}
          transition={{ delay: scanDelay, duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
        />

        {/* Checkmark — fades in gracefully */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center bg-bg-card/85"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: checkDelay, duration: 0.5, ease: 'easeOut' }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              delay: checkDelay,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Check className="w-4 h-4 text-green" />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting particle — slow, ambient                                 */
/* ------------------------------------------------------------------ */
function OrbitParticle({ index, total }: { index: number; total: number }) {
  const baseAngle = (index / total) * 360;
  const radius = 55 + (index % 3) * 14;
  const duration = 6 + (index % 3) * 1.5;
  const size = 1.5 + (index % 3) * 0.8;

  return (
    <motion.div
      className="absolute rounded-full bg-accent-light"
      style={{
        width: size,
        height: size,
        top: '50%',
        left: '50%',
        transformOrigin: '0 0',
      }}
      initial={{ opacity: 0 }}
      animate={{
        x: [
          Math.cos((baseAngle * Math.PI) / 180) * radius,
          Math.cos(((baseAngle + 120) * Math.PI) / 180) * radius,
          Math.cos(((baseAngle + 240) * Math.PI) / 180) * radius,
          Math.cos(((baseAngle + 360) * Math.PI) / 180) * radius,
        ],
        y: [
          Math.sin((baseAngle * Math.PI) / 180) * radius,
          Math.sin(((baseAngle + 120) * Math.PI) / 180) * radius,
          Math.sin(((baseAngle + 240) * Math.PI) / 180) * radius,
          Math.sin(((baseAngle + 360) * Math.PI) / 180) * radius,
        ],
        opacity: [0, 0.5, 0.3, 0],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'linear',
        delay: 1.0 + index * 0.25,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Central pulsing node — breathes slowly                            */
/* ------------------------------------------------------------------ */
function CentralNode() {
  const nodes = [
    { x: 0, y: 0, size: 6 },
    { x: -12, y: -10, size: 3 },
    { x: 14, y: -8, size: 3 },
    { x: -8, y: 12, size: 3 },
    { x: 10, y: 11, size: 3 },
    { x: -16, y: 2, size: 2 },
    { x: 16, y: 3, size: 2 },
  ];

  const connections = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [1, 5], [2, 6], [3, 5], [4, 6], [1, 2], [3, 4],
  ];

  return (
    <motion.div
      className="relative w-10 h-10"
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="-22 -22 44 44" className="w-full h-full">
        {connections.map(([a, b], i) => (
          <motion.line
            key={`line-${i}`}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="rgba(129,140,248,0.3)"
            strokeWidth={0.8}
            animate={{ opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={node.size / 2}
            fill={i === 0 ? '#818cf8' : 'rgba(129,140,248,0.6)'}
            animate={{ r: [node.size / 2, node.size / 2 + 0.6, node.size / 2] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main SearchPage                                                   */
/* ------------------------------------------------------------------ */
export function SearchPage({ onSearchComplete }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const { setSearchQuery } = useAppContext();

  const docsScanned = useCountUp(4, 5500, isProcessing, { overshoot: true });
  const metricsFound = useCountUp(31, 6000, isProcessing, { overshoot: true });

  const handleSearch = (searchQuery?: string) => {
    const q = searchQuery || query;
    if (searchQuery) setQuery(q);
    setSearchQuery(q);
    setIsProcessing(true);
  };

  // Processing timers — slower message cycling
  useEffect(() => {
    if (!isProcessing) return;

    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => {
        if (prev >= processingMessages.length - 1) return prev;
        return prev + 1;
      });
    }, MESSAGE_INTERVAL);

    const completeTimer = setTimeout(() => {
      onSearchComplete();
    }, TOTAL_DURATION);

    return () => {
      clearInterval(messageTimer);
      clearTimeout(completeTimer);
    };
  }, [isProcessing, onSearchComplete]);

  // Progress bar — three-phase easing for a deliberate feel
  useEffect(() => {
    if (!isProcessing) return;

    const startTime = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / TOTAL_DURATION, 1);

      // Three-phase curve:
      //   0–30%:  fast initial burst (user feels immediate response)
      //   30–85%: slow steady crawl (builds anticipation, shows work)
      //   85–100%: quick finish (satisfying completion)
      let eased: number;
      if (t < 0.15) {
        // Quick start: cover 0→30% of the bar
        const sub = t / 0.15;
        eased = sub * 0.3;
      } else if (t < 0.82) {
        // Slow middle: 30%→85%
        const sub = (t - 0.15) / 0.67;
        const ease = sub * sub * (3 - 2 * sub); // smoothstep
        eased = 0.3 + ease * 0.55;
      } else {
        // Quick finish: 85%→100%
        const sub = (t - 0.82) / 0.18;
        const ease = 1 - Math.pow(1 - sub, 3);
        eased = 0.85 + ease * 0.15;
      }

      setProcessingProgress(eased * 100);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isProcessing]);

  // Truncated query for the acknowledgment line
  const displayQuery = useMemo(() => {
    if (!query) return '';
    return query.length > 60 ? query.slice(0, 57) + '...' : query;
  }, [query]);

  return (
    <LayoutGroup>
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top section */}
        <motion.div
          layout
          className={`flex flex-col items-center px-6 ${
            isProcessing ? 'pt-6' : 'flex-1 justify-center'
          }`}
          transition={{ type: 'spring', stiffness: 60, damping: 18, mass: 1.2 }}
        >
          {/* Branding */}
          <AnimatePresence>
            {!isProcessing && (
              <motion.div
                key="branding"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.6, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: 0.5 }}
                className="text-center mb-10 relative"
              >
                <motion.div
                  className="absolute -inset-16 rounded-full pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
                  }}
                  animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="flex items-center justify-center gap-3 mb-4 relative">
                  <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center font-bold text-white text-xl">
                    F
                  </div>
                </div>
                <h1 className="text-4xl font-bold text-text-primary tracking-tight mb-2 relative">
                  CONTROL <span className="text-accent-light">F</span>
                </h1>
                <p className="text-text-secondary text-base font-light relative">
                  AI-powered intelligence across US public pension fund documents
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search bar */}
          <motion.div
            layout
            className={`w-full transition-all ${isProcessing ? 'max-w-xl' : 'max-w-2xl'}`}
            transition={{ type: 'spring', stiffness: 60, damping: 18, mass: 1.2 }}
          >
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
                    placeholder="What do you want to track?"
                    className={`w-full bg-transparent rounded-xl pl-12 pr-4 text-text-primary placeholder:text-text-muted focus:outline-none text-base transition-all ${
                      isProcessing ? 'py-3 text-sm' : 'py-4'
                    }`}
                    readOnly={isProcessing}
                  />
                </div>
              </div>
            </div>
            {/* "Press Enter to search" hint */}
            <AnimatePresence>
              {!isProcessing && query.trim().length > 0 && (
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
          </motion.div>

          {/* Preset pills */}
          <AnimatePresence>
            {!isProcessing && (
              <motion.div
                key="presets"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.97, filter: 'blur(3px)', transition: { duration: 0.5, ease: [0.4, 0, 1, 1] } }}
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
            )}
          </AnimatePresence>
        </motion.div>

        {/* Processing visualization */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8, ease: 'easeOut' }}
              className="flex-1 flex flex-col items-center justify-center px-6"
            >
              {/* Query acknowledgment — shows what you asked */}
              <motion.div
                className="flex items-center gap-2 mb-8"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-light/60" />
                <span className="text-sm text-text-muted italic">
                  &ldquo;{displayQuery}&rdquo;
                </span>
              </motion.div>

              {/* Multi-ring scanner + floating docs + particles */}
              <div className="relative mb-10" style={{ width: 240, height: 240 }}>
                {/* Ambient glow behind the whole visualization */}
                <motion.div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)',
                  }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: [0.3, 0.6, 0.3], scale: 1 }}
                  transition={{
                    opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
                    scale: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
                  }}
                />

                {/* Concentric rings — staggered entrance */}
                <ConcentricRing radius={36} duration={8} opacity={0.45} strokeWidth={1.5} enterDelay={0.3} />
                <ConcentricRing radius={56} duration={12} reverse opacity={0.25} strokeWidth={1} enterDelay={0.7} />
                <ConcentricRing radius={76} duration={16} opacity={0.12} strokeWidth={0.7} enterDelay={1.1} />

                {/* Central pulsing node */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      boxShadow: [
                        '0 0 16px rgba(99,102,241,0.1)',
                        '0 0 32px rgba(99,102,241,0.2)',
                        '0 0 16px rgba(99,102,241,0.1)',
                      ],
                    }}
                    transition={{
                      opacity: { delay: 0.2, duration: 0.8 },
                      scale: { delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                      boxShadow: { delay: 1, duration: 3, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    className="w-16 h-16 rounded-2xl bg-bg-card border border-accent/30 flex items-center justify-center"
                  >
                    <CentralNode />
                  </motion.div>
                </div>

                {/* Floating documents — spaced out across the timeline */}
                {[0, 1, 2, 3].map((i) => (
                  <FloatingDoc key={`doc-${i}`} index={i} total={4} />
                ))}

                {/* Orbiting particles — slow ambient dots */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <OrbitParticle key={`particle-${i}`} index={i} total={8} />
                ))}
              </div>

              {/* Status message — slower cycling, smoother transitions */}
              <div className="h-8 mb-5">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="text-text-secondary text-sm tracking-wide"
                  >
                    {processingMessages[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Premium progress bar */}
              <motion.div
                className="w-72 mb-7"
                initial={{ opacity: 0, scaleX: 0.8 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${processingProgress}%` }}
                  />
                </div>
                {/* Percentage label */}
                <motion.p
                  className="text-[11px] text-text-muted/60 text-right mt-1.5 tabular-nums"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                >
                  {Math.round(processingProgress)}%
                </motion.p>
              </motion.div>

              {/* Counters — delayed reveal with blur-to-sharp */}
              <motion.div
                className="flex gap-10 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
              >
                <motion.div
                  className="text-text-muted"
                  initial={{ filter: 'blur(8px)', scale: 0.92 }}
                  animate={{ filter: 'blur(0px)', scale: 1 }}
                  transition={{ delay: 1.4, duration: 0.8, ease: 'easeOut' }}
                >
                  <span className="text-accent-light font-semibold text-lg tabular-nums">{docsScanned}</span>
                  <span className="ml-1.5">documents scanned</span>
                </motion.div>
                <motion.div
                  className="text-text-muted"
                  initial={{ filter: 'blur(8px)', scale: 0.92 }}
                  animate={{ filter: 'blur(0px)', scale: 1 }}
                  transition={{ delay: 1.8, duration: 0.8, ease: 'easeOut' }}
                >
                  <span className="text-accent-light font-semibold text-lg tabular-nums">{metricsFound}</span>
                  <span className="ml-1.5">metrics found</span>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
