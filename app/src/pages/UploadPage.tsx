import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, Search, Settings, X, AlertTriangle, Globe, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { extractMetricsFromPDF, scrapeUrlForPdfs, extractMetricsFromPdfUrl } from '../utils/api';
import type { ScrapedPdfLink } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import type { Metric } from '../data/types';

type UploadState = 'idle' | 'file-ready' | 'processing' | 'complete' | 'error';
type Tab = 'upload' | 'scrape';
type ScrapeState = 'idle' | 'scanning' | 'results' | 'extracting' | 'complete' | 'error';

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

function highlightEvidence(evidence: string, value: string): React.ReactNode {
  const candidates: string[] = [value];

  const numMatch = value.match(/^[\$\u20AC]?([\d,.]+)/);
  if (numMatch) {
    const rawNum = numMatch[1].replace(/,/g, '');
    const num = parseFloat(rawNum);
    if (num >= 1_000_000_000) candidates.push(`$${num / 1_000_000_000} billion`);
    if (num >= 1_000_000) candidates.push(`$${num / 1_000_000}M`, `$${num / 1_000_000} million`);
    candidates.push(numMatch[0]);
  }

  const pctMatch = value.match(/([\d.]+%)/);
  if (pctMatch) candidates.push(pctMatch[1]);

  for (const candidate of candidates) {
    const idx = evidence.toLowerCase().indexOf(candidate.toLowerCase());
    if (idx !== -1) {
      const before = evidence.slice(0, idx);
      const match = evidence.slice(idx, idx + candidate.length);
      const after = evidence.slice(idx + candidate.length);
      return (
        <>
          {before}<span className="font-bold text-accent-light not-italic">{match}</span>{after}
        </>
      );
    }
  }

  return evidence;
}

export function UploadPage() {
  // Upload tab state
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
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Tab & scrape state
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeState, setScrapeState] = useState<ScrapeState>('idle');
  const [pdfLinks, setPdfLinks] = useState<ScrapedPdfLink[]>([]);
  const [selectedPdfs, setSelectedPdfs] = useState<Set<string>>(new Set());
  const [scrapeError, setScrapeError] = useState('');
  const [scrapeMetrics, setScrapeMetrics] = useState<Metric[]>([]);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0, currentFile: '' });

  useEffect(() => {
    let key = sessionStorage.getItem('anthropic_key');
    if (!key) {
      const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (envKey) {
        sessionStorage.setItem('anthropic_key', envKey);
        key = envKey;
      }
    }
    if (key) {
      setApiKey(key);
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
      // Demo mode — no API key set
      setExtractedMetrics(null);
      // Let the processing animation auto-complete via the useEffect timer
    }
  };

  useEffect(() => {
    if (state !== 'processing') return;
    const timer = setInterval(() => {
      setMsgIdx(prev => (prev >= processingMessages.length - 1 ? prev : prev + 1));
    }, 700);
    const storedKey = sessionStorage.getItem('anthropic_key');
    let complete: ReturnType<typeof setTimeout> | undefined;
    if (!storedKey) {
      complete = setTimeout(() => setState('complete'), 3500);
    }
    return () => { clearInterval(timer); if (complete) clearTimeout(complete); };
  }, [state]);

  // Scrape handlers
  const handleScan = async () => {
    const trimmed = scrapeUrl.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      setScrapeError('Please enter a valid URL (e.g. https://example.com)');
      setScrapeState('error');
      return;
    }
    setScrapeState('scanning');
    setScrapeError('');
    setPdfLinks([]);
    setSelectedPdfs(new Set());
    setScrapeMetrics([]);
    try {
      const links = await scrapeUrlForPdfs(scrapeUrl);
      setPdfLinks(links);
      if (links.length === 0) {
        setScrapeError('No PDF links found on this page.');
        setScrapeState('error');
      } else {
        setSelectedPdfs(new Set(links.map(l => l.url)));
        setScrapeState('results');
        showToast(`Found ${links.length} PDF(s) on page`, 'success');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to scan URL';
      setScrapeError(message);
      setScrapeState('error');
      showToast(message, 'error');
    }
  };

  const handleExtractSelected = async () => {
    const storedKey = sessionStorage.getItem('anthropic_key');
    if (!storedKey) {
      showToast('Configure your Anthropic API key in settings first', 'error');
      return;
    }
    const selected = pdfLinks.filter(l => selectedPdfs.has(l.url));
    if (selected.length === 0) return;
    setScrapeState('extracting');
    setScrapeMetrics([]);
    setScrapeProgress({ current: 0, total: selected.length, currentFile: '' });
    const allMetrics: Metric[] = [];
    let successCount = 0;
    for (let i = 0; i < selected.length; i++) {
      setScrapeProgress({ current: i + 1, total: selected.length, currentFile: selected[i].filename });
      try {
        const result = await extractMetricsFromPdfUrl(selected[i].url, storedKey);
        allMetrics.push(...result.metrics);
        successCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        showToast(`Failed: ${selected[i].filename} \u2014 ${message}`, 'error');
      }
    }
    setScrapeMetrics(allMetrics);
    setScrapeState('complete');
    if (successCount > 0) {
      showToast(`Extracted ${allMetrics.length} metrics from ${successCount} PDF(s)`, 'success');
    }
  };

  const togglePdf = (url: string) => {
    setSelectedPdfs(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAllPdfs = () => {
    setSelectedPdfs(selectedPdfs.size === pdfLinks.length ? new Set() : new Set(pdfLinks.map(l => l.url)));
  };

  const hasApiKey = isLiveMode || !!sessionStorage.getItem('anthropic_key');
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

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-bg-card border border-border rounded-lg p-1 max-w-xs">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            activeTab === 'upload' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload PDF
        </button>
        <button
          onClick={() => setActiveTab('scrape')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
            activeTab === 'scrape' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Scrape URL
        </button>
      </div>

      {/* ── Upload Tab ── */}
      {activeTab === 'upload' && (
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer ${
                  isDragging ? 'border-accent bg-accent-glow' : 'border-border hover:border-border-light'
                }`}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf';
                  input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
                  input.click();
                }}
              >
                <Upload className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <p className="text-text-primary font-medium mb-1">Drop a PDF here or click to browse</p>
                <p className="text-sm text-text-muted">Supports pension fund meeting minutes, transaction reports, and performance updates</p>
              </div>
              {!hasApiKey && <p className="text-xs text-text-muted text-center mt-3">Demo mode \u2014 configure API key in settings for live extraction</p>}
            </motion.div>
          )}

          {state === 'file-ready' && file && (
            <motion.div key="file-ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div className="bg-bg-card border border-border rounded-xl p-6 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                  <CheckCircle className="w-12 h-12 text-green mx-auto mb-4" />
                </motion.div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-text-muted" />
                  <span className="text-text-primary font-medium">{file.name}</span>
                </div>
                <p className="text-sm text-text-muted mb-1">{file.size}</p>
                {hasApiKey ? <p className="text-xs text-green mb-4">Live extraction enabled</p> : <p className="text-xs text-text-muted mb-4">Demo mode</p>}
                <button onClick={handleExtract} className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer">
                  Extract Metrics
                </button>
              </div>
            </motion.div>
          )}

          {state === 'processing' && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto flex flex-col items-center py-16">
              <div className="relative mb-8">
                <motion.div
                  className="w-20 h-20 rounded-2xl border-2 border-accent/30 flex items-center justify-center"
                  animate={{ borderColor: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.7)', 'rgba(99,102,241,0.3)'], boxShadow: ['0 0 20px rgba(99,102,241,0.1)', '0 0 40px rgba(99,102,241,0.25)', '0 0 20px rgba(99,102,241,0.1)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                    <Search className="w-8 h-8 text-accent-light" />
                  </motion.div>
                </motion.div>
              </div>
              <AnimatePresence mode="wait">
                <motion.p key={msgIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-text-secondary">
                  {processingMessages[msgIdx]}
                </motion.p>
              </AnimatePresence>
              {hasApiKey && <p className="text-xs text-text-muted mt-4">Sending to Claude API...</p>}
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div className="bg-bg-card border border-red/30 rounded-xl p-6 text-center">
                <AlertTriangle className="w-12 h-12 text-red mx-auto mb-4" />
                <h3 className="text-text-primary font-semibold mb-2">Extraction Failed</h3>
                <p className="text-sm text-text-secondary mb-6">{errorMessage}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleExtract} className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer">Retry</button>
                  <button onClick={() => { setState('idle'); setFile(null); setRawFile(null); }} className="px-6 py-2.5 rounded-lg bg-bg-hover border border-border text-text-secondary font-medium hover:text-text-primary transition-colors cursor-pointer">Upload Different File</button>
                </div>
              </div>
            </motion.div>
          )}

          {state === 'complete' && (
            <motion.div key="complete" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto">
              <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green" />
                    <span className="text-sm font-medium text-text-primary">Extraction Complete</span>
                    <span className="text-xs text-text-muted">
                      \u2014 {displayResults ? displayResults.length : sampleResults.length} metrics found
                      {!displayResults && ' (demo)'}
                    </span>
                  </div>
                  <button onClick={() => { setState('idle'); setFile(null); setRawFile(null); setExtractedMetrics(null); }} className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">Upload Another</button>
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
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase w-8"></th>
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
                      {displayResults ? displayResults.map((r, i) => (
                        <React.Fragment key={i}>
                          <motion.tr
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.05, 1) }}
                            className={`border-b border-border/30 cursor-pointer hover:bg-bg-hover/50 transition-colors ${expandedRow === i ? 'bg-bg-hover/30' : ''}`}
                            onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          >
                            <td className="px-4 py-3 text-text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-3 text-text-primary whitespace-nowrap">{r.lp}</td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.metric === 'Commitment' ? 'bg-green/20 text-green-light' : r.metric === 'Termination' ? 'bg-red/20 text-red' : r.metric === 'Fee Structure' ? 'bg-yellow/20 text-yellow' : 'bg-accent/20 text-accent-light'}`}>{r.metric}</span></td>
                            <td className="px-4 py-3 text-text-primary max-w-48 truncate">{r.fund}</td>
                            <td className="px-4 py-3 text-text-primary font-mono text-xs">{r.value}</td>
                            <td className="px-4 py-3 text-text-muted">
                              {expandedRow === i ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </td>
                          </motion.tr>
                          <AnimatePresence>
                            {expandedRow === i && (
                              <motion.tr
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <td colSpan={6} className="px-6 py-5 bg-bg-tertiary border-b border-border">
                                  <div className="flex gap-8">
                                    <div className="space-y-2 min-w-56">
                                      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Metadata</h4>
                                      {[
                                        ['LP', r.lp],
                                        ['Fund', r.fund],
                                        ['GP/Manager', r.gp],
                                        ['Strategy', r.asset_class],
                                        ['Page', r.page ? String(r.page) : '—'],
                                        ['Confidence', r.confidence],
                                      ].map(([label, val]) => (
                                        <div key={label} className="flex text-sm">
                                          <span className="text-text-muted w-24 shrink-0">{label}</span>
                                          <span className={`text-text-primary ${label === 'Confidence' ? (val === 'high' ? 'text-green' : val === 'medium' ? 'text-yellow' : 'text-red') : ''}`}>{val || '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Source Evidence</h4>
                                      {r.evidence ? (
                                        <blockquote className="border-l-2 border-accent/40 pl-4 py-2 bg-bg-card rounded-r-lg">
                                          <p className="text-sm text-text-secondary leading-relaxed italic">
                                            &ldquo;{highlightEvidence(r.evidence, r.value)}&rdquo;
                                          </p>
                                        </blockquote>
                                      ) : (
                                        <p className="text-sm text-text-muted italic">No evidence text available</p>
                                      )}
                                      <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                                        <FileText className="w-3 h-3" />
                                        {r.source}{r.page ? ` — Page ${r.page}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      )) : displaySample?.map((r, i) => (
                        <motion.tr key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="border-b border-border/30">
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green/20 text-green-light">{r.metric}</span></td>
                          <td className="px-4 py-3 text-text-primary">{r.fund}</td>
                          <td className="px-4 py-3 text-text-primary font-mono text-xs">{r.value}</td>
                          <td className="px-4 py-3"><span className={`text-xs ${r.confidence === 'high' ? 'text-green' : 'text-yellow'}`}>{r.confidence}</span></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Scrape URL Tab ── */}
      {activeTab === 'scrape' && (
        <AnimatePresence mode="wait">
          {scrapeState === 'idle' && (
            <motion.div key="scrape-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div className="bg-bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Globe className="w-8 h-8 text-accent-light" />
                  <div>
                    <h3 className="text-text-primary font-medium">Scrape PDFs from URL</h3>
                    <p className="text-sm text-text-muted">Paste a pension fund webpage to find and extract PDFs</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
                    placeholder="https://www.isbinvestment.com/meeting-minutes/"
                    className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                  />
                  <button
                    onClick={handleScan}
                    disabled={!scrapeUrl.trim()}
                    className="px-5 py-2.5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Scan
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-text-muted">Try:</span>
                  {[
                    { label: 'ISBI Minutes', url: 'https://www.isbinvestment.com/meeting-minutes/' },
                    { label: 'ISBI Investments', url: 'https://www.isbinvestment.com/investments/' },
                    { label: 'SAMCERA Reports', url: 'https://www.samcera.gov/investments-financials/financial-reports' },
                    { label: 'Minnesota SBI', url: 'https://msbi.us/annual-reports' },
                  ].map(({ label, url }) => (
                    <button
                      key={url}
                      onClick={() => setScrapeUrl(url)}
                      className="px-2.5 py-1 rounded-md bg-bg-hover border border-border text-xs text-text-muted hover:text-accent-light hover:border-accent/30 transition-all cursor-pointer"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {!hasApiKey && (
                <p className="text-xs text-text-muted text-center mt-3">
                  Scanning works without API key \u2014 extraction requires one (configure in settings)
                </p>
              )}
            </motion.div>
          )}

          {scrapeState === 'scanning' && (
            <motion.div key="scrape-scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto flex flex-col items-center py-16">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="mb-6">
                <Loader2 className="w-12 h-12 text-accent-light" />
              </motion.div>
              <p className="text-text-secondary mb-2">Scanning page for PDF links...</p>
              <p className="text-xs text-text-muted truncate max-w-md">{scrapeUrl}</p>
            </motion.div>
          )}

          {scrapeState === 'results' && (
            <motion.div key="scrape-results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent-light" />
                    <span className="text-sm font-medium text-text-primary">{pdfLinks.length} PDF{pdfLinks.length !== 1 ? 's' : ''} found</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
                    <input type="checkbox" checked={selectedPdfs.size === pdfLinks.length} onChange={toggleAllPdfs} className="rounded border-border accent-[#6366f1]" />
                    Select all
                  </label>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {pdfLinks.map((link, i) => (
                    <motion.label
                      key={link.url}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-bg-hover transition-colors cursor-pointer"
                    >
                      <input type="checkbox" checked={selectedPdfs.has(link.url)} onChange={() => togglePdf(link.url)} className="rounded border-border accent-[#6366f1]" />
                      <FileText className="w-4 h-4 text-red/70 shrink-0" />
                      <span className="text-sm text-text-primary truncate flex-1" title={link.filename}>{link.filename}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-text-muted hover:text-accent-light transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </motion.label>
                  ))}
                </div>
                <div className="p-4 flex items-center justify-between">
                  <button onClick={() => { setScrapeState('idle'); setPdfLinks([]); setSelectedPdfs(new Set()); }} className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                    Scan different URL
                  </button>
                  <button
                    onClick={handleExtractSelected}
                    disabled={selectedPdfs.size === 0}
                    className="px-5 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Extract {selectedPdfs.size > 0 ? `${selectedPdfs.size} PDF${selectedPdfs.size !== 1 ? 's' : ''}` : 'Selected'}
                  </button>
                </div>
              </div>
              {!hasApiKey && <p className="text-xs text-yellow text-center mt-3">API key required for extraction \u2014 configure in settings</p>}
            </motion.div>
          )}

          {scrapeState === 'extracting' && (
            <motion.div key="scrape-extracting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto flex flex-col items-center py-16">
              <div className="relative mb-8">
                <motion.div
                  className="w-20 h-20 rounded-2xl border-2 border-accent/30 flex items-center justify-center"
                  animate={{ borderColor: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.7)', 'rgba(99,102,241,0.3)'], boxShadow: ['0 0 20px rgba(99,102,241,0.1)', '0 0 40px rgba(99,102,241,0.25)', '0 0 20px rgba(99,102,241,0.1)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                    <Search className="w-8 h-8 text-accent-light" />
                  </motion.div>
                </motion.div>
              </div>
              <p className="text-text-secondary mb-2">Extracting {scrapeProgress.current} of {scrapeProgress.total}...</p>
              <p className="text-xs text-text-muted truncate max-w-md">{scrapeProgress.currentFile}</p>
              <div className="w-48 h-1.5 bg-bg-hover rounded-full mt-4 overflow-hidden">
                <motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }} transition={{ duration: 0.3 }} />
              </div>
              <p className="text-xs text-text-muted mt-4">Sending to Claude API...</p>
            </motion.div>
          )}

          {scrapeState === 'error' && (
            <motion.div key="scrape-error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
              <div className="bg-bg-card border border-red/30 rounded-xl p-6 text-center">
                <AlertTriangle className="w-12 h-12 text-red mx-auto mb-4" />
                <h3 className="text-text-primary font-semibold mb-2">Scan Failed</h3>
                <p className="text-sm text-text-secondary mb-6">{scrapeError}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleScan} className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer">Retry</button>
                  <button onClick={() => { setScrapeState('idle'); setScrapeUrl(''); }} className="px-6 py-2.5 rounded-lg bg-bg-hover border border-border text-text-secondary font-medium hover:text-text-primary transition-colors cursor-pointer">Try Different URL</button>
                </div>
              </div>
            </motion.div>
          )}

          {scrapeState === 'complete' && (
            scrapeMetrics.length > 0 ? (
              <motion.div key="scrape-complete" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto">
                <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green" />
                      <span className="text-sm font-medium text-text-primary">Extraction Complete</span>
                      <span className="text-xs text-text-muted">\u2014 {scrapeMetrics.length} metrics from {pdfLinks.filter(l => selectedPdfs.has(l.url)).length} PDF(s)</span>
                    </div>
                    <button onClick={() => { setScrapeState('idle'); setScrapeMetrics([]); setPdfLinks([]); setSelectedPdfs(new Set()); setScrapeUrl(''); }} className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                      Start Over
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">LP</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Metric</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Fund</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Value</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase">Source</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {scrapeMetrics.map((r, i) => (
                          <React.Fragment key={i}>
                            <motion.tr
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i * 0.05, 1) }}
                              className={`border-b border-border/30 cursor-pointer hover:bg-bg-hover/50 transition-colors ${expandedRow === i ? 'bg-bg-hover/30' : ''}`}
                              onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                            >
                              <td className="px-4 py-3 text-text-muted whitespace-nowrap">{r.date}</td>
                              <td className="px-4 py-3 text-text-primary whitespace-nowrap">{r.lp}</td>
                              <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.metric === 'Commitment' ? 'bg-green/20 text-green-light' : r.metric === 'Termination' ? 'bg-red/20 text-red' : r.metric === 'Fee Structure' ? 'bg-yellow/20 text-yellow' : 'bg-accent/20 text-accent-light'}`}>{r.metric}</span></td>
                              <td className="px-4 py-3 text-text-primary max-w-48 truncate">{r.fund}</td>
                              <td className="px-4 py-3 text-text-primary font-mono text-xs">{r.value}</td>
                              <td className="px-4 py-3 text-text-muted text-xs max-w-32 truncate" title={r.source}>{r.source}</td>
                              <td className="px-4 py-3 text-text-muted">
                                {expandedRow === i ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </td>
                            </motion.tr>
                            <AnimatePresence>
                              {expandedRow === i && (
                                <motion.tr
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <td colSpan={7} className="px-6 py-5 bg-bg-tertiary border-b border-border">
                                    <div className="flex gap-8">
                                      <div className="space-y-2 min-w-56">
                                        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Metadata</h4>
                                        {[
                                          ['LP', r.lp],
                                          ['Fund', r.fund],
                                          ['GP/Manager', r.gp],
                                          ['Strategy', r.asset_class],
                                          ['Page', r.page ? String(r.page) : '—'],
                                          ['Confidence', r.confidence],
                                        ].map(([label, val]) => (
                                          <div key={label} className="flex text-sm">
                                            <span className="text-text-muted w-24 shrink-0">{label}</span>
                                            <span className={`text-text-primary ${label === 'Confidence' ? (val === 'high' ? 'text-green' : val === 'medium' ? 'text-yellow' : 'text-red') : ''}`}>{val || '—'}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="flex-1">
                                        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Source Evidence</h4>
                                        {r.evidence ? (
                                          <blockquote className="border-l-2 border-accent/40 pl-4 py-2 bg-bg-card rounded-r-lg">
                                            <p className="text-sm text-text-secondary leading-relaxed italic">
                                              &ldquo;{highlightEvidence(r.evidence, r.value)}&rdquo;
                                            </p>
                                          </blockquote>
                                        ) : (
                                          <p className="text-sm text-text-muted italic">No evidence text available</p>
                                        )}
                                        <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                                          <FileText className="w-3 h-3" />
                                          {r.source}{r.page ? ` — Page ${r.page}` : ''}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="scrape-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto">
                <div className="bg-bg-card border border-border rounded-xl p-6 text-center">
                  <AlertTriangle className="w-12 h-12 text-yellow mx-auto mb-4" />
                  <h3 className="text-text-primary font-semibold mb-2">No Metrics Extracted</h3>
                  <p className="text-sm text-text-secondary mb-6">The selected PDFs did not contain extractable financial metrics.</p>
                  <button onClick={() => { setScrapeState('results'); setScrapeMetrics([]); }} className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-light transition-colors cursor-pointer">
                    Try Other PDFs
                  </button>
                </div>
              </motion.div>
            )
          )}
        </AnimatePresence>
      )}

      {/* API Key Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-bg-secondary border border-border rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text-primary">API Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-text-muted hover:text-text-primary cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-text-muted mb-4">Enter your Anthropic API key to enable live PDF extraction. The key is stored in session only.</p>
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
                    if (apiKey) { sessionStorage.setItem('anthropic_key', apiKey); setIsLiveMode(true); showToast('API key saved \u2014 live extraction enabled', 'success'); }
                    else { sessionStorage.removeItem('anthropic_key'); setIsLiveMode(false); showToast('API key removed \u2014 demo mode', 'info'); }
                    setShowSettings(false);
                  }}
                  className="flex-1 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer"
                >
                  Save
                </button>
                {apiKey && (
                  <button
                    onClick={() => { setApiKey(''); sessionStorage.removeItem('anthropic_key'); setIsLiveMode(false); setShowSettings(false); showToast('API key removed', 'info'); }}
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
