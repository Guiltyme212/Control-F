import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Filter, Download, Bookmark, ChevronDown, ChevronUp, FileText, TrendingUp, TrendingDown, AlertTriangle, Zap, DollarSign, BarChart3, ArrowUpDown, X, Building2, Users, ArrowUpRight, Layers } from 'lucide-react';
import { metrics, signals, getCommitmentTotal } from '../data/metrics';
import { useCountUp } from '../hooks/useCountUp';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';
import { exportToCSV, exportToJSON } from '../utils/export';
import { assessLiveResult, isNoActivityValue } from '../utils/liveResultAssessment';
import type { Metric, ReviewedDocument } from '../data/types';
import { useAppContext } from '../context/AppContext';
import { metricMatchesRequestedFocus } from '../utils/searchFocus';
import { deriveSignalsFromMetrics } from '../utils/deriveSignals';
import { formatDisplayValue } from '../utils/formatValue';

const preferredMetricOrder = [
  'Commitment',
  'Co-Investment',
  'IRR',
  'TVPI',
  'DPI',
  'NAV',
  'AUM',
  'Asset Allocation',
  'Target Return',
  'Target Fund Size',
  'Management Fee',
  'Carry',
  'Distribution',
  'Capital Call',
  'Termination',
  'Performance',
];

const preferredAssetClassOrder = [
  'Infrastructure',
  'Real Assets',
  'Private Markets',
  'Private Equity',
  'Private Credit',
  'Credit',
  'Public Equity',
  'Public Equities',
  'Public Fixed Income',
  'Fixed Income',
  'Real Estate',
  'Natural Resources',
  'Total Fund',
];

const REQUESTED_METRICS_FILTER = '__requested_metrics__';

const metricColors: Record<string, string> = {
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

const signalIcons: Record<string, React.ElementType> = {
  'Multi-LP Signal': Zap,
  'Large Termination': AlertTriangle,
  'New High': TrendingUp,
  'Infrastructure Secondaries': BarChart3,
  'GP Fundraising Signal': TrendingUp,
  'Performance Divergence': TrendingDown,
  'Real Estate Rotation': Building2,
  'Credit Allocation': DollarSign,
  'Co-Investment Trend': Users,
  'Fee Compression': TrendingDown,
  'AUM Milestone': BarChart3,
  'Natural Resources Momentum': Zap,
  'Manager Concentration': Layers,
  'Distribution Uptick': ArrowUpRight,
};

const signalColors: Record<string, string> = {
  'Multi-LP Signal': 'border-l-accent-light',
  'Large Termination': 'border-l-red',
  'New High': 'border-l-green',
  'Infrastructure Secondaries': 'border-l-cyan',
  'GP Fundraising Signal': 'border-l-purple',
  'Performance Divergence': 'border-l-yellow',
  'Real Estate Rotation': 'border-l-orange',
  'Credit Allocation': 'border-l-blue',
  'Co-Investment Trend': 'border-l-cyan',
  'Fee Compression': 'border-l-green',
  'AUM Milestone': 'border-l-accent',
  'Natural Resources Momentum': 'border-l-orange',
  'Manager Concentration': 'border-l-purple',
  'Distribution Uptick': 'border-l-green',
};

type SortField = 'date' | 'lp' | 'fund' | 'gp' | 'metric' | 'value' | 'asset_class';
type SortDir = 'asc' | 'desc';

function sortByPreferred(values: string[], preferredOrder: string[]): string[] {
  const order = new Map(preferredOrder.map((value, index) => [value, index]));
  return [...values].sort((a, b) => {
    const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.localeCompare(b);
  });
}

function formatMetricList(metricTypes: string[]): string {
  if (metricTypes.length === 0) return '';
  if (metricTypes.length === 1) return metricTypes[0];
  if (metricTypes.length === 2) return `${metricTypes[0]} and ${metricTypes[1]}`;
  return `${metricTypes.slice(0, -1).join(', ')}, and ${metricTypes[metricTypes.length - 1]}`;
}

function filenameFromUrl(url: string): string {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return filename || 'selected.pdf';
  } catch {
    return 'selected.pdf';
  }
}

function highlightEvidence(evidence: string, value: string): React.ReactNode {
  const candidates: string[] = [];

  candidates.push(value);

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
      return (
        <>
          {before}<span className="font-bold text-accent-light not-italic">{match}</span>{after}
        </>
      );
    }
  }

  return evidence;
}

export function ResultsPage() {
  const { liveTracker, activeResults } = useAppContext();
  const [metricFilterState, setMetricFilterState] = useState<{ resultId: string | null; value: string }>({
    resultId: null,
    value: 'All',
  });
  const [assetFilter, setAssetFilter] = useState('All');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSavePopover, setShowSavePopover] = useState(false);
  const [saveTrackerName, setSaveTrackerName] = useState('Custom search');
  const [saveFrequency, setSaveFrequency] = useState('Weekly');
  const [showAllSignals, setShowAllSignals] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  const exportMenuRef = useRef<HTMLDivElement>(null);
  const savePopoverRef = useRef<HTMLDivElement>(null);
  const fallbackLiveResults = useMemo(
    () =>
      liveTracker?.status === 'complete' && liveTracker.foundMetrics.length
        ? {
            id: `fallback-live-${liveTracker.id}`,
            origin: 'live-search' as const,
            title: liveTracker.query,
            query: liveTracker.query,
            assetClassHints: liveTracker.assetClasses,
            metrics: liveTracker.foundMetrics,
            signals: liveTracker.foundSignals,
            selectedSource: liveTracker.selectedSource,
            sourceSummary: liveTracker.selectedSource
              ? `${liveTracker.selectedSource.pensionFund} - ${liveTracker.selectedSource.label}`
              : 'Live search tracker',
            documentCount: liveTracker.selectedPdfUrls.length || 1,
            reviewedDocuments: liveTracker.selectedPdfUrls.map((url) => ({
              url,
              filename: filenameFromUrl(url),
              sourceLabel: liveTracker.selectedSource?.label ?? '',
              status: 'selected',
            } as ReviewedDocument)),
            createdAt: liveTracker.createdAt,
          }
        : null,
    [liveTracker],
  );
  const currentResults = activeResults ?? fallbackLiveResults;
  const currentResultsId = currentResults?.id ?? null;
  const liveAssessment = useMemo(
    () =>
      currentResults?.origin === 'live-search'
        ? assessLiveResult({
            query: currentResults.query,
            assetClassHints: currentResults.assetClassHints,
            metrics: currentResults.metrics,
            selectedSource: currentResults.selectedSource,
            documentCount: currentResults.documentCount,
          })
        : null,
    [currentResults],
  );
  const isRealResult = !!currentResults?.metrics.length;

  const displayMetrics = useMemo(
    () => (currentResults?.metrics.length ? currentResults.metrics : metrics),
    [currentResults],
  );
  const displaySignals = useMemo(() => {
    if (!currentResults) return signals;
    if (liveAssessment?.hideSignals) return [];
    if (currentResults.signals.length > 0) return currentResults.signals;
    return deriveSignalsFromMetrics(currentResults.metrics);
  }, [currentResults, liveAssessment, signals]);
  const metricOptions = useMemo(() => {
    const availableMetrics = Array.from(
      new Set([
        ...displayMetrics.map((metric) => metric.metric).filter(Boolean),
        ...(liveAssessment?.focusMetricTypes ?? []),
      ]),
    );
    const options = ['All', ...sortByPreferred(availableMetrics, preferredMetricOrder)];
    if (liveAssessment?.focusMetricTypes.length) {
      options.splice(1, 0, REQUESTED_METRICS_FILTER);
    }
    return options;
  }, [displayMetrics, liveAssessment]);
  const assetOptions = useMemo(() => {
    const availableAssetClasses = Array.from(new Set(displayMetrics.map((metric) => metric.asset_class).filter(Boolean)));
    return ['All', ...sortByPreferred(availableAssetClasses, preferredAssetClassOrder)];
  }, [displayMetrics]);
  const documentCount = currentResults?.reviewedDocuments?.length
    ?? currentResults?.documentCount
    ?? new Set(displayMetrics.map((metric) => metric.source)).size;
  const reviewedDocuments = currentResults?.reviewedDocuments ?? [];
  const reviewedDocumentNoun = documentCount === 1 ? 'PDF' : 'PDFs';
  const reviewedDocumentPhrase = `${documentCount} reviewed ${reviewedDocumentNoun}`;
  const resultModeLabel = currentResults?.origin === 'upload-file'
    ? 'Uploaded PDF'
    : currentResults?.origin === 'upload-scrape'
      ? 'Scraped URL'
      : currentResults?.origin === 'live-search'
        ? 'Live search'
        : 'Demo';

  const metricsCount = useCountUp(displayMetrics.length, 1200);
  const actionableCommitmentCount = useMemo(
    () =>
      liveAssessment
        ? liveAssessment.actionableCommitments.length
        : displayMetrics.filter((metric) => metric.metric === 'Commitment' && !isNoActivityValue(metric.value)).length,
    [displayMetrics, liveAssessment],
  );
  const signalsCount = useCountUp(displaySignals.length, 1000);
  const fundsCount = useCountUp(new Set(displayMetrics.map(m => m.lp)).size, 800);
  const performanceMetricCount = liveAssessment?.performanceMetrics.length ?? 0;
  const matchedFocusMetricTypeCount = liveAssessment
    ? new Set(liveAssessment.matchedFocusMetrics.map((metric) => metric.metric)).size
    : 0;

  const commitmentTotalStr = useMemo(() => {
    const total = currentResults?.metrics.length
      ? displayMetrics.reduce((sum, metric) => {
          if (metric.metric !== 'Commitment') return sum;
          const rawValue = metric.value.replace(/,/g, '');
          const euroMatch = rawValue.match(/€([\d.]+)/);
          if (euroMatch) return sum + parseFloat(euroMatch[1]) * 1.08;
          const usdMatch = rawValue.match(/\$([\d.]+)/);
          if (usdMatch) return sum + parseFloat(usdMatch[1]);
          return sum;
        }, 0)
      : getCommitmentTotal();
    if (isRealResult && total === 0) {
      return liveAssessment?.isWeakMatch ? 'No direct dollar commitments found' : 'No numeric commitment totals found';
    }
    return total >= 1_000_000_000 ? `~$${(total / 1_000_000_000).toFixed(1)}B total` : `~$${(total / 1_000_000).toFixed(0)}M total`;
  }, [currentResults, displayMetrics, isRealResult, liveAssessment]);

  const secondaryStat = useMemo(() => {
    if (liveAssessment?.intents.includes('performance')) {
      if (liveAssessment.focusMetricTypes.length > 0) {
        const matchedFocusMetricLabel = matchedFocusMetricTypeCount > 0
          ? formatMetricList(Array.from(new Set(liveAssessment.matchedFocusMetrics.map((metric) => metric.metric))))
          : '';
        const missingFocusMetricLabel = formatMetricList(liveAssessment.missingFocusMetrics);
        return {
          rawCount: matchedFocusMetricTypeCount,
          label: 'target metrics found',
          sub: matchedFocusMetricTypeCount > 0
            ? liveAssessment.missingFocusMetrics.length > 0
              ? `Matched ${matchedFocusMetricLabel}; missing ${missingFocusMetricLabel}`
              : `Matched ${matchedFocusMetricLabel}`
            : `No ${formatMetricList(liveAssessment.focusMetricTypes)} found in the reviewed ${reviewedDocumentNoun}`,
        };
      }

      const surfacedMetricTypes = new Set(liveAssessment.performanceMetrics.map((metric) => metric.metric)).size;
      return {
        rawCount: performanceMetricCount,
        label: 'performance metrics found',
        sub: performanceMetricCount > 0
          ? `${surfacedMetricTypes} metric type${surfacedMetricTypes === 1 ? '' : 's'} surfaced`
          : 'No direct performance metrics found',
      };
    }

    return {
      rawCount: actionableCommitmentCount,
      label: 'commitments found',
      sub: commitmentTotalStr,
    };
  }, [actionableCommitmentCount, commitmentTotalStr, liveAssessment, matchedFocusMetricTypeCount, performanceMetricCount, reviewedDocumentNoun]);
  const secondaryCount = useCountUp(secondaryStat.rawCount, 1200);

  const liveAlert = useMemo(() => {
    if (!currentResults?.metrics.length) return '';
    if (liveAssessment?.isWeakMatch) {
      return `${currentResults.selectedSource?.pensionFund || currentResults.title} is a weak match for this query. ${liveAssessment.headline}`;
    }
    if (liveAssessment?.focusMetricTypes.length && liveAssessment.missingFocusMetrics.length > 0) {
      return `${currentResults.selectedSource?.pensionFund || currentResults.title} partially answered this query. Matched ${formatMetricList(Array.from(new Set(liveAssessment.matchedFocusMetrics.map((metric) => metric.metric))))}; still missing ${formatMetricList(liveAssessment.missingFocusMetrics)}.`;
    }
    // For broad queries, summarize what was found across asset classes
    const meaningfulMetrics = currentResults.metrics.filter((m) => m.value.trim().toLowerCase() !== 'no activity');
    const assetClasses = Array.from(new Set(meaningfulMetrics.map((m) => m.asset_class).filter(Boolean)));
    const metricTypes = Array.from(new Set(meaningfulMetrics.map((m) => m.metric).filter(Boolean)));
    const fund = currentResults.selectedSource?.pensionFund || currentResults.title;
    if (assetClasses.length > 1) {
      return `${fund}: found ${metricTypes.length} metric type${metricTypes.length === 1 ? '' : 's'} across ${assetClasses.length} asset classes from the reviewed document${documentCount === 1 ? '' : 's'}.`;
    }
    return `${fund}: found ${meaningfulMetrics.length} data point${meaningfulMetrics.length === 1 ? '' : 's'} in the reviewed document${documentCount === 1 ? '' : 's'}.`;
  }, [currentResults, documentCount, liveAssessment]);
  const defaultMetricFilter = currentResults?.origin === 'live-search' && liveAssessment?.focusMetricTypes.length
    ? REQUESTED_METRICS_FILTER
    : 'All';
  const candidateMetricFilter = metricFilterState.resultId === currentResultsId
    ? metricFilterState.value
    : defaultMetricFilter;
  const selectedMetricFilter = metricOptions.includes(candidateMetricFilter) ? candidateMetricFilter : defaultMetricFilter;
  const selectedAssetFilter = assetOptions.includes(assetFilter) ? assetFilter : 'All';

  const filtered = useMemo(() => {
    let result = [...displayMetrics];
    if (selectedMetricFilter === REQUESTED_METRICS_FILTER && liveAssessment?.focusMetricTypes.length) {
      result = result.filter((metric) => metricMatchesRequestedFocus(metric, liveAssessment.focusMetricTypes));
    } else if (selectedMetricFilter !== 'All') {
      result = result.filter(m => m.metric === selectedMetricFilter);
    }
    if (selectedAssetFilter !== 'All') result = result.filter(m => m.asset_class === selectedAssetFilter);
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [displayMetrics, liveAssessment, selectedAssetFilter, selectedMetricFilter, sortDir, sortField]);

  const uniformLp = useMemo(() => {
    const lps = new Set(filtered.map((m) => m.lp).filter(Boolean));
    return lps.size === 1 ? [...lps][0] : null;
  }, [filtered]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Close dropdowns on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
      setShowExportMenu(false);
    }
    if (savePopoverRef.current && !savePopoverRef.current.contains(e.target as Node)) {
      setShowSavePopover(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const handleExportCSV = () => {
    exportToCSV(filtered, 'control-f-metrics');
    showToast(`Exported ${filtered.length} metrics as CSV`, 'success');
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    exportToJSON(filtered, 'control-f-metrics');
    showToast(`Exported ${filtered.length} metrics as JSON`, 'success');
    setShowExportMenu(false);
  };

  const handleSaveSearch = () => {
    const existingRaw = sessionStorage.getItem('saved_trackers');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const newTracker = {
      id: `tracker-${Date.now()}`,
      name: saveTrackerName || 'Custom search',
      status: 'active' as const,
      sources: 0,
      metrics: filtered.length,
      last_match: 'Never',
      frequency: saveFrequency,
      query: `${selectedMetricFilter} / ${selectedAssetFilter}`,
      filters: {
        metricType: selectedMetricFilter !== 'All'
          ? selectedMetricFilter === REQUESTED_METRICS_FILTER
            ? liveAssessment?.focusMetricTypes.join(', ')
            : selectedMetricFilter
          : undefined,
        assetClass: selectedAssetFilter !== 'All' ? selectedAssetFilter : undefined,
      },
    };
    existing.push(newTracker);
    sessionStorage.setItem('saved_trackers', JSON.stringify(existing));
    showToast('Search saved as tracker', 'success');
    setShowSavePopover(false);
    setSaveTrackerName('Custom search');
    setSaveFrequency('Weekly');
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="inline-flex ml-1">
      {sortField === field ? (
        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-30" />
      )}
    </span>
  );

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Alert Banner */}
      <AnimatePresence>
        {!alertDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0, padding: 0, overflow: 'hidden' }}
            transition={{ duration: 0.3 }}
            className="mb-6 p-4 rounded-xl bg-gradient-to-r from-accent-glow to-transparent border border-accent/20 flex items-center gap-3"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Bell className="w-5 h-5 text-accent-light" />
            </motion.div>
            <p className="text-sm text-text-primary flex-1">
              {liveAlert ? (
                <>
                  <span className="font-semibold">{resultModeLabel}</span> - {liveAlert}
                </>
              ) : (
                <>
                  <span className="font-semibold">Change detected</span> - DCRB total fund value reached new high of <span className="text-accent-light font-semibold">$14.1B</span> (up from $13.2B). Calendar year 2025 net return: 14.1%
                </>
              )}
            </p>
            <button
              onClick={() => setAlertDismissed(true)}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1 rounded-lg hover:bg-bg-hover shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {liveAssessment?.isWeakMatch && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-6 flex items-start gap-3 rounded-xl border border-yellow/25 bg-yellow/5 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow" />
          <div>
            <p className="text-sm font-medium text-text-primary">This extraction is probably not the answer you want yet.</p>
            <p className="mt-1 text-sm text-text-secondary">{liveAssessment.detail}</p>
          </div>
        </motion.div>
      )}

      {!!liveAssessment && !liveAssessment.isWeakMatch && liveAssessment.focusMetricTypes.length > 0 && liveAssessment.missingFocusMetrics.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-6 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4"
        >
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent-light" />
          <div>
            <p className="text-sm font-medium text-text-primary">This run found part of the answer.</p>
            <p className="mt-1 text-sm text-text-secondary">
              Matched {formatMetricList(Array.from(new Set(liveAssessment.matchedFocusMetrics.map((metric) => metric.metric))))}, but still missing {formatMetricList(liveAssessment.missingFocusMetrics)}.
            </p>
          </div>
        </motion.div>
      )}

      {!!liveAssessment?.proxyFocusMetrics.length && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-text-primary">Proxy-style rows were surfaced, but they are not counted as exact hits.</p>
            <p className="mt-1 text-sm text-text-secondary">
              {formatMetricList(Array.from(new Set(liveAssessment.proxyFocusMetrics.map((metric) => metric.metric))))} appeared in the reviewed files, but Control F kept those separate from direct matches.
            </p>
          </div>
        </motion.div>
      )}

      {currentResults && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-3 text-sm text-text-secondary">
          <FileText className="h-4 w-4 text-accent-light" />
          <span className="font-medium text-text-primary">{resultModeLabel}</span>
          <span className="text-text-muted">•</span>
          <span className="truncate">{currentResults.sourceSummary}</span>
          <span className="text-text-muted">•</span>
          <span>{reviewedDocumentPhrase}</span>
          {currentResults.selectedSource?.documentType && (
            <>
              <span className="text-text-muted">•</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                currentResults.selectedSource.documentType === 'performance'
                  ? 'bg-green/15 text-green'
                  : currentResults.selectedSource.documentType === 'meeting' || currentResults.selectedSource.documentType === 'minutes'
                    ? 'bg-yellow/15 text-yellow'
                    : currentResults.selectedSource.documentType === 'financial'
                      ? 'bg-blue/15 text-blue'
                      : 'bg-accent/15 text-accent-light'
              }`}>
                {currentResults.selectedSource.documentType === 'performance' ? 'Performance Report'
                  : currentResults.selectedSource.documentType === 'meeting' ? 'Board Meeting'
                  : currentResults.selectedSource.documentType === 'minutes' ? 'Meeting Minutes'
                  : currentResults.selectedSource.documentType === 'financial' ? 'Financial Report'
                  : currentResults.selectedSource.documentType === 'investment' ? 'Investment Report'
                  : 'General'}
              </span>
            </>
          )}
          {liveAssessment?.completeness && (
            <>
              <span className="text-text-muted">•</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                liveAssessment.completeness === 'complete'
                  ? 'bg-green/15 text-green'
                  : liveAssessment.completeness === 'partial'
                    ? 'bg-accent/15 text-accent-light'
                    : liveAssessment.completeness === 'weak'
                      ? 'bg-yellow/15 text-yellow'
                      : 'bg-accent/15 text-accent-light'
              }`}>
                {liveAssessment.completeness === 'complete' ? 'Complete'
                  : liveAssessment.completeness === 'partial' ? 'Partial'
                  : liveAssessment.completeness === 'weak' ? 'Weak Match'
                  : 'Partial from Subset'}
              </span>
            </>
          )}
        </div>
      )}

      {reviewedDocuments.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Reviewed files</span>
            {reviewedDocuments.map((document) => (
              <span key={document.url} className="rounded-full border border-border/80 bg-bg-hover px-2.5 py-1">
                {document.filename}
                {document.status === 'rejected'
                  ? ` • skipped before Claude`
                  : document.pageSubsetStrategy === 'filtered-subset'
                    ? ` • ${document.pagesReviewed ?? document.reviewedPages?.length ?? 0}/${document.totalPages ?? 0} pages`
                    : document.pagesReviewed
                      ? ` • ${document.pagesReviewed} pages`
                      : ''}
                {document.costUsd !== undefined ? ` • $${document.costUsd.toFixed(3)}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Answer Summary — What was found / What is missing */}
      {currentResults?.origin === 'live-search' && liveAssessment && (() => {
        const meaningful = currentResults.metrics.filter((m) => m.value.trim().toLowerCase() !== 'no activity');
        const assetClasses = Array.from(new Set(meaningful.map((m) => m.asset_class).filter(Boolean)));
        const metricTypesFound = Array.from(new Set(meaningful.map((m) => m.metric).filter(Boolean)));
        const missing = liveAssessment.missingFocusMetrics;
        const hasGaps = missing.length > 0 || liveAssessment.isWeakMatch;

        return (assetClasses.length > 0 || hasGaps) ? (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-green/15 bg-green/5 p-4">
              <p className="text-xs font-semibold text-green uppercase tracking-wider mb-2">What was found</p>
              <div className="space-y-1">
                {assetClasses.slice(0, 6).map((ac) => {
                  const acMetrics = meaningful.filter((m) => m.asset_class === ac);
                  const seen = new Set<string>();
                  const uniqueByType = acMetrics.filter((m) => { if (seen.has(m.metric)) return false; seen.add(m.metric); return true; });
                  const valueParts = uniqueByType.slice(0, 4).map((m) => `${m.metric} ${formatDisplayValue(m.value)}`);
                  const extra = uniqueByType.length - 4;
                  return (
                    <p key={ac} className="text-sm text-text-secondary">
                      <span className="text-text-primary font-medium">{ac}</span>
                      <span className="text-text-muted"> — </span>
                      <span className="font-mono text-xs text-text-secondary">{valueParts.join(' · ')}{extra > 0 ? ` + ${extra} more` : ''}</span>
                    </p>
                  );
                })}
                {assetClasses.length > 6 && (
                  <p className="text-xs text-text-muted">+ {assetClasses.length - 6} more asset classes</p>
                )}
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${hasGaps ? 'border-yellow/15 bg-yellow/5' : 'border-green/15 bg-green/5'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${hasGaps ? 'text-yellow' : 'text-green'}`}>
                {hasGaps ? 'What is missing' : 'Completeness'}
              </p>
              <div className="space-y-1">
                {missing.length > 0 && (
                  <p className="text-sm text-text-secondary">
                    {formatMetricList(missing)} not found in reviewed {reviewedDocumentNoun}
                  </p>
                )}
                {liveAssessment.isWeakMatch && (
                  <p className="text-sm text-text-secondary">{liveAssessment.detail}</p>
                )}
                {!hasGaps && (
                  <p className="text-sm text-text-secondary">All requested metrics found in the reviewed {reviewedDocumentNoun}.</p>
                )}
                <p className="text-xs text-text-muted mt-1">
                  {metricTypesFound.length} metric type{metricTypesFound.length === 1 ? '' : 's'} across {assetClasses.length} asset class{assetClasses.length === 1 ? '' : 'es'} from {reviewedDocumentPhrase}
                </p>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          liveAssessment?.focusMetricTypes.length
            ? {
                value: matchedFocusMetricTypeCount,
                label: `of ${liveAssessment.focusMetricTypes.length} target metrics`,
                sub: `${metricsCount} total rows from ${reviewedDocumentPhrase}`,
                icon: FileText,
              }
            : { value: metricsCount, label: 'metrics extracted', sub: `from ${reviewedDocumentPhrase}`, icon: FileText },
          { value: secondaryCount, label: secondaryStat.label, sub: secondaryStat.sub, icon: DollarSign },
          { value: signalsCount, label: 'intelligence signals', sub: liveAssessment?.isWeakMatch ? 'hidden until relevance improves' : 'actionable insights', icon: Zap },
          { value: fundsCount, label: 'pension funds scanned', sub: isRealResult ? `from this ${resultModeLabel.toLowerCase()}` : 'US public funds', icon: BarChart3 },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-accent-light" />
              <span className="text-3xl font-bold text-text-primary">{stat.value}</span>
            </div>
            <p className="text-sm text-text-secondary">{stat.label}</p>
            <p className="text-xs text-text-muted mt-0.5">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Intelligence Signals */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Intelligence Signals</h3>
          {displaySignals.length > 4 && (
            <button
              onClick={() => setShowAllSignals(prev => !prev)}
              className="text-xs text-accent-light hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
            >
              {showAllSignals ? 'Show fewer' : `Show all ${displaySignals.length} signals`}
              {showAllSignals ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
        {displaySignals.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-card p-4 text-sm text-text-secondary">
            {liveAssessment?.isWeakMatch
              ? 'Signals are hidden for this run because the selected PDF does not look like a strong answer to the search yet.'
              : currentResults
                ? 'No cross-reference signals were generated for this extraction yet.'
                : 'No signals available.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {(showAllSignals ? displaySignals : displaySignals.slice(0, 4)).map((signal, i) => {
                const Icon = signalIcons[signal.type] || Zap;
                return (
                  <motion.div
                    key={signal.type}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    layout
                    className={`bg-bg-card border border-border rounded-xl p-4 border-l-4 ${signalColors[signal.type] || 'border-l-accent'}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="w-4 h-4 text-text-secondary" />
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{signal.type}</span>
                    </div>
                    <p className="text-sm text-text-primary leading-relaxed">{signal.description}</p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-text-muted" />
        <div className="relative">
          <select
            value={selectedMetricFilter}
            onChange={(e) => setMetricFilterState({ resultId: currentResultsId, value: e.target.value })}
            className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none pr-8 cursor-pointer"
          >
            {metricOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'All' ? 'All Metrics' : option === REQUESTED_METRICS_FILTER ? 'Requested Metrics' : option}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={selectedAssetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none pr-8 cursor-pointer"
          >
            {assetOptions.map(t => <option key={t} value={t}>{t === 'All' ? 'All Asset Classes' : t}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={filtered.length}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-xs text-text-muted ml-2"
          >
            Showing {filtered.length} of {displayMetrics.length} metrics
          </motion.span>
        </AnimatePresence>
        <div className="ml-auto flex gap-2">
          {/* Save Search Button */}
          <div className="relative" ref={savePopoverRef}>
            <button
              onClick={() => { setShowSavePopover(!showSavePopover); setShowExportMenu(false); }}
              className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5" /> Save Search
            </button>
            <AnimatePresence>
              {showSavePopover && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-10 w-72 bg-bg-secondary border border-border rounded-xl shadow-xl z-20 p-4"
                >
                  <h4 className="text-sm font-semibold text-text-primary mb-3">Save as Tracker</h4>
                  <div className="mb-3">
                    <label className="text-xs text-text-muted mb-1 block">Name</label>
                    <input
                      type="text"
                      value={saveTrackerName}
                      onChange={(e) => setSaveTrackerName(e.target.value)}
                      className="w-full bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                      placeholder="Tracker name..."
                    />
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-text-muted mb-1 block">Frequency</label>
                    <div className="relative">
                      <select
                        value={saveFrequency}
                        onChange={(e) => setSaveFrequency(e.target.value)}
                        className="w-full bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent/50 appearance-none pr-8 cursor-pointer"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveSearch}
                      className="flex-1 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSavePopover(false)}
                      className="px-3 py-1.5 rounded-lg bg-bg-hover border border-border text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Export Button */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => { setShowExportMenu(!showExportMenu); setShowSavePopover(false); }}
              className="px-3 py-1.5 rounded-lg bg-bg-card border border-border text-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-10 w-48 bg-bg-secondary border border-border rounded-lg shadow-xl z-20 overflow-hidden"
                >
                  <button
                    onClick={handleExportCSV}
                    className="w-full px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left cursor-pointer flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Export as CSV
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="w-full px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left cursor-pointer flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Export as JSON
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Results Table */}
      {uniformLp && (
        <p className="text-xs text-text-muted mb-2">
          <Building2 className="w-3 h-3 inline mr-1" />
          LP: <span className="text-text-secondary font-medium">{uniformLp}</span>
        </p>
      )}
      <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {([
                ['date', 'Date'],
                ...(uniformLp ? [] : [['lp', 'LP']]),
                ['fund', 'Fund'],
                ['gp', 'GP/Manager'],
                ['metric', 'Metric'],
                ['value', 'Value'],
                ['asset_class', 'Asset Class'],
              ] as [SortField, string][]).map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => toggleSort(field)}
                  className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors"
                >
                  {label}
                  <SortIcon field={field} />
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Src</th>
              <th className="px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Pg</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m: Metric, i: number) => (
              <TableRow
                key={`${m.fund}-${m.date}-${i}`}
                metric={m}
                index={i}
                isExpanded={expandedRow === i}
                onToggle={() => setExpandedRow(expandedRow === i ? null : i)}
                hideLp={!!uniformLp}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function TableRow({ metric: m, index, isExpanded, onToggle, hideLp }: {
  metric: Metric;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  hideLp?: boolean;
}) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.03, 0.6) }}
        onClick={onToggle}
        className={`border-b border-border/50 cursor-pointer transition-colors ${
          isExpanded ? 'bg-bg-hover' : 'hover:bg-bg-hover/50'
        }`}
      >
        <td className="px-4 py-3 text-text-muted whitespace-nowrap">{m.date}</td>
        {!hideLp && <td className="px-4 py-3 text-text-primary font-medium whitespace-nowrap">{m.lp}</td>}
        <td className="px-4 py-3 text-text-primary max-w-48 truncate">{m.fund}</td>
        <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{m.gp}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${metricColors[m.metric] || 'bg-bg-hover text-text-secondary'}`}>
            {m.metric}
          </span>
        </td>
        <td className="px-4 py-3 text-text-primary font-mono text-xs whitespace-nowrap">{formatDisplayValue(m.value)}</td>
        <td className="px-4 py-3 text-text-secondary text-xs">{m.asset_class}</td>
        <td className="px-4 py-3 text-text-muted text-xs max-w-24 truncate">{m.source}</td>
        <td className="px-4 py-3 text-text-muted text-xs">{m.page}</td>
      </motion.tr>
      <AnimatePresence>
        {isExpanded && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <td colSpan={hideLp ? 8 : 9} className="px-0 py-0">
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
                    <blockquote className="border-l-2 border-accent/40 pl-4 py-2 bg-bg-card rounded-r-lg">
                      <p className="text-sm text-text-secondary leading-relaxed italic">
                        "{highlightEvidence(m.evidence, m.value)}"
                      </p>
                    </blockquote>
                    <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      {m.source} — Page {m.page}
                    </p>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}
