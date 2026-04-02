import { useState, useEffect } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Search, Zap } from 'lucide-react';
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

export function SearchPage({ onSearchComplete }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  const docsScanned = useCountUp(4, 3200, isProcessing);
  const metricsFound = useCountUp(31, 3500, isProcessing);

  const handleSearch = (searchQuery?: string) => {
    if (searchQuery) setQuery(searchQuery);
    setIsProcessing(true);
  };

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

  return (
    <LayoutGroup>
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top section: centers content when idle, aligns to top when processing */}
        <motion.div
          layout
          className={`flex flex-col items-center px-6 ${
            isProcessing ? 'pt-6' : 'flex-1 justify-center'
          }`}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        >
          {/* Branding — fades out when processing begins */}
          <AnimatePresence>
            {!isProcessing && (
              <motion.div
                key="branding"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5 }}
                className="text-center mb-10"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center font-bold text-white text-xl">
                    F
                  </div>
                </div>
                <h1 className="text-4xl font-bold text-text-primary tracking-tight mb-2">
                  CONTROL <span className="text-accent-light">F</span>
                </h1>
                <p className="text-text-secondary text-base font-light">
                  AI-powered intelligence across US public pension fund documents
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search bar — always rendered, layout-animated from center to top */}
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
          </motion.div>

          {/* Preset pills — fade out independently */}
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
                    onClick={() => handleSearch(preset)}
                    className="px-4 py-2 rounded-lg bg-bg-card border border-border text-text-secondary text-sm hover:border-accent/40 hover:text-text-primary hover:bg-bg-hover transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                    {preset}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Processing visualization — appears below the pinned search bar */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="flex-1 flex flex-col items-center justify-center px-6"
            >
              {/* Scanning animation */}
              <div className="relative mb-10">
                <motion.div
                  className="w-24 h-24 rounded-2xl border-2 border-accent/30 flex items-center justify-center"
                  animate={{
                    borderColor: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.7)', 'rgba(99,102,241,0.3)'],
                    boxShadow: [
                      '0 0 20px rgba(99,102,241,0.1)',
                      '0 0 40px rgba(99,102,241,0.25)',
                      '0 0 20px rgba(99,102,241,0.1)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  >
                    <Search className="w-10 h-10 text-accent-light" />
                  </motion.div>
                </motion.div>
                {/* Orbiting dots */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-accent-light"
                    style={{ top: '50%', left: '50%' }}
                    animate={{
                      x: [0, Math.cos((i * 2 * Math.PI) / 3) * 50, 0],
                      y: [0, Math.sin((i * 2 * Math.PI) / 3) * 50, 0],
                      opacity: [0.3, 1, 0.3],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.3,
                    }}
                  />
                ))}
              </div>

              {/* Status message */}
              <div className="h-8 mb-6">
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

              {/* Counters */}
              <div className="flex gap-8 text-sm">
                <div className="text-text-muted">
                  <span className="text-accent-light font-semibold text-lg">{docsScanned}</span> documents scanned
                </div>
                <div className="text-text-muted">
                  <span className="text-accent-light font-semibold text-lg">{metricsFound}</span> metrics found
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
