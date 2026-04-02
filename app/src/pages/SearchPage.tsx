import { useState, useEffect } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Search, Zap, FileText, Check } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp';

const presets = [
  "New LP commitments to infrastructure funds",
  "Manager terminations and replacements",
  "Private equity fund performance (IRR/TVPI/DPI)",
  "New funds registered in the SEC",
];

const processingMessages = [
  "Scanning NY State Common Retirement Fund...",
  "Analyzing NJ Division of Investment filings...",
  "Reading DC Retirement Board minutes...",
  "Extracting data from Santa Barbara County ERS...",
  "Cross-referencing fund commitments...",
  "Building intelligence signals...",
];

interface SearchPageProps {
  onSearchComplete: () => void;
}

/* ------------------------------------------------------------------ */
/*  Concentric ring component                                         */
/* ------------------------------------------------------------------ */
function ConcentricRing({ radius, duration, reverse, opacity, strokeWidth = 1.5 }: {
  radius: number;
  duration: number;
  reverse?: boolean;
  opacity: number;
  strokeWidth?: number;
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
        opacity,
      }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Floating document with scan-line sweep                            */
/* ------------------------------------------------------------------ */
function FloatingDoc({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  const orbitRadius = 95;
  const x = Math.cos(angle) * orbitRadius;
  const y = Math.sin(angle) * orbitRadius;

  return (
    <motion.div
      className="absolute"
      style={{ top: '50%', left: '50%' }}
      initial={{ opacity: 0, scale: 0.3, x, y }}
      animate={{ opacity: 1, scale: 1, x, y }}
      transition={{ delay: 0.3 + index * 0.35, duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
    >
      <div className="relative w-9 h-11 bg-bg-card border border-border rounded-md flex items-center justify-center overflow-hidden">
        <FileText className="w-4 h-4 text-accent-light/70" />

        {/* Scan line sweep */}
        <motion.div
          className="absolute inset-x-0 h-full"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(99,102,241,0.25) 50%, transparent 100%)',
            height: '40%',
          }}
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: '250%', opacity: [0, 1, 1, 0] }}
          transition={{ delay: 0.8 + index * 0.35, duration: 0.8, ease: 'easeInOut' }}
        />

        {/* Checkmark that fades in after scan */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center bg-bg-card/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 + index * 0.35, duration: 0.3 }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.6 + index * 0.35, duration: 0.3, type: 'spring', stiffness: 400 }}
          >
            <Check className="w-4 h-4 text-green" />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting particle                                                 */
/* ------------------------------------------------------------------ */
function OrbitParticle({ index, total }: { index: number; total: number }) {
  const baseAngle = (index / total) * 360;
  const radius = 55 + (index % 3) * 12;
  const duration = 3 + (index % 3) * 0.8;
  const size = 2 + (index % 3);

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
        opacity: [0.2, 0.8, 0.4, 0.2],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'linear',
        delay: index * 0.15,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Central pulsing node visualization                                */
/* ------------------------------------------------------------------ */
function CentralNode() {
  // Network/brain-like node positions (relative to center)
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
      animate={{ scale: [1, 1.08, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="-22 -22 44 44" className="w-full h-full">
        {/* Connection lines */}
        {connections.map(([a, b], i) => (
          <motion.line
            key={`line-${i}`}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke="rgba(129,140,248,0.3)"
            strokeWidth={0.8}
            animate={{ opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
        {/* Node dots */}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={node.size / 2}
            fill={i === 0 ? '#818cf8' : 'rgba(129,140,248,0.6)'}
            animate={{ r: [node.size / 2, node.size / 2 + 0.8, node.size / 2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
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

  const docsScanned = useCountUp(4, 3200, isProcessing, { overshoot: true });
  const metricsFound = useCountUp(31, 3500, isProcessing, { overshoot: true });

  const handleSearch = (searchQuery?: string) => {
    if (searchQuery) setQuery(searchQuery);
    setIsProcessing(true);
  };

  // Processing timers
  useEffect(() => {
    if (!isProcessing) return;

    const messageTimer = setInterval(() => {
      setMessageIndex((prev) => {
        if (prev >= processingMessages.length - 1) return prev;
        return prev + 1;
      });
    }, 1500);

    const completeTimer = setTimeout(() => {
      onSearchComplete();
    }, 3800);

    return () => {
      clearInterval(messageTimer);
      clearTimeout(completeTimer);
    };
  }, [isProcessing, onSearchComplete]);

  // Progress bar animation (0 -> 100% over 3.8s)
  useEffect(() => {
    if (!isProcessing) return;

    const startTime = performance.now();
    const totalDuration = 3800;
    let frame: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);
      // Ease-out curve so it feels like it accelerates early and slows near the end
      const eased = 1 - Math.pow(1 - progress, 2.5);
      setProcessingProgress(eased * 100);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isProcessing]);

  return (
    <LayoutGroup>
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top section */}
        <motion.div
          layout
          className={`flex flex-col items-center px-6 ${
            isProcessing ? 'pt-6' : 'flex-1 justify-center'
          }`}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        >
          {/* Branding */}
          <AnimatePresence>
            {!isProcessing && (
              <motion.div
                key="branding"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5 }}
                className="text-center mb-10 relative"
              >
                {/* Pulsing radial gradient behind logo */}
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
            transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          >
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
                className={`w-full bg-bg-card border border-border rounded-xl pl-12 pr-4 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent-glow text-base transition-all ${
                  isProcessing ? 'py-3 text-sm' : 'py-4'
                }`}
                readOnly={isProcessing}
              />
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
                exit={{ opacity: 0, y: 15, transition: { duration: 0.2 } }}
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
              transition={{ delay: 0.35, duration: 0.4 }}
              className="flex-1 flex flex-col items-center justify-center px-6"
            >
              {/* Multi-ring scanner + floating docs + particles */}
              <div className="relative mb-10" style={{ width: 240, height: 240 }}>
                {/* Concentric rings */}
                <ConcentricRing radius={36} duration={4} opacity={0.5} strokeWidth={1.5} />
                <ConcentricRing radius={56} duration={6} reverse opacity={0.3} strokeWidth={1} />
                <ConcentricRing radius={76} duration={8} opacity={0.15} strokeWidth={0.8} />

                {/* Central pulsing node visualization */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{
                      boxShadow: [
                        '0 0 20px rgba(99,102,241,0.15)',
                        '0 0 40px rgba(99,102,241,0.3)',
                        '0 0 20px rgba(99,102,241,0.15)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-2xl bg-bg-card border border-accent/30 flex items-center justify-center"
                  >
                    <CentralNode />
                  </motion.div>
                </div>

                {/* Floating document icons (4 total, staggered appearance) */}
                {[0, 1, 2, 3].map((i) => (
                  <FloatingDoc key={`doc-${i}`} index={i} total={4} />
                ))}

                {/* Orbiting particles (8 small dots) */}
                {Array.from({ length: 8 }).map((_, i) => (
                  <OrbitParticle key={`particle-${i}`} index={i} total={8} />
                ))}
              </div>

              {/* Status message */}
              <div className="h-8 mb-4">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-text-secondary text-base"
                  >
                    {processingMessages[messageIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Progress bar */}
              <div className="w-64 h-1 bg-bg-card rounded-full overflow-hidden mb-6">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${processingProgress}%`,
                    background: 'linear-gradient(90deg, #6366f1 0%, #818cf8 100%)',
                  }}
                />
              </div>

              {/* Counters with blur-to-sharp reveal */}
              <div className="flex gap-8 text-sm">
                <motion.div
                  className="text-text-muted"
                  initial={{ filter: 'blur(8px)', scale: 0.9 }}
                  animate={{ filter: 'blur(0px)', scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                >
                  <span className="text-accent-light font-semibold text-lg">{docsScanned}</span> documents scanned
                </motion.div>
                <motion.div
                  className="text-text-muted"
                  initial={{ filter: 'blur(8px)', scale: 0.9 }}
                  animate={{ filter: 'blur(0px)', scale: 1 }}
                  transition={{ delay: 0.7, duration: 0.6 }}
                >
                  <span className="text-accent-light font-semibold text-lg">{metricsFound}</span> metrics found
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
