import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { deduplicateMetrics, detectSearchIntents, discoverSourceCandidates, extractMetricsFromPdfUrl, fetchPdfPreviewSubset, saveRunArtifact, scrapeUrlForPdfs, selectBestPdfWithLLM, serverLog } from '../utils/api';
import type { PdfCandidate } from '../utils/api';
import { extractPdfPreviewText, scorePreviewText, scoreFreshness, earlyRejectCheck } from '../utils/pdfFilter';
import { assessLiveResult, computeCoverageScore, shouldAutoRetry } from '../utils/liveResultAssessment';
import { useAppContext } from '../context/AppContext';
import type { Metric, Page, PdfLink, PdfScorecard, ReviewedDocument, SearchIntent, Signal, SourceSearchCandidate } from '../data/types';
import { getFocusKeywords, getFocusMetricTargets, metricMatchesRequestedFocus } from '../utils/searchFocus';
import { formatDisplayValue } from '../utils/formatValue';

/* Metric badge colors — same as ResultsPage */
const TRACKER_METRIC_COLORS: Record<string, string> = {
  'Commitment': 'bg-green/20 text-green-light',
  'Termination': 'bg-red/20 text-red',
  'Performance': 'bg-blue/20 text-blue',
  'Co-Investment': 'bg-cyan/20 text-cyan',
  'Fee Structure': 'bg-yellow/20 text-yellow',
  'AUM': 'bg-purple/20 text-purple',
  'NAV': 'bg-purple/20 text-purple',
  'IRR': 'bg-cyan/20 text-cyan',
  'TVPI': 'bg-blue/20 text-blue',
  'DPI': 'bg-green/20 text-green-light',
  'Asset Allocation': 'bg-slate-500/20 text-slate-200',
  'Management Fee': 'bg-yellow/20 text-yellow',
  'Carry': 'bg-orange/20 text-orange',
  'Target Fund Size': 'bg-orange/20 text-orange',
  'Target Return': 'bg-blue/20 text-blue',
  'Distribution': 'bg-orange/20 text-orange',
  'Capital Call': 'bg-red/20 text-red',
};

/* Evidence highlighting — same as ResultsPage */
function trackerHighlightEvidence(evidence: string, value: string): React.ReactNode {
  const candidates: string[] = [value];
  const numMatch = value.match(/^[$\u20AC]?([\d,.]+)/);
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
      return <>{before}<span className="font-bold text-accent-light not-italic">{match}</span>{after}</>;
    }
  }
  return evidence;
}

interface LiveSearchTrackerCardProps {
  onNavigate: (page: Page) => void;
}

interface RankedPdfLink {
  link: PdfLink;
  score: number;
  reasons: string[];
}

interface PdfPreviewState {
  status: 'idle' | 'pending' | 'ready' | 'error';
  score: number;
  matchedKeywords: string[];
  matchedMetricTypes: string[];
  negativeSignals: string[];
  excerpt: string;
  numericSignalCount: number;
  pagesScanned: number;
}

interface SourceProbeState {
  status: 'idle' | 'pending' | 'ready' | 'error';
  pdfLinks: PdfLink[];
  pdfCount: number;
  bestPdfUrl: string;
  bestPdfFilename: string;
  bestPdfScore: number;
  matchedKeywords: string[];
  matchedMetricTypes: string[];
  negativeSignals: string[];
  summary: string;
}

const MAX_VISIBLE_PDFS = 40;
const MAX_RECOMMENDED_PDFS = 3;
const PDF_PREVIEW_CANDIDATE_COUNT = 12;
const PDF_PREVIEW_AUTOSELECT_THRESHOLD = 10;
const PDF_PREVIEW_STRONG_THRESHOLD = 20;
const SOURCE_PREFLIGHT_CANDIDATE_COUNT = 3;
const SOURCE_PREFLIGHT_PDF_COUNT = 3;

// Cost guardrails — explicit caps on pipeline breadth
const MAX_SOURCE_PAGES = 3;
const MAX_PREVIEW_PDFS = 5;
const MAX_EXTRACT_PDFS = 2;

const EMPTY_PREVIEW_STATES: Record<string, PdfPreviewState> = {};
const EMPTY_SOURCE_PROBE_STATES: Record<string, SourceProbeState> = {};
const CLAUDE_EXTRACTION_LOG_MARKER = 'Sending to Claude for extraction...';

function softenSignalText(text: string): string {
  return text
    .replace(/\bnot available\b/gi, 'not found in reviewed files')
    .replace(/\bnot reported in this document\b/gi, 'not found in the reviewed documents')
    .replace(/\bis not reported\b/gi, 'was not found in reviewed documents')
    .replace(/\bdoes not contain\b/gi, 'did not contain');
}

function mapSignals(signals: { signal_type: string; description: string }[]): Signal[] {
  return signals.map((signal) => ({
    type: softenSignalText(signal.signal_type),
    description: softenSignalText(signal.description),
  }));
}

function formatReviewScope(count: number): string {
  return count === 1 ? '1 PDF reviewed' : `${count} PDFs reviewed`;
}

function buildReviewedDocument(
  link: PdfLink,
  sourceLabel: string,
  status: ReviewedDocument['status'],
  selectionRole: ReviewedDocument['selectionRole'],
  previewScore: number | null,
  previewNegativeSignals: string[],
  selectionReason: string,
  extras: Partial<ReviewedDocument> = {},
): ReviewedDocument {
  return {
    url: link.url,
    filename: link.filename,
    sourceLabel,
    status,
    selectionRole,
    selectionReason,
    previewScore,
    previewNegativeSignals,
    ...extras,
  };
}

function persistLog(message: string, status: string) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, status }),
  }).catch(() => {});
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function fileMatchesMetricType(text: string, metricType: string): boolean {
  switch (metricType) {
    case 'Asset Allocation':
      return includesAny(text, ['asset allocation', 'allocation']);
    case 'Target Fund Size':
      return includesAny(text, ['target fund size', 'fund size']);
    case 'Target Return':
      return includesAny(text, ['target return']);
    case 'Management Fee':
      return includesAny(text, ['management fee', 'mgmt fee']);
    case 'Co-Investment':
      return includesAny(text, ['co-investment', 'coinvestment', 'co investment']);
    case 'Capital Call':
      return includesAny(text, ['capital call', 'capital calls']);
    default:
      return includesAny(text, [metricType.toLowerCase()]);
  }
}

function isStrictAssetClassMatch(assetClass: string, hints: string[]): boolean {
  if (hints.length === 0) return true;
  const normalized = assetClass.toLowerCase();

  return hints.some((hint) => {
    const h = hint.toLowerCase();
    if (normalized.includes(h) || h.includes(normalized)) return true;
    if (h === 'infrastructure' && normalized.includes('infra')) return true;
    if (h === 'private equity' && (normalized.includes('pe') || normalized.includes('buyout'))) return true;
    if (h === 'real estate' && (normalized.includes('property') || normalized.includes('reit'))) return true;
    if (h === 'credit' && (normalized.includes('debt') || normalized.includes('lending') || normalized.includes('fixed income'))) return true;
    return false;
  });
}

function scorePdfLink(
  pdfLink: PdfLink,
  intents: SearchIntent[],
  query: string,
  documentType?: SourceSearchCandidate['documentType'],
): RankedPdfLink {
  const normalized = `${pdfLink.filename} ${pdfLink.url}`.toLowerCase();
  const focusMetricTypes = getFocusMetricTargets(query);
  const normalizedFocusMetricTypes = focusMetricTypes.map((metric) => metric.toLowerCase());
  const wantsSpecificPerformanceMetrics = normalizedFocusMetricTypes.some((metric) => ['irr', 'tvpi', 'dpi'].includes(metric));
  let score = 0;
  const reasons: string[] = [];

  if (/\b2026\b/.test(normalized)) {
    score += 8;
    reasons.push('2026');
  } else if (/\b2025\b/.test(normalized)) {
    score += 7;
    reasons.push('2025');
  } else if (/\b2024\b/.test(normalized)) {
    score += 4;
    reasons.push('2024');
  }

  if (includesAny(normalized, ['apr', 'april', 'mar', 'march', 'feb', 'january', 'jan', 'may', 'jun', 'june'])) {
    score += 2;
  }

  if (documentType === 'meeting' || documentType === 'minutes') {
    score += 2;
  }

  if (intents.includes('commitment') || intents.includes('board')) {
    if (includesAny(normalized, ['agenda', 'consent', 'minutes', 'board', 'meeting', 'packet', 'committee'])) {
      score += 12;
      reasons.push('board materials');
    }
    if (includesAny(normalized, ['investment', 'real-assets', 'real assets', 'infrastructure', 'private', 'alternatives', 'approval'])) {
      score += 8;
      reasons.push('investment activity');
    }
    if (includesAny(normalized, ['annual report', 'acfr', 'comprehensive', 'financial report', 'valuation'])) {
      score -= 10;
    }
  }

  if (intents.includes('performance')) {
    const matchedFocusMetrics = focusMetricTypes.filter((metric) => fileMatchesMetricType(normalized, metric));
    if (matchedFocusMetrics.length > 0) {
      score += matchedFocusMetrics.length * 16;
      reasons.push(matchedFocusMetrics.join(' + '));
    }

    // Strong boost for portfolio/disclosure reports — these are the files with IRR/TVPI/DPI
    if (includesAny(normalized, ['disclosure report', 'portfolio report', 'combined portfolio', 'portfolio quarterly'])) {
      score += wantsSpecificPerformanceMetrics ? 25 : 20;
      reasons.push('portfolio/disclosure report');
      // Extra bonus for filenames with both "quarterly" and "disclosure" (e.g. "Portfolio Quarterly Disclosure Report")
      if (normalized.includes('quarterly') && normalized.includes('disclosure')) {
        score += 8;
        reasons.push('quarterly disclosure');
      }
    } else if (includesAny(normalized, ['performance review', 'performance report', 'private markets', 'private market'])) {
      score += 12;
      reasons.push('performance report');
    }

    // Penalize financial statements — these are balance sheets (net position), not performance data
    if (includesAny(normalized, ['financial statement', 'quarterly statement', 'statement of', 'net position', 'fiduciary'])) {
      score -= 18;
      reasons.push('financial statement (not performance)');
    }

    // Compound penalty: "quarterly" + "statement" without performance context is almost certainly a balance sheet
    if (normalized.includes('quarterly') && normalized.includes('statement') && !includesAny(normalized, ['disclosure', 'portfolio', 'performance', 'private markets'])) {
      score -= 10;
      reasons.push('quarterly statement (no performance context)');
    }

    if (includesAny(normalized, ['irr', 'tvpi', 'dpi'])) {
      score += 16;
      reasons.push('target metrics');
    }
    if (includesAny(normalized, ['private equity', 'private credit', 'private real assets', 'real assets', 'alternatives', 'private'])) {
      score += 8;
      reasons.push('private markets');
    }
    if (!wantsSpecificPerformanceMetrics && includesAny(normalized, ['asset allocation', 'nav', 'aum'])) {
      score += 8;
      reasons.push('broad performance');
    }
    if (wantsSpecificPerformanceMetrics && includesAny(normalized, ['performance', 'private markets', 'combined', 'portfolio', 'quarterly'])) {
      score += 10;
      reasons.push('likely IRR/TVPI/DPI source');
    }
    if (wantsSpecificPerformanceMetrics && includesAny(normalized, ['private markets combined portfolio', 'combined portfolio report', 'private markets performance', 'performance review', 'disclosure report'])) {
      score += 12;
    }
    if (wantsSpecificPerformanceMetrics && includesAny(normalized, ['asset allocation', 'total fund', 'allocation'])) {
      score -= 14;
    } else if (includesAny(normalized, ['asset allocation', 'total fund'])) {
      score += 4;
      reasons.push('total fund summary');
    }
    if (includesAny(normalized, ['agenda', 'minutes', 'board'])) {
      score -= 6;
    }
  }

  if (intents.includes('financial')) {
    if (includesAny(normalized, ['annual report', 'acfr', 'financial', 'comprehensive', 'report'])) {
      score += 10;
      reasons.push('financial report');
    }
    if (includesAny(normalized, ['agenda', 'minutes', 'board'])) {
      score -= 6;
    }
  }

  // Freshness scoring
  const freshness = scoreFreshness(pdfLink.filename);
  if (freshness.score > 0) {
    score += freshness.score;
    if (freshness.year) reasons.push(`year:${freshness.year}`);
    if (freshness.quarter) reasons.push(`Q${freshness.quarter}`);
  }

  return { link: pdfLink, score, reasons };
}

function getRecommendationLabel(query: string, intents: SearchIntent[]): string {
  const focusMetrics = getFocusMetricTargets(query).map((metric) => metric.toLowerCase());

  if (intents.includes('commitment') || intents.includes('board')) {
    return 'For commitment questions, start with agendas, board packets, consent items, and minutes.';
  }
  if (intents.includes('performance')) {
    if (focusMetrics.some((metric) => ['irr', 'tvpi', 'dpi'].includes(metric))) {
      return 'For IRR, TVPI, and DPI questions, start with private-markets performance reviews or combined portfolio reports, not broad asset-allocation summaries.';
    }
    return 'For performance questions, start with quarterly or private-markets performance reports.';
  }
  if (intents.includes('financial')) {
    return 'For total-fund or financial questions, start with annual reports and ACFR-style files.';
  }
  return 'Start with the most recent files first.';
}

function getPreviewBadge(previewState?: PdfPreviewState): { label: string; className: string } | null {
  if (!previewState) {
    return null;
  }

  if (previewState.status === 'pending') {
    return { label: 'Previewing', className: 'border-border/70 bg-bg-hover text-text-muted' };
  }

  if (previewState.status === 'error') {
    return { label: 'Preview unavailable', className: 'border-border/70 bg-bg-hover text-text-muted' };
  }

  if (previewState.negativeSignals.some((signal) => signal.startsWith('early-rejected:'))) {
    return { label: 'Rejected in preview', className: 'border-red/25 bg-red/10 text-red' };
  }

  if (previewState.score >= PDF_PREVIEW_STRONG_THRESHOLD) {
    return { label: 'High confidence', className: 'border-green/25 bg-green/10 text-green-light' };
  }

  if (previewState.score >= PDF_PREVIEW_AUTOSELECT_THRESHOLD) {
    return { label: 'Likely match', className: 'border-accent/20 bg-accent/10 text-accent-light' };
  }

  if (previewState.matchedKeywords.length > 0) {
    return { label: 'Possible match', className: 'border-yellow/25 bg-yellow/10 text-yellow' };
  }

  return { label: 'Low signal', className: 'border-border/70 bg-bg-hover text-text-muted' };
}

function summarizeProbeSignal(probe: SourceProbeState): string {
  if (probe.status === 'pending') {
    return 'Checking PDFs on this source page...';
  }

  if (probe.status === 'error') {
    return 'Preview probe unavailable for this source.';
  }

  if (probe.status !== 'ready') {
    return '';
  }

  return probe.summary;
}

export function LiveSearchTrackerCard({ onNavigate }: LiveSearchTrackerCardProps) {
  const { apiKey, liveTracker, setLiveTracker, clearLiveTracker, setActiveResults } = useAppContext();
  const effectiveApiKey = apiKey || sessionStorage.getItem('anthropic_key') || import.meta.env.VITE_ANTHROPIC_API_KEY || '';
  const sourceAutoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfAutoExtractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractionRunningRef = useRef(false);
  const extractionLogScrollRef = useRef<HTMLDivElement | null>(null);
  const [claudeWaitStartedAt, setClaudeWaitStartedAt] = useState<number | null>(null);
  const [claudeWaitElapsedMs, setClaudeWaitElapsedMs] = useState(0);
  const [showAllPdfs, setShowAllPdfs] = useState(false);
  const [expandedEvidenceIdx, setExpandedEvidenceIdx] = useState<number | null>(null);
  const [showAdditionalCompletionRows, setShowAdditionalCompletionRows] = useState(false);
  const [previewStateStore, setPreviewStateStore] = useState<{
    sessionKey: string;
    byUrl: Record<string, PdfPreviewState>;
  }>({ sessionKey: '', byUrl: {} });
  const [sourceProbeStore, setSourceProbeStore] = useState<{
    sessionKey: string;
    byUrl: Record<string, SourceProbeState>;
  }>({ sessionKey: '', byUrl: {} });
  const liveTrackerId = liveTracker?.id;
  const liveTrackerStatus = liveTracker?.status;
  const liveTrackerSelectedPdfUrls = liveTracker?.selectedPdfUrls;
  const liveTrackerPdfLinks = liveTracker?.pdfLinks;
  const liveTrackerSelectedSource = liveTracker?.selectedSource ?? null;
  const liveTrackerSelectedSourceDocumentType = liveTracker?.selectedSource?.documentType;
  const liveTrackerQuery = liveTracker?.query ?? '';
  const liveTrackerMetrics = useMemo(() => liveTracker?.metrics ?? [], [liveTracker?.metrics]);
  const liveTrackerAssetClasses = useMemo(() => liveTracker?.assetClasses ?? [], [liveTracker?.assetClasses]);
  const previewSessionKey = `${liveTrackerId ?? 'no-tracker'}::${liveTrackerSelectedSource?.url ?? 'no-source'}`;
  const sourceProbeSessionKey = `${liveTrackerId ?? 'no-tracker'}::source-probe`;
  const pdfPreviewStates = useMemo(
    () => (previewStateStore.sessionKey === previewSessionKey ? previewStateStore.byUrl : EMPTY_PREVIEW_STATES),
    [previewStateStore, previewSessionKey],
  );
  const sourceProbeStates = useMemo(
    () => (sourceProbeStore.sessionKey === sourceProbeSessionKey ? sourceProbeStore.byUrl : EMPTY_SOURCE_PROBE_STATES),
    [sourceProbeSessionKey, sourceProbeStore],
  );
  const lastExtractionLog = liveTracker?.extractionLogs[liveTracker.extractionLogs.length - 1] ?? null;

  useEffect(() => {
    if (!liveTracker || liveTracker.status !== 'extracting') {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const el = extractionLogScrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    liveTracker?.status,
    liveTracker?.extractionLogs.length,
    liveTracker?.progress.current,
    liveTracker?.progress.currentFile,
  ]);

  useEffect(() => {
    const isWaitingOnClaude = !!lastExtractionLog
      && liveTracker?.status === 'extracting'
      && lastExtractionLog.message.includes(CLAUDE_EXTRACTION_LOG_MARKER);

    if (!isWaitingOnClaude) {
      setClaudeWaitStartedAt(null);
      setClaudeWaitElapsedMs(0);
      return;
    }

    setClaudeWaitStartedAt(Date.now());
    setClaudeWaitElapsedMs(0);
  }, [lastExtractionLog?.message, liveTracker?.status]);

  useEffect(() => {
    if (claudeWaitStartedAt === null) {
      return;
    }

    const tick = () => {
      setClaudeWaitElapsedMs(Date.now() - claudeWaitStartedAt);
    };

    tick();
    const intervalId = window.setInterval(tick, 100);

    return () => window.clearInterval(intervalId);
  }, [claudeWaitStartedAt]);

  useEffect(() => {
    setExpandedEvidenceIdx(null);
    setShowAdditionalCompletionRows(false);
  }, [liveTracker?.id, liveTracker?.status, liveTracker?.foundMetrics.length]);

  useEffect(() => {
    // Only depend on liveTrackerId — NOT liveTracker — so intermediate setLiveTracker calls
    // (progress messages, sourceCandidates) don't re-trigger and cancel this effect.
    if (!liveTracker || liveTracker.status !== 'finding_sources' || liveTracker.sourceCandidates.length > 0) {
      return;
    }

    const trackerQuery = liveTracker.query;
    const trackerPensionFunds = liveTracker.pensionFunds;
    let cancelled = false;

    async function runAutoFlow() {
      const pipelineStart = Date.now();
      const logs: { message: string; status: 'info' | 'done' | 'error' }[] = [];
      const timestamp = () => {
        const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
        return `[${elapsed}s]`;
      };
      const addLog = (msg: string, status: 'info' | 'done' | 'error' = 'info') => {
        const message = `${timestamp()} ${msg}`;
        logs.push({ message, status });
        persistLog(message, status);
        setLiveTracker((current) =>
          current ? { ...current, extractionLogs: [...logs] } : current,
        );
      };

      try {
        // Step 1: Discover source pages
        addLog('Searching for source pages...');
        setLiveTracker((current) =>
          current ? { ...current, message: 'Searching for sources...' } : current,
        );
        const candidates = await discoverSourceCandidates(trackerQuery, trackerPensionFunds);
        if (cancelled) return;

        if (candidates.length === 0) {
          addLog('No sources found', 'error');
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  errorMessage: 'No relevant documents found. Try a different search query.',
                  message: 'No relevant documents found.',
                }
              : current,
          );
          return;
        }

        addLog(`Found ${candidates.length} source pages`, 'done');
        for (const c of candidates.slice(0, 3)) {
          addLog(`  ${c.pensionFund} — ${c.label} (score ${c.score})`);
        }

        // Step 2: Scrape top sources for PDFs in parallel
        const topSources = candidates.slice(0, MAX_SOURCE_PAGES);
        addLog(`Scraping ${topSources.length} sources for PDF links...`);
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                sourceCandidates: candidates,
                message: `Found ${candidates.length} sources. Scanning for PDFs...`,
                errorMessage: '',
              }
            : current,
        );

        const scrapeResults = await Promise.all(
          topSources.map(async (source) => {
            try {
              const pdfs = await scrapeUrlForPdfs(source.url);
              addLog(`  ${source.label}: ${pdfs.length} PDFs`, 'done');
              return { source, pdfs };
            } catch {
              addLog(`  ${source.label}: failed to scrape`, 'error');
              return { source, pdfs: [] as PdfCandidate[] };
            }
          }),
        );
        if (cancelled) return;

        // Merge all PDFs into one list with source labels
        const allPdfs: PdfCandidate[] = [];
        const sourceByLabel = new Map<string, SourceSearchCandidate>();
        for (const { source, pdfs } of scrapeResults) {
          sourceByLabel.set(source.label, source);
          for (const pdf of pdfs) {
            allPdfs.push({ url: pdf.url, filename: pdf.filename, sourceLabel: source.label });
          }
        }
        // Default to the top-ranked source; overridden after PDF selection
        let bestSource = topSources[0];

        if (allPdfs.length === 0) {
          addLog('No PDFs found on any source page', 'error');
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  sourceCandidates: candidates,
                  status: 'choose_source',
                  message: 'No PDFs found. Try selecting a different source below.',
                  errorMessage: '',
                }
              : current,
          );
          return;
        }

        addLog(`Total: ${allPdfs.length} PDFs across ${topSources.length} sources`, 'done');

        // Step 3: Preview-score top PDF candidates before LLM selection
        const autoIntents = detectSearchIntents(trackerQuery);
        const autoFocusKws = getFocusKeywords(trackerQuery, autoIntents);
        const autoFocusMetrics = getFocusMetricTargets(trackerQuery);

        // Rank by filename heuristic first
        const heuristicRanked = allPdfs
          .map((pdf) => ({
            pdf,
            score: scorePdfLink({ url: pdf.url, filename: pdf.filename }, autoIntents, trackerQuery, undefined).score,
          }))
          .sort((a, b) => b.score - a.score);

        // Preview-score top candidates in parallel
        const previewCandidateCount = Math.min(heuristicRanked.length, MAX_PREVIEW_PDFS);
        addLog(`Previewing top ${previewCandidateCount} PDFs locally...`);
        setLiveTracker((current) =>
          current
            ? { ...current, message: `Previewing ${previewCandidateCount} PDFs to find best match...` }
            : current,
        );

        const previewResults = await Promise.allSettled(
          heuristicRanked.slice(0, previewCandidateCount).map(async ({ pdf, score: fnScore }) => {
            try {
              const subset = await fetchPdfPreviewSubset(pdf.url, [1, 2, 3]);
              const preview = await extractPdfPreviewText(subset, 3);

              // Early reject: catch corporate financials / wrong-entity docs before scoring
              const rejectCheck = earlyRejectCheck(preview.text, trackerQuery);
              if (rejectCheck.shouldReject) {
                addLog(`Rejected: ${pdf.filename} — ${rejectCheck.reason}`, 'info');
                return {
                  pdf: { ...pdf, previewScore: -100, previewMatchedMetrics: [], previewNegativeSignals: ['early-rejected'] } as PdfCandidate,
                  filenameScore: fnScore,
                  combinedScore: -100,
                  previewScore: -100,
                  matchedMetrics: [] as string[],
                  negativeSignals: ['early-rejected: ' + rejectCheck.reason],
                };
              }

              const pScore = scorePreviewText(preview.text, autoFocusKws, autoFocusMetrics);
              return {
                pdf: {
                  ...pdf,
                  previewScore: pScore.score,
                  previewMatchedMetrics: pScore.matchedMetricTypes,
                  previewNegativeSignals: pScore.negativeSignals,
                } as PdfCandidate,
                filenameScore: fnScore,
                combinedScore: fnScore + pScore.score + scoreFreshness(pdf.filename).score,
                previewScore: pScore.score,
                matchedMetrics: pScore.matchedMetricTypes,
                negativeSignals: pScore.negativeSignals,
              };
            } catch {
              return {
                pdf,
                filenameScore: fnScore,
                combinedScore: fnScore + scoreFreshness(pdf.filename).score,
                previewScore: 0,
                matchedMetrics: [] as string[],
                negativeSignals: [] as string[],
              };
            }
          }),
        );
        if (cancelled) return;

        // Build scorecards for debug
        const autoScorecards: PdfScorecard[] = [];
        const enrichedCandidates: PdfCandidate[] = [];
        for (const result of previewResults) {
          if (result.status === 'fulfilled') {
            const r = result.value;
            enrichedCandidates.push(r.pdf);
            autoScorecards.push({
              url: r.pdf.url,
              filename: r.pdf.filename,
              filenameScore: r.filenameScore,
              previewScore: r.previewScore,
              previewMatchedMetrics: r.matchedMetrics,
              previewNegativeSignals: r.negativeSignals,
              combinedScore: r.combinedScore,
              wasSelected: false,
            });
          }
        }

        // Filter out strong negative signals, sort by combined score
        const viableCandidates = enrichedCandidates
          .filter((c) => (c.previewScore ?? 0) >= -5)
          .sort((a, b) => (b.previewScore ?? 0) - (a.previewScore ?? 0));

        if (viableCandidates.length > 0) {
          const best = viableCandidates[0];
          addLog(
            `Best preview: ${best.filename} (score ${best.previewScore ?? 0}${best.previewMatchedMetrics?.length ? `, matched ${best.previewMatchedMetrics.join(', ')}` : ''})`,
            'done',
          );
        }

        // Include non-previewed PDFs as fallback
        const previewedUrls = new Set(enrichedCandidates.map((c) => c.url));
        const fallbackPdfs = allPdfs.filter((p) => !previewedUrls.has(p.url));
        const finalCandidates = [...viableCandidates, ...fallbackPdfs];

        // Step 4: LLM picks from enriched candidates
        addLog('Asking AI to confirm best PDF...');
        setLiveTracker((current) =>
          current
            ? { ...current, message: `Found ${allPdfs.length} PDFs. Confirming best match...` }
            : current,
        );

        let selectedPdfs = finalCandidates.slice(0, 2); // fallback
        if (effectiveApiKey) {
          try {
            selectedPdfs = await selectBestPdfWithLLM(finalCandidates.slice(0, 15), trackerQuery, effectiveApiKey);
            addLog(`AI selected: ${selectedPdfs.map((p) => p.filename).join(', ')}`, 'done');
          } catch {
            addLog('AI selection unavailable, using preview ranking', 'error');
            selectedPdfs = finalCandidates.slice(0, 2);
          }
        }
        if (cancelled) return;

        // Mark selected in scorecards
        const selectedUrlSet = new Set(selectedPdfs.map((p) => p.url));
        for (const sc of autoScorecards) {
          sc.wasSelected = selectedUrlSet.has(sc.url);
        }

        const bestPdf = selectedPdfs[0];

        // Fix provenance: bestSource must reflect the actual selected PDF's source, not PDF count
        if (bestPdf?.sourceLabel) {
          const matchedSource = sourceByLabel.get(bestPdf.sourceLabel)
            ?? candidates.find((c) => c.label === bestPdf.sourceLabel);
          if (matchedSource) {
            bestSource = matchedSource;
          }
        }

        if (!bestPdf) {
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  status: 'choose_source',
                  sourceCandidates: candidates,
                  message: 'Could not identify a strong PDF match. Try selecting a source below.',
                  errorMessage: '',
                }
              : current,
          );
          return;
        }

        // Step 5: Auto-select and go straight to extracting
        const rankedPdfLinks = finalCandidates.map((p) => ({ url: p.url, filename: p.filename }));
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                sourceCandidates: candidates,
                selectedSource: bestSource,
                pdfLinks: rankedPdfLinks,
                selectedPdfUrls: [bestPdf.url],
                scorecards: autoScorecards,
                status: 'extracting',
                message: `Best match: ${bestPdf.filename}. Extracting metrics...`,
                extractionLogs: [...logs, { message: `Starting ${bestPdf.filename}`, status: 'info' as const }],
                progress: { current: 0, total: 1, currentFile: '' },
                errorMessage: '',
              }
            : current,
        );
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : 'Search failed. Please try again.';
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                status: 'error',
                errorMessage: message,
                message,
              }
            : current,
        );
      }
    }

    void runAutoFlow();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally depend on liveTrackerId only, not liveTracker
  }, [effectiveApiKey, liveTrackerId, setLiveTracker]);

  useEffect(() => {
    if (
      !liveTracker ||
      liveTracker.status !== 'scanning_pdfs' ||
      !liveTracker.selectedSource ||
      liveTracker.pdfLinks.length > 0
    ) {
      return;
    }

    const selectedSource = liveTracker.selectedSource;
    if (!selectedSource) {
      return;
    }

    const tracker = {
      ...liveTracker,
      selectedSource,
    };
    let cancelled = false;

    async function runScan() {
      try {
        const pdfLinks = await scrapeUrlForPdfs(tracker.selectedSource.url);
        if (cancelled) return;

        if (pdfLinks.length === 0) {
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  errorMessage: 'No PDF documents found on this source.',
                  message: 'No PDF links found on the selected page.',
                }
              : current,
          );
          return;
        }

        setLiveTracker((current) =>
          current
            ? {
                ...current,
                pdfLinks,
                selectedPdfUrls: [],
                status: 'selecting_pdfs',
                message: `Found ${pdfLinks.length} PDF${pdfLinks.length === 1 ? '' : 's'} to review. Nothing is selected yet.`,
                errorMessage: '',
              }
            : current,
        );
      } catch (error) {
        if (cancelled) return;

        const message = error instanceof Error ? error.message : 'Failed to scan this source for documents.';
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                status: 'error',
                errorMessage: message,
                message,
              }
            : current,
        );
      }
    }

    void runScan();

    return () => {
      cancelled = true;
    };
  }, [liveTracker, setLiveTracker]);

  useEffect(() => {
    if (
      !liveTrackerId ||
      liveTrackerStatus !== 'extracting' ||
      !liveTrackerSelectedPdfUrls ||
      liveTrackerSelectedPdfUrls.length === 0 ||
      !liveTrackerPdfLinks
    ) {
      return;
    }

    // Prevent re-entry: the auto-retry updates selectedPdfUrls which would
    // re-trigger this effect. If extraction is already running, bail out.
    if (extractionRunningRef.current) {
      return;
    }
    extractionRunningRef.current = true;

    const tracker = {
      id: liveTrackerId,
      selectedPdfUrls: liveTrackerSelectedPdfUrls,
      pdfLinks: liveTrackerPdfLinks,
    };
    let cancelled = false;

    async function runExtraction() {
      if (!effectiveApiKey) {
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                status: 'error',
                errorMessage: 'Configure your Anthropic API key in settings before extracting.',
                message: 'Anthropic API key required for extraction.',
              }
            : current,
        );
        return;
      }

      const extractionStartTime = Date.now();
      let retryPdfUrl: string | null = null;

      const selectedPdfLinks = tracker.pdfLinks
        .filter((link) => tracker.selectedPdfUrls.includes(link.url))
        .slice(0, MAX_EXTRACT_PDFS);
      const allMetrics: Metric[] = [];
      const allSignals: Signal[] = [];
      const reviewedDocumentsByUrl = new Map<string, ReviewedDocument>();
      let totalCostUsd = 0;
      const selectedSourceLabel = liveTrackerSelectedSource
        ? `${liveTrackerSelectedSource.pensionFund} - ${liveTrackerSelectedSource.label}`
        : 'Live search tracker';
      const reviewScope = formatReviewScope(selectedPdfLinks.length);

      const appendExtractionLog = (
        message: string,
        status: 'info' | 'done' | 'error' = 'info',
        persistToDisk = true,
      ) => {
        const elapsed = ((Date.now() - extractionStartTime) / 1000).toFixed(1);
        const line = `[${elapsed}s] ${message}`;
        if (persistToDisk) {
          persistLog(line, status);
        }
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                extractionLogs: [...current.extractionLogs, { message: line, status }],
              }
            : current,
        );
      };

      const rememberReviewedDocument = (
        link: PdfLink,
        status: ReviewedDocument['status'],
        selectionRole: ReviewedDocument['selectionRole'],
        selectionReason: string,
        options: Partial<ReviewedDocument> = {},
      ) => {
        const preview = pdfPreviewStates[link.url];
        reviewedDocumentsByUrl.set(
          link.url,
          buildReviewedDocument(
            link,
            liveTrackerSelectedSource?.label ?? '',
            status,
            selectionRole,
            preview?.status === 'ready' ? preview.score : null,
            preview?.status === 'ready' ? preview.negativeSignals : [],
            selectionReason,
            {
              sourceUrl: liveTrackerSelectedSource?.url ?? '',
              previewMatchedMetrics: preview?.status === 'ready' ? preview.matchedMetricTypes : [],
              previewPagesScanned: preview?.status === 'ready' ? preview.pagesScanned : undefined,
              pagesReviewed: options.reviewedPages?.length,
              ...options,
            },
          ),
        );
      };

      appendExtractionLog(`Selected source: ${selectedSourceLabel}`, 'done');
      appendExtractionLog(`Review scope: ${reviewScope}`, 'done');

      for (let index = 0; index < selectedPdfLinks.length; index += 1) {
        const pdfLink = selectedPdfLinks[index];
        if (cancelled) return;

        setLiveTracker((current) =>
          current
            ? {
                ...current,
                progress: {
                  current: index + 1,
                  total: selectedPdfLinks.length,
                  currentFile: pdfLink.filename,
                },
              }
            : current,
        );
        appendExtractionLog(`Starting ${pdfLink.filename}`, 'info');

        const log = (message: string, status: 'info' | 'done' | 'error' = 'info') => {
          appendExtractionLog(message, status, false);
        };

        try {
          const focusQuery = [
            liveTrackerQuery,
            liveTrackerMetrics.length ? `Focus metrics: ${liveTrackerMetrics.join(', ')}` : '',
            liveTrackerAssetClasses.length ? `Asset classes: ${liveTrackerAssetClasses.join(', ')}` : '',
          ].filter(Boolean).join(' | ');
          const result = await extractMetricsFromPdfUrl(pdfLink.url, effectiveApiKey, log, {
            focusQuery,
          });
          if (cancelled) return;
          totalCostUsd += result.costUsd ?? 0;
          if (result.wasEarlyRejected || result.metadata.document_type === 'rejected') {
            rememberReviewedDocument(
              pdfLink,
              'rejected',
              'selected',
              result.skipReason ?? 'preview rejected before extraction',
              {
                reviewedPages: result.reviewedPageNumbers,
                totalPages: result.totalPages,
                pageSubsetStrategy: result.pageSubsetStrategy,
                skipReason: result.skipReason,
                costUsd: result.costUsd,
                elapsedSec: result.elapsedSec,
              },
            );
            appendExtractionLog(`${pdfLink.filename} was rejected before extraction.`, 'info');
            continue;
          }
          allMetrics.push(...result.metrics);
          allSignals.push(...mapSignals(result.signals));
          rememberReviewedDocument(
            pdfLink,
            'extracted',
            'selected',
            'initial selection',
            {
              reviewedPages: result.reviewedPageNumbers,
              totalPages: result.totalPages,
              pageSubsetStrategy: result.pageSubsetStrategy,
              costUsd: result.costUsd,
              elapsedSec: result.elapsedSec,
            },
          );
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : 'Extraction failed';
          rememberReviewedDocument(pdfLink, 'failed', 'selected', message, { skipReason: message });
          log(`Error: ${message}`, 'error');
        }
      }

      if (cancelled) return;

      // Auto-retry: if we found no usable metrics or only partial coverage, try the next best PDF.
      const retryFocusMetrics = getFocusMetricTargets(liveTrackerQuery);
      if ((allMetrics.length === 0 || shouldAutoRetry(allMetrics, retryFocusMetrics, 1)) && !cancelled) {
        const extractedUrls = new Set(tracker.selectedPdfUrls);
        const nextPdf = tracker.pdfLinks.find((link) => !extractedUrls.has(link.url));
        if (nextPdf) {
          retryPdfUrl = nextPdf.url;
          const coverage = computeCoverageScore(allMetrics, retryFocusMetrics, liveTrackerAssetClasses);
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  selectedPdfUrls: [...current.selectedPdfUrls, nextPdf.url],
                  extractionLogs: [
                    ...current.extractionLogs,
                    {
                      message: `Found ${coverage.foundTypes.length} of ${retryFocusMetrics.length} requested metrics — retrying ${nextPdf.filename}${coverage.missingTypes.length > 0 ? ` (missing ${coverage.missingTypes.join(', ')})` : ''}.`,
                      status: 'info' as const,
                    },
                  ],
                  progress: {
                    current: selectedPdfLinks.length + 1,
                    total: selectedPdfLinks.length + 1,
                    currentFile: nextPdf.filename,
                  },
                }
              : current,
          );

          const retryLog = (message: string, status: 'info' | 'done' | 'error' = 'info') => {
            appendExtractionLog(message, status, false);
          };

          try {
            const retryFocusQuery = [
              liveTrackerQuery,
              liveTrackerMetrics.length ? `Focus metrics: ${liveTrackerMetrics.join(', ')}` : '',
              liveTrackerAssetClasses.length ? `Asset classes: ${liveTrackerAssetClasses.join(', ')}` : '',
            ].filter(Boolean).join(' | ');
            retryLog(`Retrying with ${nextPdf.filename} after partial coverage`, 'info');
            const retryResult = await extractMetricsFromPdfUrl(nextPdf.url, effectiveApiKey, retryLog, {
              focusQuery: retryFocusQuery,
            });
            if (!cancelled) {
              totalCostUsd += retryResult.costUsd ?? 0;
              if (retryResult.wasEarlyRejected || retryResult.metadata.document_type === 'rejected') {
                rememberReviewedDocument(
                  nextPdf,
                  'rejected',
                  'retried',
                  retryResult.skipReason ?? 'retry rejected before extraction',
                  {
                    reviewedPages: retryResult.reviewedPageNumbers,
                    totalPages: retryResult.totalPages,
                    pageSubsetStrategy: retryResult.pageSubsetStrategy,
                    skipReason: retryResult.skipReason,
                    costUsd: retryResult.costUsd,
                    elapsedSec: retryResult.elapsedSec,
                  },
                );
                retryLog(`Retry stopped before extraction: ${nextPdf.filename}`, 'error');
              } else {
                allMetrics.push(...retryResult.metrics);
                allSignals.push(...mapSignals(retryResult.signals));
                const dedupedMetrics = deduplicateMetrics(allMetrics);
                allMetrics.length = 0;
                allMetrics.push(...dedupedMetrics);
                rememberReviewedDocument(
                  nextPdf,
                  'extracted',
                  'retried',
                  'auto-retry after partial coverage',
                  {
                    reviewedPages: retryResult.reviewedPageNumbers,
                    totalPages: retryResult.totalPages,
                    pageSubsetStrategy: retryResult.pageSubsetStrategy,
                    costUsd: retryResult.costUsd,
                    elapsedSec: retryResult.elapsedSec,
                  },
                );

              const finalCoverage = computeCoverageScore(allMetrics, retryFocusMetrics, liveTrackerAssetClasses);
              retryLog(
                `After retry: found ${finalCoverage.foundTypes.length} of ${retryFocusMetrics.length} requested metrics${finalCoverage.missingTypes.length > 0 ? ` — still missing ${finalCoverage.missingTypes.join(', ')}` : ''}`,
                'done',
              );
              retryLog(`Retry PDF used: ${nextPdf.filename}`, 'done');
              }
            }
          } catch (error) {
            if (!cancelled) {
              const msg = error instanceof Error ? error.message : 'Retry extraction failed';
              rememberReviewedDocument(nextPdf, 'failed', 'retried', msg, { skipReason: msg });
              retryLog(`Retry error: ${msg}`, 'error');
            }
          }
        }
      }

      if (allMetrics.length === 0) {
        const reviewedDocuments = Array.from(reviewedDocumentsByUrl.values());
        const allRejectedEarly = reviewedDocuments.length > 0
          && reviewedDocuments.every((document) => document.status === 'rejected');
        const rejectSummary = allRejectedEarly
          ? reviewedDocuments
            .map((document) => `${document.filename}: ${document.skipReason ?? 'preview rejected before extraction'}`)
            .join(' | ')
          : 'No metrics were extracted from the reviewed PDFs.';
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                status: 'error',
                errorMessage: rejectSummary,
                message: allRejectedEarly
                  ? 'All reviewed PDFs were stopped before Claude extraction.'
                  : 'No metrics extracted from the reviewed PDFs.',
                progress: {
                  current: 0,
                  total: 0,
                  currentFile: '',
                },
              }
            : current,
        );
        return;
      }

      const selectedPdf = selectedPdfLinks[0] ?? null;
      const reviewedDocuments = Array.from(reviewedDocumentsByUrl.values());
      const finalReviewScope = formatReviewScope(reviewedDocuments.length);
      const skippedDocuments = tracker.pdfLinks
        .slice(0, PDF_PREVIEW_CANDIDATE_COUNT)
        .map((link) => {
          const preview = pdfPreviewStates[link.url];
          const rejectSignals = preview?.status === 'ready'
            ? preview.negativeSignals.filter((signal) => signal.startsWith('early-rejected:'))
            : [];
          if (!preview || preview.status !== 'ready' || rejectSignals.length === 0) return null;
          if (tracker.selectedPdfUrls.includes(link.url)) return null;
          return buildReviewedDocument(
            link,
            liveTrackerSelectedSource?.label ?? '',
            'rejected',
            'skipped',
            preview.score,
            rejectSignals,
            rejectSignals.join('; '),
            {
              previewMatchedMetrics: preview.matchedMetricTypes,
              previewPagesScanned: preview.pagesScanned,
              reviewedPages: Array.from({ length: preview.pagesScanned }, (_, index) => index + 1),
              pagesReviewed: preview.pagesScanned,
              pageSubsetStrategy: 'preview-only',
              skipReason: rejectSignals.join('; '),
            },
          );
        })
        .filter((record): record is ReviewedDocument => record !== null)
        .slice(0, 3);
      const sourceCandidateRecords = (liveTracker?.sourceCandidates ?? [])
        .slice(0, 3)
        .map((candidate) => ({
          label: candidate.label,
          url: candidate.url,
          documentType: candidate.documentType,
          score: candidate.score,
          matchedKeywords: candidate.matchedKeywords,
        }));
      const reviewedPages = Array.from(new Set(
        reviewedDocuments.flatMap((document) => document.reviewedPages ?? []),
      )).sort((a, b) => a - b);
      const totalPages = reviewedDocuments.reduce(
        (max, document) => Math.max(max, document.totalPages ?? 0),
        0,
      );
      const extractionDurationSec = (Date.now() - extractionStartTime) / 1000;
      const assessment = assessLiveResult({
        query: liveTrackerQuery,
        metrics: allMetrics,
        selectedSource: liveTrackerSelectedSource,
        documentCount: reviewedDocuments.length,
        assetClassHints: liveTrackerAssetClasses,
      });
      appendExtractionLog(
        assessment
          ? `Final completeness: ${assessment.completeness}${assessment.missingFocusMetrics.length > 0 ? ` — missing ${assessment.missingFocusMetrics.join(', ')}` : ''}`
          : 'Final completeness: unknown',
        assessment?.isWeakMatch ? 'error' : assessment?.completeness === 'partial' ? 'info' : 'done',
      );
      serverLog('LIVE_EXTRACTION_COMPLETE', {
        query: liveTrackerQuery,
        selectedSource: liveTrackerSelectedSource?.label ?? '',
        reviewedDocuments: reviewedDocuments.map((document) => ({
          filename: document.filename,
          status: document.status,
          reviewedPages: document.reviewedPages ?? [],
          strategy: document.pageSubsetStrategy ?? 'unknown',
          skipReason: document.skipReason ?? '',
        })),
        completeness: assessment?.completeness ?? 'unknown',
        missingMetrics: assessment?.missingFocusMetrics ?? [],
        costUsd: totalCostUsd,
        elapsedSec: extractionDurationSec,
      });
      setLiveTracker((current) =>
        current
          ? {
              ...current,
              status: 'complete',
              foundMetrics: allMetrics,
              foundSignals: allSignals,
              message: `Found ${allMetrics.length} metric${allMetrics.length === 1 ? '' : 's'} across ${reviewedDocuments.length} reviewed PDF${reviewedDocuments.length === 1 ? '' : 's'} in ${extractionDurationSec}s.`,
              errorMessage: '',
            }
          : current,
      );
      setActiveResults({
        id: `results-live-search-${Date.now()}`,
        origin: 'live-search',
        title: liveTrackerQuery,
        query: liveTrackerQuery,
        assetClassHints: liveTrackerAssetClasses,
        metrics: allMetrics,
        signals: allSignals,
        selectedSource: liveTrackerSelectedSource,
        sourceSummary: liveTrackerSelectedSource
          ? `${liveTrackerSelectedSource.pensionFund} - ${liveTrackerSelectedSource.label}`
          : 'Live search tracker',
        documentCount: reviewedDocuments.length,
        reviewedDocuments,
        totalCostUsd,
        totalElapsedSec: extractionDurationSec,
        createdAt: new Date().toISOString(),
      });
      saveRunArtifact({
        id: `run-${Date.now()}`,
        timestamp: new Date().toISOString(),
        query: liveTrackerQuery,
        fund: liveTrackerSelectedSource?.pensionFund ?? '',
        selected_source: {
          label: liveTrackerSelectedSource?.label ?? '',
          document_type: liveTrackerSelectedSource?.documentType ?? '',
          url: liveTrackerSelectedSource?.url ?? '',
          score: liveTrackerSelectedSource?.score ?? 0,
          matched_keywords: liveTrackerSelectedSource?.matchedKeywords ?? [],
        },
        selected_pdf: {
          filename: selectedPdf?.filename ?? '',
          source_label: liveTrackerSelectedSource?.label ?? '',
          preview_score: selectedPdf ? (pdfPreviewStates[selectedPdf.url]?.status === 'ready' ? pdfPreviewStates[selectedPdf.url].score : null) : null,
          preview_negative_signals: selectedPdf ? (pdfPreviewStates[selectedPdf.url]?.status === 'ready' ? pdfPreviewStates[selectedPdf.url].negativeSignals : []) : [],
        },
        retry_pdf: retryPdfUrl
          ? reviewedDocuments.find((document) => document.url === retryPdfUrl) ?? null
          : null,
        selected_pdfs: reviewedDocuments,
        skipped_pdfs: skippedDocuments,
        reviewed_scope: finalReviewScope,
        reviewed_pages: reviewedPages,
        total_pages: totalPages,
        source_candidates: sourceCandidateRecords,
        metrics: allMetrics.map((m) => ({
          metric: m.metric,
          asset_class: m.asset_class,
          value: m.value,
          page: m.page,
          evidence: m.evidence,
          confidence: m.confidence,
        })),
        coverage_score: assessment
          ? (assessment.focusMetricTypes.length > 0
            ? assessment.matchedFocusMetrics.length / Math.max(assessment.focusMetricTypes.length, 1)
            : 1)
          : 0,
        completeness_label: assessment?.completeness ?? 'unknown',
        proxy_hits: assessment?.proxyFocusMetrics.map((metric) => ({
          metric: metric.metric,
          value: metric.value,
          asset_class: metric.asset_class,
          evidence: metric.evidence,
        })) ?? [],
        cost_usd: totalCostUsd,
        elapsed_sec: extractionDurationSec,
        documents_used: reviewedDocuments.length,
      });
    }

    void runExtraction().finally(() => {
      extractionRunningRef.current = false;
    });

    return () => {
      cancelled = true;
      extractionRunningRef.current = false;
    };
  }, [
    effectiveApiKey,
    liveTrackerId,
    liveTrackerStatus,
    liveTrackerSelectedPdfUrls,
    liveTrackerPdfLinks,
    liveTrackerMetrics,
    liveTrackerQuery,
    liveTrackerSelectedSource,
    liveTrackerAssetClasses,
    liveTracker?.sourceCandidates,
    pdfPreviewStates,
    setActiveResults,
    setLiveTracker,
  ]);

  const searchIntents = useMemo(() => detectSearchIntents(liveTracker?.query ?? ''), [liveTracker?.query]);
  const requestedMetricTypes = useMemo(() => {
    // Use the metrics the user explicitly selected in the refine step,
    // falling back to query-text parsing only if none were set
    if (liveTracker?.metrics?.length) return liveTracker.metrics;
    return getFocusMetricTargets(liveTracker?.query ?? '');
  }, [liveTracker?.metrics, liveTracker?.query]);
  const wantsSpecificPerformanceMetrics = useMemo(
    () => requestedMetricTypes.some((metric) => ['IRR', 'TVPI', 'DPI'].includes(metric)),
    [requestedMetricTypes],
  );
  const previewKeywords = useMemo(() => {
    const queryKeywords = getFocusKeywords(liveTracker?.query ?? '', searchIntents);
    return Array.from(new Set([
      ...queryKeywords,
      ...liveTrackerMetrics.map((metric) => metric.toLowerCase()),
      ...liveTrackerAssetClasses.map((assetClass) => assetClass.toLowerCase()),
    ])).slice(0, 12);
  }, [liveTracker?.query, liveTrackerAssetClasses, liveTrackerMetrics, searchIntents]);
  const sourceProbeCandidates = useMemo(
    () => (liveTracker?.sourceCandidates ?? []).slice(0, SOURCE_PREFLIGHT_CANDIDATE_COUNT),
    [liveTracker?.sourceCandidates],
  );
  const sourceProbeCandidatesToFetch = useMemo(
    () =>
      sourceProbeCandidates.filter((candidate) => {
        const probeState = sourceProbeStates[candidate.url];
        return !probeState || probeState.status === 'idle';
      }),
    [sourceProbeCandidates, sourceProbeStates],
  );
  const rankedSourceCandidates = useMemo(
    () =>
      (liveTracker?.sourceCandidates ?? [])
        .map((candidate) => {
          const probe = sourceProbeStates[candidate.url];
          return {
            candidate,
            probe,
            score: candidate.score + (probe?.status === 'ready' ? probe.bestPdfScore : 0),
          };
        })
        .sort((left, right) => right.score - left.score || left.candidate.label.localeCompare(right.candidate.label)),
    [liveTracker?.sourceCandidates, sourceProbeStates],
  );
  const recommendedSourceEntry = rankedSourceCandidates[0] ?? null;
  const recommendedSourceLead = recommendedSourceEntry
    ? recommendedSourceEntry.score - (rankedSourceCandidates[1]?.score ?? 0)
    : 0;
  // Find any source whose probe found multiple requested metrics — strongest signal regardless of title score
  const bestMetricMatchSource = wantsSpecificPerformanceMetrics
    ? rankedSourceCandidates.find(({ probe }) => probe?.status === 'ready' && (probe.matchedMetricTypes.length ?? 0) >= 2) ?? null
    : null;
  const sourceHasClearLeader = !!recommendedSourceEntry && (
    recommendedSourceLead >= 12
    || (recommendedSourceEntry.probe?.matchedMetricTypes.length ?? 0) > 0
    || (recommendedSourceEntry.probe?.bestPdfScore ?? 0) >= 24
    || !!bestMetricMatchSource
  );
  const isPreflightingSources = sourceProbeCandidates.some((candidate) => {
    const probeState = sourceProbeStates[candidate.url];
    return !probeState || probeState.status === 'pending' || probeState.status === 'idle';
  });
  const baseRankedPdfLinks = useMemo(() => {
    if (!liveTrackerPdfLinks || liveTrackerPdfLinks.length === 0) return [];

    return liveTrackerPdfLinks
      .map((pdfLink) => scorePdfLink(pdfLink, searchIntents, liveTrackerQuery, liveTrackerSelectedSourceDocumentType))
      .sort((a, b) => b.score - a.score || a.link.filename.localeCompare(b.link.filename));
  }, [liveTrackerPdfLinks, liveTrackerQuery, liveTrackerSelectedSourceDocumentType, searchIntents]);
  const rankedPdfLinks = useMemo(() => {
    return baseRankedPdfLinks
      .map((candidate) => ({
        ...candidate,
        score: candidate.score + (pdfPreviewStates[candidate.link.url]?.status === 'ready' ? pdfPreviewStates[candidate.link.url].score : 0),
      }))
      .sort((a, b) => b.score - a.score || a.link.filename.localeCompare(b.link.filename));
  }, [baseRankedPdfLinks, pdfPreviewStates]);
  const recommendedPdfLinks = useMemo(() => {
    const positiveCandidates = rankedPdfLinks.filter((candidate) => candidate.score > 0);
    if (positiveCandidates.length === 0) return [];
    if (!wantsSpecificPerformanceMetrics) {
      return positiveCandidates.slice(0, MAX_RECOMMENDED_PDFS);
    }

    const [best, second] = positiveCandidates;
    const bestPreview = best ? pdfPreviewStates[best.link.url] : undefined;
    const secondPreview = second ? pdfPreviewStates[second.link.url] : undefined;
    const secondPreviewScore = secondPreview?.status === 'ready' ? secondPreview.score : 0;

    if (bestPreview?.status === 'ready' && bestPreview.score >= PDF_PREVIEW_STRONG_THRESHOLD && bestPreview.score - secondPreviewScore >= 6) {
      return [best];
    }

    return positiveCandidates.slice(0, Math.min(2, positiveCandidates.length));
  }, [pdfPreviewStates, rankedPdfLinks, wantsSpecificPerformanceMetrics]);
  const visiblePdfLinks = showAllPdfs ? rankedPdfLinks : rankedPdfLinks.slice(0, MAX_VISIBLE_PDFS);
  const recommendationLabel = getRecommendationLabel(liveTracker?.query ?? '', searchIntents);
  const previewCandidateUrls = useMemo(
    () => baseRankedPdfLinks.slice(0, PDF_PREVIEW_CANDIDATE_COUNT).map((candidate) => candidate.link.url),
    [baseRankedPdfLinks],
  );
  const isPreviewingPdfs = previewCandidateUrls.some((url) => {
    const previewState = pdfPreviewStates[url];
    return !previewState || previewState.status === 'pending' || previewState.status === 'idle';
  });
      const resultAssessment = useMemo(
    () =>
      liveTracker
        ? assessLiveResult({
            query: liveTracker.query,
            metrics: liveTracker.foundMetrics,
            selectedSource: liveTracker.selectedSource,
            assetClassHints: liveTracker.assetClasses,
          })
        : null,
    [liveTracker],
  );
  const isPartialMatch = !!resultAssessment
    && !resultAssessment.isWeakMatch
    && resultAssessment.focusMetricTypes.length > 0
    && resultAssessment.missingFocusMetrics.length > 0;
  const completionPrimaryMetrics = useMemo(() => {
    if (!liveTracker) return [];
    if (!resultAssessment || resultAssessment.matchedFocusMetrics.length === 0) {
      return liveTracker.foundMetrics;
    }
    const strictScopedMatches = liveTracker.foundMetrics.filter((metric) =>
      metricMatchesRequestedFocus(metric, resultAssessment.focusMetricTypes)
      && isStrictAssetClassMatch(metric.asset_class, liveTracker.assetClasses),
    );
    if (strictScopedMatches.length > 0) {
      return strictScopedMatches;
    }
    const matchedSet = new Set(resultAssessment.matchedFocusMetrics);
    return liveTracker.foundMetrics.filter((metric) => matchedSet.has(metric));
  }, [liveTracker, resultAssessment]);
  const completionSecondaryMetrics = useMemo(() => {
    if (!liveTracker) return [];
    if (!resultAssessment || resultAssessment.matchedFocusMetrics.length === 0) {
      return [];
    }
    const primarySet = new Set(completionPrimaryMetrics);
    return liveTracker.foundMetrics.filter((metric) => !primarySet.has(metric));
  }, [completionPrimaryMetrics, liveTracker, resultAssessment]);
  const completionDisplayedMetrics = showAdditionalCompletionRows
    ? [...completionPrimaryMetrics, ...completionSecondaryMetrics]
    : completionPrimaryMetrics;
  const shouldSuggestAlternativeDocuments = !liveTracker
    ? false
    : resultAssessment?.isWeakMatch || isPartialMatch || liveTracker.foundMetrics.length === 0;
  const previewCandidatesToFetch = useMemo(
    () =>
      baseRankedPdfLinks
        .slice(0, PDF_PREVIEW_CANDIDATE_COUNT)
        .filter((candidate) => {
          const previewState = pdfPreviewStates[candidate.link.url];
          return !previewState || previewState.status === 'idle';
        }),
    [baseRankedPdfLinks, pdfPreviewStates],
  );

  useEffect(() => {
    if (liveTrackerStatus !== 'choose_source' || sourceProbeCandidatesToFetch.length === 0) {
      return;
    }

    let cancelled = false;

    async function runSourcePreflight() {
      setSourceProbeStore((current) => {
        const activeStates = current.sessionKey === sourceProbeSessionKey ? current.byUrl : {};
        const next = { ...activeStates };

        for (const candidate of sourceProbeCandidatesToFetch) {
          if (!next[candidate.url] || next[candidate.url].status === 'idle') {
            next[candidate.url] = {
              status: 'pending',
              pdfLinks: [],
              pdfCount: 0,
              bestPdfUrl: '',
              bestPdfFilename: '',
              bestPdfScore: 0,
              matchedKeywords: [],
              matchedMetricTypes: [],
              negativeSignals: [],
              summary: 'Checking PDFs on this source page...',
            };
          }
        }

        return {
          sessionKey: sourceProbeSessionKey,
          byUrl: next,
        };
      });

      const probeLog = (message: string, status: 'info' | 'done' | 'error' = 'info') => {
        setLiveTracker((current) =>
          current
            ? { ...current, extractionLogs: [...current.extractionLogs, { message, status }] }
            : current,
        );
      };

      for (const candidate of sourceProbeCandidatesToFetch) {
        if (cancelled) return;

        try {
          const pdfLinks = await scrapeUrlForPdfs(candidate.url);
          if (cancelled) return;

          const rankedCandidatePdfs = pdfLinks
            .map((pdfLink) => scorePdfLink(pdfLink, searchIntents, liveTrackerQuery, candidate.documentType))
            .sort((left, right) => right.score - left.score || left.link.filename.localeCompare(right.link.filename));

          let bestPdf: RankedPdfLink | undefined;
          let bestCombinedScore = Number.NEGATIVE_INFINITY;
          let bestMatchedKeywords: string[] = [];
          let bestMatchedMetricTypes: string[] = [];
          let bestNegativeSignals: string[] = [];
          let bestExcerpt = '';
          const rejectedPreviewReasons: string[] = [];

          for (const pdfCandidate of rankedCandidatePdfs.slice(0, SOURCE_PREFLIGHT_PDF_COUNT)) {
            if (cancelled) return;

            try {
              const subsetBytes = await fetchPdfPreviewSubset(pdfCandidate.link.url, [1, 2, 3, 4, 5]);
              if (cancelled) return;

              const previewText = await extractPdfPreviewText(subsetBytes, 5);
              if (cancelled) return;

              // Early reject: skip corporate/off-target docs
              const rejectCheck = earlyRejectCheck(previewText.text, liveTrackerQuery);
              if (rejectCheck.shouldReject) {
                probeLog(`Skipped ${pdfCandidate.link.filename}: ${rejectCheck.reason}`, 'info');
                rejectedPreviewReasons.push(`${pdfCandidate.link.filename}: ${rejectCheck.reason}`);
                continue;
              }

              const previewScore = scorePreviewText(previewText.text, previewKeywords, requestedMetricTypes);
              const combinedScore = pdfCandidate.score + previewScore.score;

              if (!bestPdf || combinedScore > bestCombinedScore) {
                bestPdf = pdfCandidate;
                bestCombinedScore = combinedScore;
                bestMatchedKeywords = previewScore.matchedKeywords;
                bestMatchedMetricTypes = previewScore.matchedMetricTypes;
                bestNegativeSignals = previewScore.negativeSignals;
                bestExcerpt = previewScore.excerpt;
              }
            } catch {
              // Keep going - filename-only ranking is still useful if preview fetch fails.
            }
          }

          if (!bestPdf) {
            bestPdf = rankedCandidatePdfs[SOURCE_PREFLIGHT_PDF_COUNT] ?? rankedCandidatePdfs[0];
            bestCombinedScore = bestPdf?.score ?? 0;
          }

          const bestPdfScore = bestCombinedScore;
          const bestPdfFilename = bestPdf?.link.filename ?? 'this source';
          const summary = pdfLinks.length === 0
            ? 'No PDFs found on this source page.'
            : bestMatchedMetricTypes.length > 0
              ? `Best file: ${bestPdfFilename}. Preview matched ${bestMatchedMetricTypes.join(', ')}${bestNegativeSignals.length > 0 ? `, but watch for ${bestNegativeSignals.join(', ')}` : ''}.`
            : bestMatchedKeywords.length > 0
              ? `Best file: ${bestPdfFilename}. Preview matched ${bestMatchedKeywords.join(', ')}${bestNegativeSignals.length > 0 ? `, but it still looks ${bestNegativeSignals.join(', ')}` : ''}.`
            : rejectedPreviewReasons.length > 0 && !bestPdf
              ? `Top preview files were rejected before extraction: ${rejectedPreviewReasons.slice(0, 2).join(' | ')}`
            : bestPdf
                  ? `Best file by preflight: ${bestPdfFilename}.${bestExcerpt ? ` ${bestExcerpt}` : ''}${rejectedPreviewReasons.length > 0 ? ` Rejected ${rejectedPreviewReasons.length} off-target file${rejectedPreviewReasons.length === 1 ? '' : 's'} during preview.` : ''}`
                  : 'No clear PDF recommendation yet.';

          setSourceProbeStore((current) => ({
            sessionKey: sourceProbeSessionKey,
            byUrl: {
              ...(current.sessionKey === sourceProbeSessionKey ? current.byUrl : {}),
              [candidate.url]: {
                status: 'ready',
                pdfLinks,
                pdfCount: pdfLinks.length,
                bestPdfUrl: bestPdf?.link.url ?? '',
                bestPdfFilename: bestPdf?.link.filename ?? '',
                bestPdfScore,
                matchedKeywords: bestMatchedKeywords,
                matchedMetricTypes: bestMatchedMetricTypes,
                negativeSignals: bestNegativeSignals,
                summary,
              },
            },
          }));
        } catch {
          if (cancelled) return;

          setSourceProbeStore((current) => ({
            sessionKey: sourceProbeSessionKey,
            byUrl: {
              ...(current.sessionKey === sourceProbeSessionKey ? current.byUrl : {}),
              [candidate.url]: {
                status: 'error',
                pdfLinks: [],
                pdfCount: 0,
                bestPdfUrl: '',
                bestPdfFilename: '',
                bestPdfScore: 0,
                matchedKeywords: [],
                matchedMetricTypes: [],
                negativeSignals: [],
                summary: 'Could not probe this source yet.',
              },
            },
          }));
        }
      }
    }

    void runSourcePreflight();

    return () => {
      cancelled = true;
    };
  }, [
    liveTrackerQuery,
    liveTrackerStatus,
    previewKeywords,
    requestedMetricTypes,
    searchIntents,
    sourceProbeCandidatesToFetch,
    sourceProbeSessionKey,
  ]);

  useEffect(() => {
    if (!liveTracker || liveTracker.status !== 'choose_source' || !recommendedSourceEntry) {
      return;
    }

    const probe = recommendedSourceEntry.probe;
    if (!probe || probe.status !== 'ready' || probe.pdfCount === 0) {
      return;
    }

    const message = `Recommended source: ${recommendedSourceEntry.candidate.label}. ${probe.summary}`;
    if (liveTracker.message === message) {
      return;
    }

    setLiveTracker((current) =>
      current && current.status === 'choose_source'
        ? {
            ...current,
            message,
          }
        : current,
    );
  }, [liveTracker, recommendedSourceEntry, setLiveTracker]);

  useEffect(() => {
    if (
      !liveTracker
      || liveTracker.status !== 'choose_source'
      || liveTracker.selectedSource
    ) {
      return;
    }

    // Pick the best source: prefer a source with matched metrics over the highest-scored title
    const targetEntry = bestMetricMatchSource ?? recommendedSourceEntry;
    if (!targetEntry) return;

    const probe = targetEntry.probe;
    if (
      !probe
      || probe.status !== 'ready'
      || probe.pdfCount === 0
      || (!sourceHasClearLeader && isPreflightingSources)
    ) {
      return;
    }

    // Show the user what we're about to do, then auto-advance after a brief delay
    const metricSummary = probe.matchedMetricTypes.length > 0
      ? `Found ${probe.matchedMetricTypes.join(', ')} in preview`
      : '';
    setLiveTracker((current) =>
      current && current.status === 'choose_source' && !current.selectedSource
        ? {
            ...current,
            message: metricSummary
              ? `${metricSummary} — auto-selecting ${targetEntry.candidate.label}...`
              : `Auto-selecting ${targetEntry.candidate.label}...`,
          }
        : current,
    );

    const timerId = setTimeout(() => {
      setLiveTracker((current) =>
        current && current.status === 'choose_source' && !current.selectedSource
          ? {
              ...current,
              selectedSource: targetEntry.candidate,
              status: 'selecting_pdfs',
              message: `Auto-selected ${targetEntry.candidate.label}. Found ${probe.pdfCount} PDF${probe.pdfCount === 1 ? '' : 's'} to review. ${probe.summary}`,
              pdfLinks: probe.pdfLinks,
              selectedPdfUrls: probe.bestPdfUrl ? [probe.bestPdfUrl] : [],
              errorMessage: '',
            }
          : current,
      );
    }, 1200);

    sourceAutoAdvanceTimerRef.current = timerId;

    return () => {
      clearTimeout(timerId);
      sourceAutoAdvanceTimerRef.current = null;
    };
  }, [bestMetricMatchSource, isPreflightingSources, liveTracker, recommendedSourceEntry, setLiveTracker, sourceHasClearLeader]);

  useEffect(() => {
    if (liveTrackerStatus !== 'selecting_pdfs' || previewCandidatesToFetch.length === 0 || previewKeywords.length === 0) {
      return;
    }

    let cancelled = false;

    async function runPreviewScoring() {
      setPreviewStateStore((current) => {
        const activeStates = current.sessionKey === previewSessionKey ? current.byUrl : {};
        const next = { ...activeStates };

        for (const candidate of previewCandidatesToFetch) {
          if (!next[candidate.link.url] || next[candidate.link.url].status === 'idle') {
            next[candidate.link.url] = {
              status: 'pending',
              score: 0,
              matchedKeywords: [],
              matchedMetricTypes: [],
              negativeSignals: [],
              excerpt: '',
              numericSignalCount: 0,
              pagesScanned: 0,
            };
          }
        }

        return {
          sessionKey: previewSessionKey,
          byUrl: next,
        };
      });

      // Run all preview downloads in parallel — each is a cheap local operation
      await Promise.all(
        previewCandidatesToFetch.map(async (candidate) => {
          if (cancelled) return;

          try {
            const previewPages = [1, 2, 3, 4, 5];
            const subsetBytes = await fetchPdfPreviewSubset(candidate.link.url, previewPages);
            if (cancelled) return;

            const previewText = await extractPdfPreviewText(subsetBytes, 5);
            if (cancelled) return;

            // Early reject: flag corporate/off-target docs
            const rejectCheck = earlyRejectCheck(previewText.text, liveTrackerQuery);
            if (rejectCheck.shouldReject) {
              setPreviewStateStore((current) => ({
                sessionKey: previewSessionKey,
                byUrl: {
                  ...(current.sessionKey === previewSessionKey ? current.byUrl : {}),
                  [candidate.link.url]: {
                    status: 'ready',
                    score: -100,
                    matchedKeywords: [],
                    matchedMetricTypes: [],
                    negativeSignals: ['early-rejected: ' + rejectCheck.reason],
                    excerpt: rejectCheck.corporateSignals.slice(0, 3).join(', '),
                    numericSignalCount: 0,
                    pagesScanned: previewText.pagesScanned,
                  },
                },
              }));
              return;
            }

            const previewScore = scorePreviewText(previewText.text, previewKeywords, requestedMetricTypes);
            setPreviewStateStore((current) => ({
              sessionKey: previewSessionKey,
              byUrl: {
                ...(current.sessionKey === previewSessionKey ? current.byUrl : {}),
                [candidate.link.url]: {
                  status: 'ready',
                  score: previewScore.score,
                  matchedKeywords: previewScore.matchedKeywords,
                  matchedMetricTypes: previewScore.matchedMetricTypes,
                  negativeSignals: previewScore.negativeSignals,
                  excerpt: previewScore.excerpt,
                  numericSignalCount: previewScore.numericSignalCount,
                  pagesScanned: previewText.pagesScanned,
                },
              },
            }));
          } catch {
            if (cancelled) return;

            setPreviewStateStore((current) => ({
              sessionKey: previewSessionKey,
              byUrl: {
                ...(current.sessionKey === previewSessionKey ? current.byUrl : {}),
                [candidate.link.url]: {
                  status: 'error',
                  score: 0,
                  matchedKeywords: [],
                  matchedMetricTypes: [],
                  negativeSignals: [],
                  excerpt: '',
                  numericSignalCount: 0,
                  pagesScanned: 0,
                },
              },
            }));
          }
        }),
      );
    }

    void runPreviewScoring();

    return () => {
      cancelled = true;
    };
  }, [liveTrackerStatus, previewCandidatesToFetch, previewKeywords, requestedMetricTypes, previewSessionKey]);

  useEffect(() => {
    if (
      !liveTracker
      || liveTracker.status !== 'selecting_pdfs'
      || liveTracker.selectedPdfUrls.length > 0
      || liveTracker.message.startsWith('Best candidate:')
    ) {
      return;
    }

    // Wait until ALL previews have finished (no more pending)
    const allPreviewsDone = previewCandidateUrls.every((url) => {
      const state = pdfPreviewStates[url];
      return state && state.status !== 'pending' && state.status !== 'idle';
    });
    if (!allPreviewsDone) return;

    // Find the best and second-best preview candidates
    const readyCandidates = rankedPdfLinks
      .filter((candidate) => pdfPreviewStates[candidate.link.url]?.status === 'ready')
      .sort((a, b) => {
        const aScore = pdfPreviewStates[a.link.url]?.score ?? 0;
        const bScore = pdfPreviewStates[b.link.url]?.score ?? 0;
        return bScore - aScore || b.score - a.score;
      });

    const best = readyCandidates[0];
    const secondBest = readyCandidates[1];
    if (!best) return;

    const bestPreview = pdfPreviewStates[best.link.url];
    if (!bestPreview || bestPreview.score < PDF_PREVIEW_AUTOSELECT_THRESHOLD) return;

    const secondPreviewScore = secondBest ? (pdfPreviewStates[secondBest.link.url]?.score ?? 0) : 0;
    const isStrongWinner = bestPreview.score >= PDF_PREVIEW_STRONG_THRESHOLD
      || (bestPreview.score >= PDF_PREVIEW_AUTOSELECT_THRESHOLD && bestPreview.score >= secondPreviewScore * 1.5);
    const keywordSummary = bestPreview.matchedKeywords.length > 0
      ? `Found ${bestPreview.matchedKeywords.join(', ')} on pages 1-${bestPreview.pagesScanned}`
      : '';

    if (isStrongWinner) {
      setLiveTracker((current) =>
        current
          ? {
              ...current,
              selectedPdfUrls: [best.link.url],
              message: `Best candidate: ${best.link.filename}. ${keywordSummary}. Ready to extract — or pick a different file.`,
            }
          : current,
      );
    }
  }, [liveTracker, pdfPreviewStates, rankedPdfLinks, previewCandidateUrls, setLiveTracker]);

  // Auto-start extraction when a PDF has been auto-selected with high confidence
  useEffect(() => {
    if (
      !liveTracker
      || liveTracker.status !== 'selecting_pdfs'
      || liveTracker.selectedPdfUrls.length === 0
      || !liveTracker.message.startsWith('Best candidate:')
      || !wantsSpecificPerformanceMetrics
      || !effectiveApiKey
      || isPreviewingPdfs
    ) {
      return;
    }

    const selectedUrl = liveTracker.selectedPdfUrls[0];
    const preview = pdfPreviewStates[selectedUrl];
    if (
      !preview
      || preview.status !== 'ready'
      || preview.score < PDF_PREVIEW_STRONG_THRESHOLD
      || preview.matchedMetricTypes.length === 0
    ) {
      return;
    }

    const selectedPdf = rankedPdfLinks.find((c) => c.link.url === selectedUrl);
    const filename = selectedPdf?.link.filename ?? 'selected file';
    const metricNames = preview.matchedMetricTypes.join(', ');

    setLiveTracker((current) =>
      current && current.status === 'selecting_pdfs'
        ? {
            ...current,
            message: `Auto-extracting ${filename} — found ${metricNames} in preview. Click any file to override.`,
          }
        : current,
    );

    const timerId = setTimeout(() => {
      setLiveTracker((current) =>
        current && current.status === 'selecting_pdfs' && current.selectedPdfUrls.length > 0
          ? {
              ...current,
              status: 'extracting',
              attemptedPdfUrls: Array.from(new Set([...current.attemptedPdfUrls, ...current.selectedPdfUrls])),
              message: 'Extracting metrics from reviewed PDFs...',
              extractionLogs: [],
              progress: { current: 0, total: current.selectedPdfUrls.length, currentFile: '' },
              errorMessage: '',
            }
          : current,
      );
    }, 1500);

    pdfAutoExtractTimerRef.current = timerId;

    return () => {
      clearTimeout(timerId);
      pdfAutoExtractTimerRef.current = null;
    };
  }, [effectiveApiKey, isPreviewingPdfs, liveTracker, pdfPreviewStates, rankedPdfLinks, setLiveTracker, wantsSpecificPerformanceMetrics]);

  const cancelAutoExtract = useCallback(() => {
    if (pdfAutoExtractTimerRef.current) {
      clearTimeout(pdfAutoExtractTimerRef.current);
      pdfAutoExtractTimerRef.current = null;
    }
  }, []);

  if (!liveTracker) {
    return null;
  }

  const selectedSource = liveTracker.selectedSource;
  const selectedSourceEntry = selectedSource
    ? rankedSourceCandidates.find(({ candidate }) => candidate.url === selectedSource.url) ?? null
    : null;
  const selectedSourceProbe = selectedSource ? sourceProbeStates[selectedSource.url] ?? null : null;
  const selectedSourceIsRecommended = !!selectedSourceEntry && !!recommendedSourceEntry
    && selectedSourceEntry.candidate.url === recommendedSourceEntry.candidate.url;
  const selectedCount = liveTracker.selectedPdfUrls.length;
  const reviewedDocumentPhrase = formatReviewScope(selectedCount);
  const nextBestPdfCandidate = useMemo(() => {
    if (!liveTracker) return null;

    const selectedUrls = new Set(liveTracker.selectedPdfUrls);
    const attemptedUrls = new Set(liveTracker.attemptedPdfUrls);
    return rankedPdfLinks.find((candidate) => {
      if (selectedUrls.has(candidate.link.url) || attemptedUrls.has(candidate.link.url)) return false;
      const preview = pdfPreviewStates[candidate.link.url];
      if (!preview || preview.status !== 'ready') return true;
      return !preview.negativeSignals.some((signal) => signal.startsWith('early-rejected:'));
    }) ?? null;
  }, [liveTracker, pdfPreviewStates, rankedPdfLinks]);

  const togglePdf = (url: string) => {
    cancelAutoExtract();
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            selectedPdfUrls: current.selectedPdfUrls.includes(url)
              ? current.selectedPdfUrls.filter((item) => item !== url)
              : [...current.selectedPdfUrls, url],
          }
        : current,
    );
  };

  const selectRecommended = () => {
    cancelAutoExtract();
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            selectedPdfUrls: recommendedPdfLinks.map((candidate) => candidate.link.url),
          }
        : current,
    );
  };

  const clearPdfSelection = () => {
    cancelAutoExtract();
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            selectedPdfUrls: [],
          }
        : current,
    );
  };

  const chooseSource = (candidate: SourceSearchCandidate) => {
    // Cancel auto-advance timer if user manually picks a source
    if (sourceAutoAdvanceTimerRef.current) {
      clearTimeout(sourceAutoAdvanceTimerRef.current);
      sourceAutoAdvanceTimerRef.current = null;
    }
    setShowAllPdfs(false);
    const probeState = sourceProbeStates[candidate.url];
    const hasCachedPdfList = probeState?.status === 'ready' && probeState.pdfLinks.length > 0;

    setLiveTracker((current) =>
      current
        ? {
            ...current,
            selectedSource: candidate,
            status: hasCachedPdfList ? 'selecting_pdfs' : 'scanning_pdfs',
            message: hasCachedPdfList
              ? `Found ${probeState.pdfLinks.length} PDF${probeState.pdfLinks.length === 1 ? '' : 's'} to review. ${probeState.summary}`
              : `Scanning ${candidate.label} for PDF links...`,
            pdfLinks: hasCachedPdfList ? probeState.pdfLinks : [],
            selectedPdfUrls: hasCachedPdfList && probeState.bestPdfUrl ? [probeState.bestPdfUrl] : [],
            attemptedPdfUrls: [],
            errorMessage: '',
          }
        : current,
    );
  };

  const extractSelected = () => {
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            status: 'extracting',
            attemptedPdfUrls: Array.from(new Set([...current.attemptedPdfUrls, ...current.selectedPdfUrls])),
            message: 'Extracting metrics from reviewed PDFs...',
            extractionLogs: [],
            progress: { current: 0, total: current.selectedPdfUrls.length, currentFile: '' },
            errorMessage: '',
          }
        : current,
    );
  };

  const tryNextBestPdf = () => {
    if (!nextBestPdfCandidate) {
      backToPdfs();
      return;
    }

    const nextLink = nextBestPdfCandidate.link;
    setShowAllPdfs(false);
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            status: 'extracting',
            selectedPdfUrls: [nextLink.url],
            attemptedPdfUrls: Array.from(new Set([...current.attemptedPdfUrls, nextLink.url])),
            message: `Trying next-best document: ${nextLink.filename}`,
            extractionLogs: [
              {
                message: `Trying next-best document: ${nextLink.filename}`,
                status: 'info',
              },
            ],
            progress: { current: 0, total: 1, currentFile: '' },
            foundMetrics: [],
            foundSignals: [],
            errorMessage: '',
          }
        : current,
    );
  };

  const retryDiscovery = () => {
    setShowAllPdfs(false);
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            status: 'finding_sources',
            message: 'Searching for relevant documents...',
            sourceCandidates: [],
            selectedSource: null,
            pdfLinks: [],
            selectedPdfUrls: [],
            attemptedPdfUrls: [],
            extractionLogs: [],
            progress: { current: 0, total: 0, currentFile: '' },
            foundMetrics: [],
            foundSignals: [],
            errorMessage: '',
          }
        : current,
    );
  };

  const backToSources = () => {
    setShowAllPdfs(false);
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            status: 'choose_source',
            message: 'Select a source to scan for documents.',
            pdfLinks: [],
            selectedPdfUrls: [],
            attemptedPdfUrls: [],
            progress: { current: 0, total: 0, currentFile: '' },
            extractionLogs: [],
            errorMessage: '',
          }
        : current,
    );
  };

  const backToPdfs = () => {
    setShowAllPdfs(false);
    setLiveTracker((current) =>
      current
        ? {
            ...current,
            status: 'selecting_pdfs',
            message: `Found ${current.pdfLinks.length} PDF${current.pdfLinks.length === 1 ? '' : 's'} to review. Nothing is selected yet.`,
            selectedPdfUrls: [],
            progress: { current: 0, total: 0, currentFile: '' },
            extractionLogs: [],
            errorMessage: '',
          }
        : current,
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-2xl border border-accent/20 bg-[linear-gradient(135deg,rgba(99,102,241,0.1),rgba(15,23,42,0.9))] px-4 py-3.5 shadow-[0_24px_70px_rgba(5,10,20,0.28)] backdrop-blur-sm"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 0%, rgba(99,102,241,0.08) 0%, transparent 75%)' }}
      />

      <div className="relative">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-green shrink-0"
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-light/90">
                Live Search Tracker
              </span>
            </div>
            <h4 className="truncate text-[15px] font-semibold text-text-primary">{liveTracker.query}</h4>
            <p className="mt-0.5 text-xs text-text-secondary">{liveTracker.message}</p>
          </div>

          <button
            onClick={clearLiveTracker}
            className="cursor-pointer rounded-xl border border-border/70 px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-accent/25 hover:text-text-primary"
          >
            Dismiss
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          <span className="rounded-full border border-border/60 bg-bg-hover px-2 py-1">
            {liveTracker.pensionFunds.join(' • ')}
          </span>
          <span className="rounded-full border border-border/60 bg-bg-hover px-2 py-1">
            {liveTracker.frequency}
          </span>
          {selectedSource && (
            <span className="rounded-full border border-accent/20 bg-accent/12 px-2 py-1 text-accent-light">
              {selectedSource.pensionFund}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {liveTracker.status === 'finding_sources' && (
            <motion.div
              key="finding-sources"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-border/70 bg-bg-card/80 p-3.5"
            >
              <div className="flex items-center gap-3">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}>
                  <Search className="w-5 h-5 text-accent-light" />
                </motion.div>
                <div>
                  <p className="text-sm text-text-primary">{liveTracker.message}</p>
                </div>
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'choose_source' && (
            <motion.div
              key="choose-source"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="overflow-hidden rounded-2xl border border-border/70 bg-bg-card/80"
            >
              <div className="border-b border-border/60 p-3.5">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent-light" />
                  <span className="text-sm font-medium text-text-primary">Sources found</span>
                </div>
                {recommendedSourceEntry && (
                  <div className="mt-3 rounded-xl border border-accent/20 bg-accent/8 px-3 py-2.5">
                    <p className="text-xs font-medium text-accent-light">
                      Recommended source right now: {recommendedSourceEntry.candidate.label}
                    </p>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      {recommendedSourceEntry.probe?.status === 'ready'
                        ? recommendedSourceEntry.probe.summary
                        : `Current best score: ${recommendedSourceEntry.score}. We are still checking PDFs, but this is already the strongest source.`}
                    </p>
                  </div>
                )}
                <p className="mt-2 text-xs text-text-secondary">
                  Checking documents on each source to find the best match.
                </p>
              </div>
              <div className="divide-y divide-border/40">
                {rankedSourceCandidates.slice(0, 3).map(({ candidate, probe }, index) => (
                  <button
                    key={candidate.id}
                    onClick={() => chooseSource(candidate)}
                    className="w-full px-4 py-3 text-left hover:bg-bg-hover/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm text-text-primary">{candidate.label}</p>
                          {index === 0 && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              probe?.status === 'ready'
                                ? 'border border-green/25 bg-green/10 text-green-light'
                                : 'border border-accent/20 bg-accent/10 text-accent-light'
                            }`}>
                              {probe?.status === 'ready' ? 'Recommended' : 'Current best guess'}
                            </span>
                          )}
                          {probe?.status === 'pending' && (
                            <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-light">
                              Checking PDFs
                            </span>
                          )}
                          <span className="rounded-full border border-border/60 bg-bg-hover px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                            {candidate.documentType}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">{candidate.pensionFund}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-text-muted">{candidate.description}</p>
                        {probe && (
                          <p className="mt-1 text-[11px] text-text-secondary">
                            {summarizeProbeSignal(probe)}
                          </p>
                        )}
                        {probe?.status === 'ready' && probe.matchedMetricTypes.length > 0 && (
                          <p className="mt-1 text-[11px] text-accent-light">
                            Preview matched {probe.matchedMetricTypes.join(', ')}.
                          </p>
                        )}
                        {probe?.status === 'ready' && probe.negativeSignals.length > 0 && (
                          <p className="mt-1 text-[11px] text-yellow">
                            Risk: {probe.negativeSignals.join(', ')}.
                          </p>
                        )}
                        <p className="mt-1 truncate text-[11px] text-text-muted/70">{candidate.url}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-accent/20 bg-accent/12 px-2 py-1 text-[11px] text-accent-light">
                        {probe?.status === 'ready' && probe.pdfCount > 0 ? `${probe.pdfCount} PDFs ready` : `Score ${candidate.score}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'scanning_pdfs' && (
            <motion.div
              key="scanning-pdfs"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-border/70 bg-bg-card/80 p-3.5"
            >
              <div className="flex items-center gap-3">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}>
                  <Loader2 className="w-5 h-5 text-accent-light" />
                </motion.div>
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    Scanning {selectedSource?.label || 'selected source'} for PDF links...
                  </p>
                  {selectedSource && (
                    <a
                      href={selectedSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent-light transition-colors mt-1"
                    >
                      Open source page
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'selecting_pdfs' && (
            <motion.div
              key="selecting-pdfs"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="overflow-hidden rounded-2xl border border-border/70 bg-bg-card/80"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/60 p-3.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent-light" />
                  <span className="text-sm font-medium text-text-primary">
                    {liveTracker.pdfLinks.length} PDF{liveTracker.pdfLinks.length === 1 ? '' : 's'} found
                  </span>
                </div>
                <button
                  onClick={backToSources}
                  className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Change source
                </button>
              </div>

              <div className="border-b border-border/40 bg-bg-primary/25 px-4 py-3">
                {selectedSource && (
                  <div className="mb-3 rounded-xl border border-accent/20 bg-accent/8 px-3 py-2.5">
                    <p className="text-xs font-medium text-accent-light">
                      {selectedSourceIsRecommended ? 'Using recommended source' : 'Current source'}: {selectedSource.label}
                    </p>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      {selectedSourceEntry
                        ? `Won source ranking with score ${selectedSourceEntry.score}.`
                        : 'This is the source currently selected for PDF review.'}
                      {selectedSourceProbe?.status === 'ready' ? ` ${selectedSourceProbe.summary}` : ''}
                    </p>
                  </div>
                )}
                <p className="text-xs text-text-secondary">{recommendationLabel}</p>
                <p className="mt-1 text-[11px] text-text-muted">
                  We score filenames, then scan pages 1-5 of the top {Math.min(PDF_PREVIEW_CANDIDATE_COUNT, liveTracker.pdfLinks.length)} candidates locally (free, no API cost) to find the best file.
                </p>
                {wantsSpecificPerformanceMetrics && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    For focused performance searches, start with one strong PDF first so we do not burn Claude calls on broad statement files.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={selectRecommended}
                    disabled={recommendedPdfLinks.length === 0}
                    className="cursor-pointer rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-light transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {recommendedPdfLinks.length === 1 ? 'Select Best Match' : `Select Suggested${recommendedPdfLinks.length > 0 ? ` (${recommendedPdfLinks.length})` : ''}`}
                  </button>
                  <button
                    onClick={clearPdfSelection}
                    disabled={selectedCount === 0}
                    className="cursor-pointer rounded-lg border border-border/70 px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear Selection
                  </button>
                  <span className="text-[11px] text-text-muted">
                    {selectedCount === 0 ? 'Nothing selected yet.' : `${selectedCount} selected.`}
                  </span>
                  {isPreviewingPdfs && (
                    <span className="text-[11px] text-accent-light">
                      Scanning top {Math.min(PDF_PREVIEW_CANDIDATE_COUNT, liveTracker.pdfLinks.length)} candidates locally...
                    </span>
                  )}
                  {liveTracker.pdfLinks.length > MAX_VISIBLE_PDFS && (
                    <button
                      onClick={() => setShowAllPdfs((current) => !current)}
                      className="cursor-pointer text-[11px] text-text-muted transition-colors hover:text-accent-light"
                    >
                      {showAllPdfs ? 'Show fewer' : `Show all ${liveTracker.pdfLinks.length}`}
                    </button>
                  )}
                </div>
                {!showAllPdfs && liveTracker.pdfLinks.length > MAX_VISIBLE_PDFS && (
                  <p className="mt-2 text-[11px] text-text-muted">
                    Showing the top {visiblePdfLinks.length} files ranked by filename and local preview relevance so you do not have to sift through everything.
                  </p>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
                {visiblePdfLinks.map((candidate, index) => {
                  const pdfLink = candidate.link;
                  const isRecommended = index < recommendedPdfLinks.length && candidate.score > 0;
                  const previewState = pdfPreviewStates[pdfLink.url];
                  const previewBadge = getPreviewBadge(previewState);
                  const isBestPreviewMatch = index === 0 && previewState?.status === 'ready' && previewState.score >= PDF_PREVIEW_AUTOSELECT_THRESHOLD;

                  return (
                  <label
                    key={pdfLink.url}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover/50 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={liveTracker.selectedPdfUrls.includes(pdfLink.url)}
                      onChange={() => togglePdf(pdfLink.url)}
                      className="rounded border-border accent-[#6366f1]"
                    />
                    <FileText className="w-4 h-4 text-red/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-text-primary" title={pdfLink.filename}>
                          {pdfLink.filename}
                        </span>
                        {isBestPreviewMatch && (
                          <span className="rounded-full border border-green/25 bg-green/10 px-2 py-0.5 text-[10px] font-medium text-green-light">
                            Best match
                          </span>
                        )}
                        {isRecommended && (
                          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-light">
                            Suggested
                          </span>
                        )}
                        {previewBadge && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${previewBadge.className}`}>
                            {previewBadge.label}
                          </span>
                        )}
                      </div>
                      {candidate.reasons.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {candidate.reasons.join(' | ')}
                        </p>
                      )}
                      {previewState?.status === 'ready' && (
                        <>
                          <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                            {previewState.matchedMetricTypes.length > 0
                              ? `Preview matched ${previewState.matchedMetricTypes.join(', ')} on ${previewState.pagesScanned === 1 ? 'page 1' : `pages 1-${previewState.pagesScanned}`}.`
                              : previewState.matchedKeywords.length > 0
                                ? `Preview matched ${previewState.matchedKeywords.join(', ')} on ${previewState.pagesScanned === 1 ? 'page 1' : `pages 1-${previewState.pagesScanned}`}.`
                              : `Preview scanned ${previewState.pagesScanned === 1 ? 'page 1' : `pages 1-${previewState.pagesScanned}`} with low keyword signal.`}
                          </p>
                          {previewState.negativeSignals.length > 0 && (
                            <p className="mt-0.5 truncate text-[11px] text-yellow">
                              Risk: {previewState.negativeSignals.join(', ')}.
                            </p>
                          )}
                          {previewState.excerpt && (
                            <p className="mt-0.5 truncate text-[11px] text-text-muted/80">
                              {previewState.excerpt}
                            </p>
                          )}
                        </>
                      )}
                      {previewState?.status === 'pending' && (
                        <p className="mt-0.5 text-[11px] text-text-muted">Scanning pages 1-5 locally...</p>
                      )}
                    </div>
                    <a
                      href={pdfLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-text-muted hover:text-accent-light transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5">
                <div>
                  {!effectiveApiKey && (
                    <p className="text-xs text-yellow">
                      Configure your Anthropic API key in settings to extract metrics.
                    </p>
                  )}
                </div>
                <button
                  onClick={extractSelected}
                  disabled={selectedCount === 0 || !effectiveApiKey}
                  className="px-5 py-2 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {selectedCount > 0
                    ? `Extract ${selectedCount} PDF${selectedCount === 1 ? '' : 's'}`
                    : 'Select PDFs to Extract'}
                </button>
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'extracting' && (
            <motion.div
              key="extracting"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-border/70 bg-bg-card/80 p-3.5"
            >
              <div className="mb-3.5 flex items-center gap-3">
                <motion.div
                  className="w-10 h-10 rounded-xl border border-accent/30 flex items-center justify-center"
                  animate={{ borderColor: ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.75)', 'rgba(99,102,241,0.3)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                    <Sparkles className="w-5 h-5 text-accent-light" />
                  </motion.div>
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Extracting {liveTracker.progress.current} of {liveTracker.progress.total}
                  </p>
                  <p className="text-xs text-text-muted truncate max-w-sm">{liveTracker.progress.currentFile}</p>
                </div>
              </div>

              <div className="mb-3.5 h-1 w-full overflow-hidden rounded-full bg-bg-hover">
                <motion.div
                  className="h-full bg-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width:
                      liveTracker.progress.total > 0
                        ? `${(liveTracker.progress.current / liveTracker.progress.total) * 100}%`
                        : '0%',
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <div
                ref={extractionLogScrollRef}
                className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-bg-primary/70 p-3 font-mono text-xs"
              >
                {liveTracker.extractionLogs.length === 0 ? (
                  <p className="text-text-muted">Preparing extraction...</p>
                ) : (
                  liveTracker.extractionLogs.map((entry, index) => (
                    <div
                      key={`${entry.message}-${index}`}
                      className={`flex items-start gap-2 ${
                        entry.status === 'error'
                          ? 'text-red'
                          : entry.status === 'done'
                            ? 'text-green'
                            : 'text-text-muted'
                      }`}
                    >
                      <span className="shrink-0 mt-px">
                        {entry.status === 'done' ? 'OK' : entry.status === 'error' ? 'X' : '>'}
                      </span>
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <span className="min-w-0 break-words">{entry.message}</span>
                        {index === liveTracker.extractionLogs.length - 1
                          && entry.message.includes(CLAUDE_EXTRACTION_LOG_MARKER)
                          && claudeWaitStartedAt !== null && (
                            <span className="shrink-0 text-accent-light/90 tabular-nums">
                              {`${(claudeWaitElapsedMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={`rounded-2xl bg-bg-card/80 ${
                resultAssessment?.isWeakMatch
                  ? 'border border-yellow/25'
                  : isPartialMatch
                    ? 'border border-accent/25'
                    : 'border border-green/20'
              }`}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-2">
                {resultAssessment?.isWeakMatch ? (
                  <AlertTriangle className="w-4 h-4 text-yellow shrink-0" />
                ) : isPartialMatch ? (
                  <AlertTriangle className="w-4 h-4 text-accent-light shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green shrink-0" />
                )}
                <span className="text-sm font-medium text-text-primary">
                  {resultAssessment?.isWeakMatch
                    ? 'Weak match — likely wrong document type'
                    : isPartialMatch
                      ? `Found ${new Set(resultAssessment?.matchedFocusMetrics.map((m) => m.metric)).size} of ${resultAssessment?.focusMetricTypes.length ?? '?'} requested metrics`
                      : requestedMetricTypes.length > 0
                        ? `All ${requestedMetricTypes.length} requested metrics found`
                        : 'Extraction complete'}
                </span>
                <span className="text-[11px] text-text-muted ml-auto shrink-0">
                  {liveTracker.foundMetrics.length} rows · {reviewedDocumentPhrase}
                </span>
              </div>

              {/* Results table — identical to ResultsPage */}
              {completionDisplayedMetrics.length > 0 && (
                <div className="mx-3 rounded-lg border border-border/25 overflow-hidden bg-bg-card">
                  {completionSecondaryMetrics.length > 0 && !showAdditionalCompletionRows && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs border-b border-border/20 bg-bg-primary/25">
                      <span className="text-text-secondary">
                        Showing direct matches first
                      </span>
                      <span className="text-text-muted/60">
                        {completionSecondaryMetrics.length} broader row{completionSecondaryMetrics.length === 1 ? '' : 's'} hidden
                      </span>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Date</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Fund</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">GP/Manager</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Metric</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Value</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Asset Class</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Src</th>
                        <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Pg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completionDisplayedMetrics.slice(0, 12).map((m, i) => {
                        const isOpen = expandedEvidenceIdx === i;
                        return (
                          <React.Fragment key={i}>
                            <motion.tr
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i * 0.03, 0.6) }}
                              onClick={() => setExpandedEvidenceIdx(isOpen ? null : i)}
                              className={`border-b border-border/50 cursor-pointer transition-colors ${
                                isOpen ? 'bg-bg-hover' : 'hover:bg-bg-hover/50'
                              }`}
                            >
                              <td className="px-4 py-3 text-text-muted whitespace-nowrap">{m.date}</td>
                              <td className="px-4 py-3 text-text-primary max-w-48 truncate">{m.fund}</td>
                              <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{m.gp}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRACKER_METRIC_COLORS[m.metric] || 'bg-bg-hover text-text-secondary'}`}>
                                  {m.metric}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-text-primary font-mono text-xs whitespace-nowrap">{formatDisplayValue(m.value)}</td>
                              <td className="px-4 py-3 text-text-secondary text-xs">{m.asset_class}</td>
                              <td className="px-4 py-3 text-text-muted text-xs max-w-24 truncate">{m.source}</td>
                              <td className="px-4 py-3 text-text-muted text-xs">{m.page}</td>
                            </motion.tr>
                            <AnimatePresence>
                              {isOpen && (
                                <motion.tr
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.25 }}
                                >
                                  <td colSpan={8} className="px-0 py-0">
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="px-6 py-5 bg-bg-tertiary border-b border-border"
                                    >
                                      <div className="flex gap-8">
                                        <div className="space-y-2 min-w-64">
                                          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Metadata</h4>
                                          {[
                                            ['LP', m.lp],
                                            ['Fund', m.fund],
                                            ['GP/Manager', m.gp],
                                            ['Strategy', m.asset_class],
                                            ['Currency', m.value.startsWith('\u20AC') ? 'EUR' : 'USD'],
                                            ['Page', String(m.page)],
                                            ['Confidence', m.confidence],
                                          ].map(([label, val]) => (
                                            <div key={label} className="flex text-sm">
                                              <span className="text-text-muted w-24 shrink-0">{label}</span>
                                              <span className="text-text-primary">{val}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex-1">
                                          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Source Evidence</h4>
                                          {m.evidence && (
                                            <>
                                              <blockquote className="border-l-2 border-accent/40 pl-4 py-2 bg-bg-card rounded-r-lg">
                                                <p className="text-sm text-text-secondary leading-relaxed italic">
                                                  "{trackerHighlightEvidence(m.evidence, m.value)}"
                                                </p>
                                              </blockquote>
                                              <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                                                <FileText className="w-3 h-3" />
                                                {m.source} — Page {m.page}
                                              </p>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {completionSecondaryMetrics.length > 0 && (
                    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs border-t border-border/20 bg-bg-primary/25">
                      <span className="text-text-muted/60">
                        {showAdditionalCompletionRows
                          ? `Showing ${completionSecondaryMetrics.length} broader row${completionSecondaryMetrics.length === 1 ? '' : 's'} as extra context.`
                          : `${completionSecondaryMetrics.length} broader row${completionSecondaryMetrics.length === 1 ? '' : 's'} also appeared in this report.`}
                      </span>
                      <button
                        onClick={() => {
                          setShowAdditionalCompletionRows((current) => !current);
                          setExpandedEvidenceIdx(null);
                        }}
                        className="text-[11px] font-medium text-accent-light hover:text-white transition-colors cursor-pointer"
                      >
                        {showAdditionalCompletionRows ? 'Hide broader rows' : 'Show broader rows'}
                      </button>
                    </div>
                  )}
                  {completionDisplayedMetrics.length > 12 && (
                    <div className="px-4 py-2 text-xs text-text-muted/40 border-t border-border/20 text-center">
                      + {completionDisplayedMetrics.length - 12} more rows in full results
                    </div>
                  )}
                </div>
              )}

              {/* Missing + source + actions */}
              <div className="px-4 pt-3 pb-4">
                {/* Missing metrics */}
                {resultAssessment && resultAssessment.missingFocusMetrics.length > 0 && (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                      <AlertTriangle className="w-3 h-3" />
                      Missing: {resultAssessment.missingFocusMetrics.join(', ')}
                    </span>
                  </div>
                )}
                {resultAssessment?.isWeakMatch && (
                  <p className="mb-2 text-xs text-yellow">{resultAssessment.detail}</p>
                )}

                {/* Source line */}
                {selectedSource && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-text-muted/40">
                      {selectedSource.pensionFund} – {selectedSource.label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      selectedSource.documentType === 'performance' ? 'bg-green/15 text-green'
                        : selectedSource.documentType === 'meeting' || selectedSource.documentType === 'minutes' ? 'bg-yellow/15 text-yellow'
                        : selectedSource.documentType === 'financial' ? 'bg-blue/15 text-blue'
                        : 'bg-accent/15 text-accent-light'
                    }`}>
                      {selectedSource.documentType === 'performance' ? 'Performance Report'
                        : selectedSource.documentType === 'meeting' ? 'Board Meeting'
                        : selectedSource.documentType === 'minutes' ? 'Meeting Minutes'
                        : selectedSource.documentType === 'financial' ? 'Financial Report'
                        : selectedSource.documentType === 'investment' ? 'Investment Report'
                        : 'General'}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-border/15">
                  <div className="flex flex-wrap gap-2">
                    {shouldSuggestAlternativeDocuments && liveTracker.pdfLinks.length > 0 && nextBestPdfCandidate && (
                      <button
                        onClick={tryNextBestPdf}
                        className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent-light hover:bg-accent/15 hover:text-white transition-colors cursor-pointer"
                      >
                        Try next-best document
                      </button>
                    )}
                    {shouldSuggestAlternativeDocuments && liveTracker.sourceCandidates.length > 1 && (
                      <button
                        onClick={backToSources}
                        className="rounded-lg border border-border/50 bg-bg-hover/35 px-3 py-1.5 text-[11px] text-text-secondary hover:text-text-primary hover:border-border transition-colors cursor-pointer"
                      >
                        Try another source
                      </button>
                    )}
                    {shouldSuggestAlternativeDocuments && liveTracker.pdfLinks.length > 0 && (
                      <button
                        onClick={backToPdfs}
                        className="rounded-lg border border-border/50 bg-bg-hover/35 px-3 py-1.5 text-[11px] text-text-muted hover:text-text-secondary hover:border-border transition-colors cursor-pointer"
                      >
                        Review PDF list
                      </button>
                    )}
                    {shouldSuggestAlternativeDocuments && (
                      <button
                        onClick={retryDiscovery}
                        className="rounded-lg border border-transparent px-3 py-1.5 text-[11px] text-text-muted/60 hover:text-text-secondary transition-colors cursor-pointer"
                      >
                        Search again
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => onNavigate('results')}
                    className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                  >
                    {resultAssessment?.isWeakMatch || isPartialMatch ? 'Review Results' : 'View Results'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {liveTracker.status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-2xl border border-red/30 bg-bg-card/80 p-3.5"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {liveTracker.foundMetrics.length === 0 && liveTracker.errorMessage?.includes('No metrics')
                      ? 'No metrics found in reviewed documents'
                      : 'Something blocked the live tracker'}
                  </p>
                  <p className="text-sm text-text-secondary mt-1">{liveTracker.errorMessage}</p>
                  {nextBestPdfCandidate && (
                    <p className="text-xs text-text-muted mt-2">
                      Next most likely file: <span className="text-text-secondary">{nextBestPdfCandidate.link.filename}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {liveTracker.pdfLinks.length > 0 && nextBestPdfCandidate ? (
                      <button
                        onClick={tryNextBestPdf}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                      >
                        Try next-best document
                      </button>
                    ) : liveTracker.pdfLinks.length > 0 ? (
                      <button
                        onClick={backToPdfs}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                      >
                        Review PDF list
                      </button>
                    ) : (
                      <button
                        onClick={retryDiscovery}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                      >
                        Try Again
                      </button>
                    )}
                    {liveTracker.sourceCandidates.length > 1 && (
                      <button
                        onClick={backToSources}
                        className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Try another source
                      </button>
                    )}
                    {liveTracker.pdfLinks.length > 0 && nextBestPdfCandidate && (
                      <button
                        onClick={backToPdfs}
                        className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Choose manually
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
