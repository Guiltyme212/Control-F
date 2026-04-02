import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, Search, Settings, X, AlertTriangle } from 'lucide-react';
import { extractMetricsFromPDF } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import type { Metric } from '../data/types';

type UploadState = 'idle' | 'file-ready' | 'processing' | 'complete' | 'error';

const processingMessages = [
  "Reading document structure...",
  "Identifying financial tables...",
  "Extracting commitment data...",
  "Parsing performance metrics...",
  "Building intelligence signals...",
];

const sampleResults: { metric: string; fund: string; value: string; confidence: string }[] = [
  { metric: 'Commitment', fund: 'DIF Infrastructure VIII', value: '\u20AC250,000,000', confidence: 'high' },
  { metric: 'Commitment', fund: 'Stonepeak Global Renewables Fund II', value: '$243,545,000', confidence: 'high' },
  { metric: 'Performance', fund: 'ASF VI Infrastructure (2014 vintage)', value: '16.7% net IRR / 1.6x TVPI / 1.3x DPI', confidence: 'high' },
  { metric: 'Fee Structure', fund: 'ASF IX Infrastructure B', value: '1% mgmt fee / 12.5% carry / 7% hurdle', confidence: 'high' },
  { metric: 'AUM', fund: 'DCRB Total Fund', value: '$14,100,000,000', confidence: 'high' },
];

export function UploadPage() {
  const [state, setState] = useState<UploadState>('idle');
  const [file, setFile] = useState<{ name: string; size: string } | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [extractedMetrics, setExtractedMetrics] = useState<Metric[] | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();
  const abortRef = useRef(false);

  // Check for stored API key on mount
  useEffect(() => {
    const storedKey = sessionStorage.getItem('anthropic_key');
    if (storedKey) {
      setApiKey(storedKey);
      setIsLiveMode(true);
    }
  }, []);

  const handleFile = useCallback((f: File) => {
    setFile({ name: f.name, size: `${(f.size / 1024 / 1024).toFixed(1)} MB` });
    setRawFile(f);
    setState('file-ready');
    setExtractedMetrics(null);
    setErrorMessage('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') handleFile(f);
  }, [handleFile]);

  const handleExtract = async () => {
    setState('processing');
    setMsgIdx(0);
    abortRef.current = false;

    const storedKey = sessionStorage.getItem('anthropic_key');

    if (storedKey && rawFile) {
      // Real API extraction
      try {
        const result = await extractMetricsFromPDF(rawFile, storedKey);
        if (abortRef.current) return;
        setExtractedMetrics(result.metrics);
        setState('complete');
        showToast(`Extracted ${result.metrics.length} metrics from ${rawFile.name}`, 'success');
      } catch (err: unknown) {
        if (abortRef.current) return;
        const message = err instanceof Error ? err.message : 'Unknown error occurred';
        setErrorMessage(message);
        setState('error');
        showToast(message, 'error');
      }
    } else {
      // Simulated demo mode — keep original behavior
      setExtractedMetrics(null);
    }
  };

  // Demo mode processing animation
  useEffect(() => {
    if (state !== 'processing') return;

    const timer = setInterval(() => {
      setMsgIdx(prev => {
        if (prev >= processingMessages.length - 1) return prev;
        return prev + 1;
      });
    }, 700);

    // Only auto-complete in demo mode (no API key)
    const storedKey = sessionStorage.getItem('anthropic_key');
    let complete: ReturnType<typeof setTimeout> | undefined;
    if (!storedKey) {
      complete = setTimeout(() => setState('complete'), 3500);
    }

    return () => {
      clearInterval(timer);
      if (complete) clearTimeout(complete);
    };
  }, [state]);

  const hasApiKey = isLiveMode || !!sessionStorage.getItem('anthropic_key');

  // Determine which results to show
  const displayResults = extractedMetrics || null;
  const displaySample = !extractedMetrics ? sampleResults : null;

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-1">Upload</h2>
          <p className="text-sm text-text-secondary font-light">Extract financial metrics from any pension fund PDF</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-lg bg-bg-card border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <Settings className="w-4.5 h-4.5" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-xl mx-auto"
          >
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-accent bg-accent-glow'
                  : 'border-border hover:border-border-light'
              }`}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf';
                input.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) handleFile(f);
                };
                input.click();
              }}
            >
              <Upload className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-primary font-medium mb-1">Drop a PDF here or click to browse</p>
              <p className="text-sm text-text-muted">Supports pension fund meeting minutes, transaction reports, and performance updates</p>
            </div>
            {!hasApiKey && (
              <p className="text-xs text-text-muted text-center mt-3">
                Demo mode — configure API key in settings for live extraction
              </p>
            )}
          </motion.div>
        )}

        {state === 'file-ready' && file && (
          <motion.div
            key="file-ready"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-xl mx-auto"
          >
            <div className="bg-bg-card border border-border rounded-xl p-6 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <CheckCircle className="w-12 h-12 text-green mx-auto mb-4" />
              </motion.div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-text-muted" />
                <span className="text-text-primary font-medium">{file.name}</span>
              </div>
              <p className="text-sm text-text-muted mb-1">{file.size}</p>
              {hasApiKey && (
                <p className="text-xs text-green mb-4">Live extraction enabled</p>
              )}
              {!hasApiKey && (
                <p className="text-xs text-text-muted mb-4">Demo mode</p>
              )}
              <button
                onClick={handleExtract}
                className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer"
              >
                Extract Metrics
              </button>
            </div>
          </motion.div>
        )}

        {state === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-xl mx-auto flex flex-col items-center py-16"
          >
            <div className="relative mb-8">
              <motion.div
                className="w-20 h-20 rounded-2xl border-2 border-accent/30 flex items-center justify-center"
                animate={{
                  borderColor: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.7)', 'rgba(99,102,241,0.3)'],
                  boxShadow: ['0 0 20px rgba(99,102,241,0.1)', '0 0 40px rgba(99,102,241,0.25)', '0 0 20px rgba(99,102,241,0.1)'],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                  <Search className="w-8 h-8 text-accent-light" />
                </motion.div>
              </motion.div>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-text-secondary"
              >
                {processingMessages[msgIdx]}
              </motion.p>
            </AnimatePresence>
            {hasApiKey && (
              <p className="text-xs text-text-muted mt-4">Sending to Claude API...</p>
            )}
          </motion.div>
        )}

        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-xl mx-auto"
          >
            <div className="bg-bg-card border border-red/30 rounded-xl p-6 text-center">
              <AlertTriangle className="w-12 h-12 text-red mx-auto mb-4" />
              <h3 className="text-text-primary font-semibold mb-2">Extraction Failed</h3>
              <p className="text-sm text-text-secondary mb-6">{errorMessage}</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleExtract}
                  className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer"
                >
                  Retry
                </button>
                <button
                  onClick={() => { setState('idle'); setFile(null); setRawFile(null); }}
                  className="px-6 py-2.5 rounded-lg bg-bg-hover border border-border text-text-secondary font-medium hover:text-text-primary transition-colors cursor-pointer"
                >
                  Upload Different File
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {state === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green" />
                  <span className="text-sm font-medium text-text-primary">Extraction Complete</span>
                  <span className="text-xs text-text-muted">
                    — {displayResults ? displayResults.length : sampleResults.length} metrics found
                    {!displayResults && ' (demo)'}
                  </span>
                </div>
                <button
                  onClick={() => { setState('idle'); setFile(null); setRawFile(null); setExtractedMetrics(null); }}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Upload Another
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {displayResults ? (
                        <>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">LP</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Metric</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Fund</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Value</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Confidence</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Metric</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Fund</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Value</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Confidence</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults ? (
                      displayResults.map((r, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.05, 1) }}
                          className="border-b border-border/30"
                        >
                          <td className="px-4 py-3 text-text-muted whitespace-nowrap">{r.date}</td>
                          <td className="px-4 py-3 text-text-primary whitespace-nowrap">{r.lp}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green/20 text-green-light">{r.metric}</span>
                          </td>
                          <td className="px-4 py-3 text-text-primary max-w-48 truncate">{r.fund}</td>
                          <td className="px-4 py-3 text-text-primary font-mono text-xs">{r.value}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs ${r.confidence === 'high' ? 'text-green' : r.confidence === 'medium' ? 'text-yellow' : 'text-red'}`}>
                              {r.confidence}
                            </span>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      displaySample?.map((r, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="border-b border-border/30"
                        >
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green/20 text-green-light">{r.metric}</span>
                          </td>
                          <td className="px-4 py-3 text-text-primary">{r.fund}</td>
                          <td className="px-4 py-3 text-text-primary font-mono text-xs">{r.value}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs ${r.confidence === 'high' ? 'text-green' : 'text-yellow'}`}>
                              {r.confidence}
                            </span>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Key Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-bg-secondary border border-border rounded-xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text-primary">API Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-text-muted hover:text-text-primary cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-text-muted mb-4">
                Enter your Anthropic API key to enable live PDF extraction. The key is stored in session only.
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (apiKey) {
                      sessionStorage.setItem('anthropic_key', apiKey);
                      setIsLiveMode(true);
                      showToast('API key saved — live extraction enabled', 'success');
                    } else {
                      sessionStorage.removeItem('anthropic_key');
                      setIsLiveMode(false);
                      showToast('API key removed — demo mode', 'info');
                    }
                    setShowSettings(false);
                  }}
                  className="flex-1 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer"
                >
                  Save
                </button>
                {apiKey && (
                  <button
                    onClick={() => {
                      setApiKey('');
                      sessionStorage.removeItem('anthropic_key');
                      setIsLiveMode(false);
                      setShowSettings(false);
                      showToast('API key removed', 'info');
                    }}
                    className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-text-secondary text-sm hover:text-text-primary transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
