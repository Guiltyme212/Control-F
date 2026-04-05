import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { detectSearchIntents, extractMetricsFromPdfUrl, discoverSourceCandidates, fetchPdfPreviewSubset, scrapeUrlForPdfs, selectBestPdfWithLLM } from '../utils/api';
import type { PdfCandidate } from '../utils/api';
import { extractPdfPreviewText, scorePreviewText } from '../utils/pdfFilter';
import { assessLiveResult } from '../utils/liveResultAssessment';
import { useAppContext } from '../context/AppContext';
import type { Metric, Page, PdfLink, SearchIntent, Signal, SourceSearchCandidate } from '../data/types';
import { getFocusKeywords, getFocusMetricTargets } from '../utils/searchFocus';

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
const EMPTY_PREVIEW_STATES: Record<string, PdfPreviewState> = {};
const EMPTY_SOURCE_PROBE_STATES: Record<string, SourceProbeState> = {};

function mapSignals(signals: { signal_type: string; description: string }[]): Signal[] {
  return signals.map((signal) => ({
    type: signal.signal_type,
    description: signal.description,
  }));
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
  const [showAllPdfs, setShowAllPdfs] = useState(false);
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
      const logs: { message: string; status: 'info' | 'done' | 'error' }[] = [];
      const addLog = (msg: string, status: 'info' | 'done' | 'error' = 'info') => {
        logs.push({ message: msg, status });
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
        const topSources = candidates.slice(0, 3);
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
        let bestSource = topSources[0];
        let bestSourcePdfCount = 0;
        for (const { source, pdfs } of scrapeResults) {
          for (const pdf of pdfs) {
            allPdfs.push({ url: pdf.url, filename: pdf.filename, sourceLabel: source.label });
          }
          if (pdfs.length > bestSourcePdfCount) {
            bestSourcePdfCount = pdfs.length;
            bestSource = source;
          }
        }

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

        // Step 3: Use LLM to pick the best PDF
        addLog('Asking AI to identify the best PDF for your query...');
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                message: `Found ${allPdfs.length} PDFs. Identifying best match...`,
              }
            : current,
        );

        let selectedPdfs = allPdfs.slice(0, 2); // fallback
        if (effectiveApiKey) {
          try {
            selectedPdfs = await selectBestPdfWithLLM(allPdfs, trackerQuery, effectiveApiKey);
            addLog(`AI selected: ${selectedPdfs.map((p) => p.filename).join(', ')}`, 'done');
          } catch {
            // LLM selection failed — use filename heuristic ranking
            addLog('AI selection unavailable, using heuristic ranking', 'error');
            const intents = detectSearchIntents(trackerQuery);
            const ranked = allPdfs
              .map((pdf) => ({
                pdf,
                score: scorePdfLink({ url: pdf.url, filename: pdf.filename }, intents, trackerQuery, undefined).score,
              }))
              .sort((a, b) => b.score - a.score);
            selectedPdfs = ranked.slice(0, 2).map((r) => r.pdf);
            addLog(`Heuristic selected: ${selectedPdfs[0]?.filename}`, 'done');
          }
        }
        if (cancelled) return;

        const bestPdf = selectedPdfs[0];
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

        // Step 4: Auto-select and go straight to extracting
        const allPdfLinks = allPdfs.map((p) => ({ url: p.url, filename: p.filename }));
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                sourceCandidates: candidates,
                selectedSource: bestSource,
                pdfLinks: allPdfLinks,
                selectedPdfUrls: [bestPdf.url],
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

      const selectedPdfLinks = tracker.pdfLinks.filter((link) => tracker.selectedPdfUrls.includes(link.url));
      const allMetrics: Metric[] = [];
      const allSignals: Signal[] = [];

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
                extractionLogs: [
                  ...current.extractionLogs,
                  { message: `Starting ${pdfLink.filename}`, status: 'info' },
                ],
              }
            : current,
        );

        const log = (message: string, status: 'info' | 'done' | 'error' = 'info') => {
          setLiveTracker((current) =>
            current
              ? {
                  ...current,
                  extractionLogs: [...current.extractionLogs, { message, status }],
                }
              : current,
          );
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
          allMetrics.push(...result.metrics);
          allSignals.push(...mapSignals(result.signals));
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : 'Extraction failed';
          log(`Error: ${message}`, 'error');
        }
      }

      if (cancelled) return;

      if (allMetrics.length === 0) {
        setLiveTracker((current) =>
          current
            ? {
                ...current,
                status: 'error',
                errorMessage: 'No metrics were extracted from the selected PDFs.',
                message: 'No metrics extracted from the selected PDFs.',
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

      setLiveTracker((current) =>
        current
          ? {
              ...current,
              status: 'complete',
              foundMetrics: allMetrics,
              foundSignals: allSignals,
              message: `Found ${allMetrics.length} metric${allMetrics.length === 1 ? '' : 's'}.`,
              errorMessage: '',
            }
          : current,
      );
      setActiveResults({
        id: `results-live-search-${Date.now()}`,
        origin: 'live-search',
        title: liveTrackerQuery,
        query: liveTrackerQuery,
        metrics: allMetrics,
        signals: allSignals,
        selectedSource: liveTrackerSelectedSource,
        sourceSummary: liveTrackerSelectedSource
          ? `${liveTrackerSelectedSource.pensionFund} - ${liveTrackerSelectedSource.label}`
          : 'Live search tracker',
        documentCount: selectedPdfLinks.length,
        createdAt: new Date().toISOString(),
      });
    }

    void runExtraction();

    return () => {
      cancelled = true;
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
    setActiveResults,
    setLiveTracker,
  ]);

  const searchIntents = useMemo(() => detectSearchIntents(liveTracker?.query ?? ''), [liveTracker?.query]);
  const requestedMetricTypes = useMemo(() => getFocusMetricTargets(liveTracker?.query ?? ''), [liveTracker?.query]);
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
          })
        : null,
    [liveTracker],
  );
  const isPartialMatch = !!resultAssessment
    && !resultAssessment.isWeakMatch
    && resultAssessment.focusMetricTypes.length > 0
    && resultAssessment.missingFocusMetrics.length > 0;
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

      for (const candidate of sourceProbeCandidatesToFetch) {
        if (cancelled) return;

        try {
          const pdfLinks = await scrapeUrlForPdfs(candidate.url);
          if (cancelled) return;

          const rankedCandidatePdfs = pdfLinks
            .map((pdfLink) => scorePdfLink(pdfLink, searchIntents, liveTrackerQuery, candidate.documentType))
            .sort((left, right) => right.score - left.score || left.link.filename.localeCompare(right.link.filename));

          let bestPdf = rankedCandidatePdfs[0];
          let bestCombinedScore = bestPdf?.score ?? 0;
          let bestMatchedKeywords: string[] = [];
          let bestMatchedMetricTypes: string[] = [];
          let bestNegativeSignals: string[] = [];
          let bestExcerpt = '';

          for (const pdfCandidate of rankedCandidatePdfs.slice(0, SOURCE_PREFLIGHT_PDF_COUNT)) {
            if (cancelled) return;

            try {
              const subsetBytes = await fetchPdfPreviewSubset(pdfCandidate.link.url, [1, 2, 3, 4, 5]);
              if (cancelled) return;

              const previewText = await extractPdfPreviewText(subsetBytes, 5);
              if (cancelled) return;

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

          const bestPdfScore = bestCombinedScore;
          const bestPdfFilename = bestPdf?.link.filename ?? 'this source';
          const summary = pdfLinks.length === 0
            ? 'No PDFs found on this source page.'
            : bestMatchedMetricTypes.length > 0
              ? `Best file: ${bestPdfFilename}. Preview matched ${bestMatchedMetricTypes.join(', ')}${bestNegativeSignals.length > 0 ? `, but watch for ${bestNegativeSignals.join(', ')}` : ''}.`
              : bestMatchedKeywords.length > 0
                ? `Best file: ${bestPdfFilename}. Preview matched ${bestMatchedKeywords.join(', ')}${bestNegativeSignals.length > 0 ? `, but it still looks ${bestNegativeSignals.join(', ')}` : ''}.`
                : bestPdf
                  ? `Best file by preflight: ${bestPdfFilename}.${bestExcerpt ? ` ${bestExcerpt}` : ''}`
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
              message: 'Extracting metrics from selected PDFs...',
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
            message: 'Extracting metrics from selected PDFs...',
            extractionLogs: [],
            progress: { current: 0, total: current.selectedPdfUrls.length, currentFile: '' },
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

              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-bg-primary/70 p-3 font-mono text-xs">
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
                      <span>{entry.message}</span>
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
              className={`rounded-2xl bg-bg-card/80 p-3.5 ${
                resultAssessment?.isWeakMatch
                  ? 'border border-yellow/25'
                  : isPartialMatch
                    ? 'border border-accent/25'
                    : 'border border-green/20'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {resultAssessment?.isWeakMatch ? (
                      <AlertTriangle className="w-4 h-4 text-yellow" />
                    ) : isPartialMatch ? (
                      <AlertTriangle className="w-4 h-4 text-accent-light" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green" />
                    )}
                    <span className="text-sm font-medium text-text-primary">
                      {resultAssessment?.isWeakMatch
                        ? 'Extraction complete, but this looks like a weak match'
                        : isPartialMatch
                          ? 'Extraction complete, and this looks like a partial match'
                          : 'Extraction complete'}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary">
                    Found {liveTracker.foundMetrics.length} metric{liveTracker.foundMetrics.length === 1 ? '' : 's'} from{' '}
                    {liveTracker.selectedPdfUrls.length} PDF{liveTracker.selectedPdfUrls.length === 1 ? '' : 's'}.
                  </p>
                  {(resultAssessment?.isWeakMatch || isPartialMatch) && (
                    <>
                      <p className={`mt-1 text-xs ${resultAssessment?.isWeakMatch ? 'text-yellow' : 'text-accent-light'}`}>
                        {resultAssessment?.detail}
                      </p>
                      {resultAssessment && resultAssessment.missingFocusMetrics.length > 0 && (
                        <p className="mt-1 text-[11px] text-text-muted">
                          Missing: {resultAssessment.missingFocusMetrics.join(', ')}
                        </p>
                      )}
                    </>
                  )}
                  {selectedSource && (
                    <p className="text-xs text-text-muted mt-1">
                      Source: {selectedSource.pensionFund} - {selectedSource.label}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {liveTracker.pdfLinks.length > 0 && (
                    <button
                      onClick={backToPdfs}
                      className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Try Another PDF
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('results')}
                    className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                  >
                    {resultAssessment?.isWeakMatch || isPartialMatch ? 'Review Results' : 'View Results'}
                  </button>
                  <button
                    onClick={retryDiscovery}
                    className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    Search Again
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
                  <p className="text-sm font-medium text-text-primary">Something blocked the live tracker</p>
                  <p className="text-sm text-text-secondary mt-1">{liveTracker.errorMessage}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {liveTracker.pdfLinks.length > 0 ? (
                      <button
                        onClick={backToPdfs}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                      >
                        Back to PDFs
                      </button>
                    ) : (
                      <button
                        onClick={retryDiscovery}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                      >
                        Try Again
                      </button>
                    )}
                    {liveTracker.sourceCandidates.length > 0 && liveTracker.pdfLinks.length === 0 && (
                      <button
                        onClick={backToSources}
                        className="px-4 py-2 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                      >
                        Choose Another Source
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
