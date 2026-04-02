import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, Search, Settings, X } from 'lucide-react';

type UploadState = 'idle' | 'file-ready' | 'processing' | 'complete';

const processingMessages = [
  "Reading document structure...",
  "Identifying financial tables...",
  "Extracting commitment data...",
  "Parsing performance metrics...",
  "Building intelligence signals...",
];

const sampleResults = [
  { metric: 'Commitment', fund: 'DIF Infrastructure VIII', value: '€250,000,000', confidence: 'high' },
  { metric: 'Commitment', fund: 'Stonepeak Global Renewables Fund II', value: '$243,545,000', confidence: 'high' },
  { metric: 'Performance', fund: 'ASF VI Infrastructure (2014 vintage)', value: '16.7% net IRR / 1.6x TVPI / 1.3x DPI', confidence: 'high' },
  { metric: 'Fee Structure', fund: 'ASF IX Infrastructure B', value: '1% mgmt fee / 12.5% carry / 7% hurdle', confidence: 'high' },
  { metric: 'AUM', fund: 'DCRB Total Fund', value: '$14,100,000,000', confidence: 'high' },
];

export function UploadPage() {
  const [state, setState] = useState<UploadState>('idle');
  const [file, setFile] = useState<{ name: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const handleFile = useCallback((f: File) => {
    setFile({ name: f.name, size: `${(f.size / 1024 / 1024).toFixed(1)} MB` });
    setState('file-ready');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') handleFile(f);
  }, [handleFile]);

  const handleExtract = () => {
    setState('processing');
    setMsgIdx(0);
  };

  useEffect(() => {
    if (state !== 'processing') return;
    const timer = setInterval(() => {
      setMsgIdx(prev => {
        if (prev >= processingMessages.length - 1) return prev;
        return prev + 1;
      });
    }, 700);
    const complete = setTimeout(() => setState('complete'), 3500);
    return () => { clearInterval(timer); clearTimeout(complete); };
  }, [state]);

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
              <p className="text-sm text-text-muted mb-6">{file.size}</p>
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
          </motion.div>
        )}

        {state === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green" />
                  <span className="text-sm font-medium text-text-primary">Extraction Complete</span>
                  <span className="text-xs text-text-muted">— {sampleResults.length} metrics found</span>
                </div>
                <button
                  onClick={() => { setState('idle'); setFile(null); }}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Upload Another
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Metric</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Fund</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Value</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleResults.map((r, i) => (
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
                  ))}
                </tbody>
              </table>
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
              <button
                onClick={() => {
                  if (apiKey) sessionStorage.setItem('anthropic_key', apiKey);
                  setShowSettings(false);
                }}
                className="w-full py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer"
              >
                Save
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
