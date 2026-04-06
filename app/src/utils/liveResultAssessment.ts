import type { Metric, SearchIntent, SourceSearchCandidate } from '../data/types';
import { detectSearchIntents } from './api';
import {
  getFocusMetricTargets,
  isBroadAllocationMetric,
  isPerformanceMultiple,
  isProxyMetricMatch,
  metricMatchesRequestedFocus,
  sortMetricNames,
} from './searchFocus';

interface AssessLiveResultArgs {
  query: string;
  metrics: Metric[];
  selectedSource?: SourceSearchCandidate | null;
  documentCount?: number;
  assetClassHints?: string[];
}

export type CompletenessLabel = 'complete' | 'partial' | 'weak';

export interface LiveResultAssessment {
  isWeakMatch: boolean;
  completeness: CompletenessLabel;
  headline: string;
  detail: string;
  hideSignals: boolean;
  intents: SearchIntent[];
  focusMetricTypes: string[];
  meaningfulMetrics: Metric[];
  matchedFocusMetrics: Metric[];
  proxyFocusMetrics: Metric[];
  missingFocusMetrics: string[];
  performanceMetrics: Metric[];
  actionableCommitments: Metric[];
  infrastructureCommitments: Metric[];
}

export function isNoActivityValue(value: string): boolean {
  return value.trim().toLowerCase() === 'no activity';
}

function metricText(metric: Metric): string {
  return `${metric.metric} ${metric.asset_class} ${metric.fund} ${metric.gp} ${metric.evidence}`.toLowerCase();
}

const PERFORMANCE_METRIC_TYPES = new Set([
  'IRR',
  'TVPI',
  'DPI',
  'NAV',
  'AUM',
  'Asset Allocation',
  'Target Return',
  'Distribution',
  'Performance',
]);

function deriveCompleteness(
  isWeakMatch: boolean,
  focusMetricTypes: string[],
  missingFocusMetrics: string[],
  matchedFocusMetrics: Metric[],
  meaningfulMetricCount: number,
): CompletenessLabel {
  if (isWeakMatch) return 'weak';
  if (focusMetricTypes.length === 0) {
    // Broad query — complete only if we actually found meaningful metrics
    return meaningfulMetricCount > 0 ? 'complete' : 'partial';
  }
  if (missingFocusMetrics.length === 0) return 'complete';
  if (matchedFocusMetrics.length > 0) return 'partial';
  return 'weak';
}

function buildAssessment(
  intents: SearchIntent[],
  focusMetricTypes: string[],
  meaningfulMetrics: Metric[],
  matchedFocusMetrics: Metric[],
  proxyFocusMetrics: Metric[],
  missingFocusMetrics: string[],
  performanceMetrics: Metric[],
  actionableCommitments: Metric[],
  infrastructureCommitments: Metric[],
  isWeakMatch: boolean,
  headline: string,
  detail: string,
  hideSignals: boolean,
): LiveResultAssessment {
  return {
    isWeakMatch,
    completeness: deriveCompleteness(isWeakMatch, focusMetricTypes, missingFocusMetrics, matchedFocusMetrics, meaningfulMetrics.length),
    headline,
    detail,
    hideSignals,
    intents,
    focusMetricTypes,
    meaningfulMetrics,
    matchedFocusMetrics,
    proxyFocusMetrics,
    missingFocusMetrics,
    performanceMetrics,
    actionableCommitments,
    infrastructureCommitments,
  };
}

export function assessLiveResult({ query, metrics, selectedSource, documentCount = 1, assetClassHints = [] }: AssessLiveResultArgs): LiveResultAssessment | null {
  if (!metrics.length) {
    return null;
  }

  const intents = detectSearchIntents(query);
  const normalizedQuery = query.toLowerCase();
  const focusMetricTypes = getFocusMetricTargets(query);
  const meaningfulMetrics = metrics.filter((metric) => !isNoActivityValue(metric.value));
  const scopedMeaningfulMetrics = assetClassHints.length > 0
    ? meaningfulMetrics.filter((metric) => assetClassMatches(metric.asset_class, assetClassHints))
    : meaningfulMetrics;
  const focusMatchedMetrics = focusMetricTypes.length
    ? scopedMeaningfulMetrics.filter((metric) => metricMatchesRequestedFocus(metric, focusMetricTypes))
    : [];
  const proxyFocusMetrics = focusMatchedMetrics.filter((metric) => isProxyMetricMatch(metric));
  const matchedFocusMetrics = focusMatchedMetrics.filter((metric) => !isProxyMetricMatch(metric));
  const missingFocusMetrics = sortMetricNames(
    focusMetricTypes.filter((metricType) => !matchedFocusMetrics.some((metric) => metricMatchesRequestedFocus(metric, [metricType]))),
  );
  const performanceMetrics = meaningfulMetrics.filter((metric) => PERFORMANCE_METRIC_TYPES.has(metric.metric));
  const actionableCommitments = scopedMeaningfulMetrics.filter(
    (metric) => metric.metric === 'Commitment' || metric.metric === 'Co-Investment',
  );
  const infrastructureCommitments = actionableCommitments.filter((metric) =>
    ['infrastructure', 'real assets'].some((keyword) => metricText(metric).includes(keyword)),
  );
  const boardLikeSource = selectedSource?.documentType === 'meeting' || selectedSource?.documentType === 'minutes';
  const broadAllocationMetrics = scopedMeaningfulMetrics.filter((metric) => isBroadAllocationMetric(metric.metric));
  const performanceMultipleMetrics = scopedMeaningfulMetrics.filter((metric) => isPerformanceMultiple(metric.metric));
  const matchedFocusMetricTypes = sortMetricNames(
    focusMetricTypes.filter((metricType) => matchedFocusMetrics.some((metric) => metricMatchesRequestedFocus(metric, [metricType]))),
  );
  const reviewedFileLabel = documentCount > 1 ? 'these reviewed documents' : 'this file';
  const selectedDocumentLabel = documentCount > 1 ? 'the reviewed documents' : 'the selected PDF';
  const reportLabel = documentCount > 1 ? 'these reviewed documents' : 'this report';

  if (meaningfulMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: ${reviewedFileLabel} only surfaced "No activity" references.`,
      intents.includes('performance')
        ? `${selectedDocumentLabel} did not contain extractable performance rows, so ${documentCount > 1 ? 'they are' : 'it is'} probably the wrong answer for this performance search.`
        : boardLikeSource
          ? 'This looks more like agenda context than a direct investment update, so it is not a strong answer to your infrastructure-commitment search.'
          : `${selectedDocumentLabel} did not contain extractable commitment values, so ${documentCount > 1 ? 'they are' : 'it is'} probably the wrong answer for this search.`,
      true,
    );
  }

  if (intents.includes('performance') && focusMetricTypes.length > 0 && matchedFocusMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: ${missingFocusMetrics.join(', ')} not found in ${documentCount > 1 ? 'the reviewed documents' : 'the reviewed file'}.`,
      proxyFocusMetrics.length > 0
        ? `The reviewed material surfaced proxy-style rows, but they do not count as direct hits for ${missingFocusMetrics.join(', ')}.`
        : broadAllocationMetrics.length > 0
        ? 'The reviewed material contains real numbers, but mostly broad allocation or AUM rows rather than the requested performance multiples.'
        : `The reviewed material contains real numbers, but ${missingFocusMetrics.join(', ')} were not found in ${documentCount > 1 ? 'those documents' : 'the selected document'}.`,
      true,
    );
  }

  if (
    intents.includes('performance') &&
    focusMetricTypes.length > 0 &&
    matchedFocusMetricTypes.length > 0 &&
    missingFocusMetrics.length > 0
  ) {
    const matchedLabel = sortMetricNames(Array.from(new Set(matchedFocusMetrics.map((metric) => metric.metric))));
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      false,
      `Partial match: found ${matchedLabel.join(', ')} but not ${missingFocusMetrics.join(', ')}.`,
      broadAllocationMetrics.length > matchedFocusMetrics.length
        ? `${documentCount > 1 ? 'These documents surfaced' : 'This PDF surfaced'} ${matchedLabel.join(', ')}, but ${missingFocusMetrics.join(', ')} were not found in ${documentCount > 1 ? 'them' : 'this document'}. The system will try the next best report.`
        : `Found ${matchedLabel.join(', ')} in ${reportLabel}, but ${missingFocusMetrics.join(', ')} not present in ${documentCount > 1 ? 'the reviewed documents' : 'the reviewed file'}.`,
      false,
    );
  }

  if (intents.includes('performance') && focusMetricTypes.length === 0 && performanceMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: ${reviewedFileLabel} do${documentCount > 1 ? '' : 'es'} not contain direct performance metrics.`,
      `${selectedDocumentLabel} produced structured data, but not the performance figures this search is looking for.`,
      true,
    );
  }

  if (!intents.includes('performance') && intents.includes('commitment') && actionableCommitments.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: no direct commitments were extracted from ${reviewedFileLabel}.`,
      `You got some structured lines out of ${selectedDocumentLabel}, but not the actual commitment activity this search is trying to find.`,
      true,
    );
  }

  if (intents.includes('commitment') && normalizedQuery.includes('infrastructure') && infrastructureCommitments.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: ${reviewedFileLabel} do${documentCount > 1 ? '' : 'es'} not show a direct infrastructure commitment.`,
      'The extracted metrics are real, but they do not line up with the infrastructure-commitment question yet. A different board packet, consent item, or investment memo is more likely to answer it.',
      true,
    );
  }

  if (
    focusMetricTypes.some((metricType) => isPerformanceMultiple(metricType)) &&
    performanceMultipleMetrics.length === 0 &&
    broadAllocationMetrics.length > 0
  ) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      proxyFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: this extraction is dominated by allocation rows, not performance multiples.',
      `The reviewed material contains real portfolio figures, but ${documentCount > 1 ? 'these are not the right documents' : 'it is not the right PDF'} for IRR, TVPI, or DPI. Try a private-markets combined portfolio or performance review PDF instead.`,
      true,
    );
  }

  return buildAssessment(
    intents,
    focusMetricTypes,
    meaningfulMetrics,
    matchedFocusMetrics,
    proxyFocusMetrics,
    missingFocusMetrics,
    performanceMetrics,
    actionableCommitments,
    infrastructureCommitments,
    false,
    'Strong enough to review.',
    'This extraction surfaced direct metrics that appear relevant to the search.',
    false,
  );
}

function assetClassMatches(metricAssetClass: string, hints: string[]): boolean {
  if (hints.length === 0) return true;
  const normalized = metricAssetClass.toLowerCase();
  // Also accept "Total" and "Total Private Markets" style rows as matching any hint
  if (normalized.includes('total') || normalized.includes('combined') || normalized.includes('aggregate')) {
    return true;
  }
  return hints.some((hint) => {
    const h = hint.toLowerCase();
    // Direct match
    if (normalized.includes(h) || h.includes(normalized)) return true;
    // Common aliases
    if (h === 'private equity' && (normalized.includes('pe') || normalized.includes('buyout'))) return true;
    if (h === 'infrastructure' && normalized.includes('infra')) return true;
    if (h === 'real estate' && (normalized.includes('property') || normalized.includes('reit'))) return true;
    if (h === 'credit' && (normalized.includes('debt') || normalized.includes('lending') || normalized.includes('fixed income'))) return true;
    if (h === 'private markets' && (normalized.includes('private') || normalized.includes('alternative'))) return true;
    return false;
  });
}

export function computeCoverageScore(
  metrics: Metric[],
  requestedMetricTypes: string[],
  assetClassHints: string[] = [],
): { score: number; foundTypes: string[]; missingTypes: string[] } {
  if (requestedMetricTypes.length === 0) {
    return { score: 1, foundTypes: [], missingTypes: [] };
  }

  const meaningfulMetrics = metrics.filter((m) => !isNoActivityValue(m.value));
  const scopedMetrics = assetClassHints.length > 0
    ? meaningfulMetrics.filter((m) => assetClassMatches(m.asset_class, assetClassHints))
    : meaningfulMetrics;
  const foundTypes = sortMetricNames(
    requestedMetricTypes.filter((metricType) =>
      scopedMetrics.some((m) => metricMatchesRequestedFocus(m, [metricType])),
    ),
  );

  // Solid matches: at least one non-proxy match for the metric type
  const solidFoundTypes = foundTypes.filter((metricType) => {
    const matchingMetrics = scopedMetrics.filter((m) => metricMatchesRequestedFocus(m, [metricType]));
    return matchingMetrics.some((m) => !isProxyMetricMatch(m));
  });

  // Proxy-only matches: metric type found but only via proxy (e.g., "Multiple of Cost" for TVPI)
  const proxyOnlyTypes = foundTypes.filter((metricType) => {
    if (solidFoundTypes.includes(metricType)) return false;
    const matchingMetrics = scopedMetrics.filter((m) => metricMatchesRequestedFocus(m, [metricType]));
    return matchingMetrics.length > 0 && matchingMetrics.every((m) => isProxyMetricMatch(m));
  });

  const missingTypes = sortMetricNames(
    requestedMetricTypes.filter((metricType) => !solidFoundTypes.includes(metricType) && !proxyOnlyTypes.includes(metricType)),
  );

  // Proxy-only matches get 0.5 credit each
  const score = (solidFoundTypes.length + proxyOnlyTypes.length * 0.5) / requestedMetricTypes.length;

  return {
    score,
    foundTypes: [...solidFoundTypes, ...proxyOnlyTypes],
    missingTypes,
  };
}

export function shouldAutoRetry(
  metrics: Metric[],
  requestedMetricTypes: string[],
  attemptCount: number,
  maxAttempts = 2,
): boolean {
  if (requestedMetricTypes.length === 0) return false;
  if (attemptCount >= maxAttempts) return false;
  const { score } = computeCoverageScore(metrics, requestedMetricTypes);
  // Don't retry if we already found 75%+ of requested metrics — the rest may not exist
  return score < 0.75;
}
