import type { Metric, SearchIntent, SourceSearchCandidate } from '../data/types';
import { detectSearchIntents } from './api';
import {
  getFocusMetricTargets,
  isBroadAllocationMetric,
  isPerformanceMultiple,
  metricMatchesRequestedFocus,
  sortMetricNames,
} from './searchFocus';

interface AssessLiveResultArgs {
  query: string;
  metrics: Metric[];
  selectedSource?: SourceSearchCandidate | null;
}

export interface LiveResultAssessment {
  isWeakMatch: boolean;
  headline: string;
  detail: string;
  hideSignals: boolean;
  intents: SearchIntent[];
  focusMetricTypes: string[];
  meaningfulMetrics: Metric[];
  matchedFocusMetrics: Metric[];
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

function buildAssessment(
  intents: SearchIntent[],
  focusMetricTypes: string[],
  meaningfulMetrics: Metric[],
  matchedFocusMetrics: Metric[],
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
    headline,
    detail,
    hideSignals,
    intents,
    focusMetricTypes,
    meaningfulMetrics,
    matchedFocusMetrics,
    missingFocusMetrics,
    performanceMetrics,
    actionableCommitments,
    infrastructureCommitments,
  };
}

export function assessLiveResult({ query, metrics, selectedSource }: AssessLiveResultArgs): LiveResultAssessment | null {
  if (!metrics.length) {
    return null;
  }

  const intents = detectSearchIntents(query);
  const normalizedQuery = query.toLowerCase();
  const focusMetricTypes = getFocusMetricTargets(query);
  const meaningfulMetrics = metrics.filter((metric) => !isNoActivityValue(metric.value));
  const matchedFocusMetrics = focusMetricTypes.length
    ? meaningfulMetrics.filter((metric) => metricMatchesRequestedFocus(metric, focusMetricTypes))
    : [];
  const missingFocusMetrics = sortMetricNames(
    focusMetricTypes.filter((metricType) => !meaningfulMetrics.some((metric) => metricMatchesRequestedFocus(metric, [metricType]))),
  );
  const performanceMetrics = meaningfulMetrics.filter((metric) => PERFORMANCE_METRIC_TYPES.has(metric.metric));
  const actionableCommitments = meaningfulMetrics.filter(
    (metric) => metric.metric === 'Commitment' || metric.metric === 'Co-Investment',
  );
  const infrastructureCommitments = actionableCommitments.filter((metric) =>
    ['infrastructure', 'real assets'].some((keyword) => metricText(metric).includes(keyword)),
  );
  const boardLikeSource = selectedSource?.documentType === 'meeting' || selectedSource?.documentType === 'minutes';
  const broadAllocationMetrics = meaningfulMetrics.filter((metric) => isBroadAllocationMetric(metric.metric));
  const performanceMultipleMetrics = meaningfulMetrics.filter((metric) => isPerformanceMultiple(metric.metric));
  const matchedFocusMetricTypes = sortMetricNames(
    focusMetricTypes.filter((metricType) => meaningfulMetrics.some((metric) => metricMatchesRequestedFocus(metric, [metricType]))),
  );

  if (meaningfulMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: this file only surfaced "No activity" references.',
      intents.includes('performance')
        ? 'The selected PDF did not contain extractable performance rows, so it is probably the wrong document for this performance search.'
        : boardLikeSource
          ? 'This looks more like agenda context than a direct investment update, so it is not a strong answer to your infrastructure-commitment search.'
          : 'The selected PDF did not contain extractable commitment values, so it is probably the wrong document for this search.',
      true,
    );
  }

  if (intents.includes('performance') && focusMetricTypes.length > 0 && matchedFocusMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      `Weak match: this file does not surface ${missingFocusMetrics.join(', ')} metrics.`,
      broadAllocationMetrics.length > 0
        ? 'The extraction found real numbers, but they are mostly broad allocation or AUM rows rather than the requested performance multiples.'
        : `The extraction found real numbers, but not the ${missingFocusMetrics.join(', ')} figures requested in the search.`,
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
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      false,
      `Partial match: found ${matchedLabel.join(', ')} but not ${missingFocusMetrics.join(', ')}.`,
      broadAllocationMetrics.length > matchedFocusMetrics.length
        ? `This PDF is in the right family and it surfaced ${matchedLabel.join(', ')}, but it still looks broader than ideal. Try another private-markets performance PDF to fill in ${missingFocusMetrics.join(', ')}.`
        : `This run found part of the answer. You have ${matchedLabel.join(', ')}, but ${missingFocusMetrics.join(', ')} is still missing from this file.`,
      false,
    );
  }

  if (intents.includes('performance') && focusMetricTypes.length === 0 && performanceMetrics.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: this file does not contain direct performance metrics.',
      'The selected PDF produced structured data, but not the performance figures this search is looking for.',
      true,
    );
  }

  if (!intents.includes('performance') && intents.includes('commitment') && actionableCommitments.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: no direct commitments were extracted from this file.',
      'You got some structured lines out of the PDF, but not the actual commitment activity this search is trying to find.',
      true,
    );
  }

  if (normalizedQuery.includes('infrastructure') && infrastructureCommitments.length === 0) {
    return buildAssessment(
      intents,
      focusMetricTypes,
      meaningfulMetrics,
      matchedFocusMetrics,
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: this file does not show a direct infrastructure commitment.',
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
      missingFocusMetrics,
      performanceMetrics,
      actionableCommitments,
      infrastructureCommitments,
      true,
      'Weak match: this extraction is dominated by allocation rows, not performance multiples.',
      'The document contains real portfolio figures, but it is not the right PDF for IRR, TVPI, or DPI. Try a private-markets combined portfolio or performance review PDF instead.',
      true,
    );
  }

  return buildAssessment(
    intents,
    focusMetricTypes,
    meaningfulMetrics,
    matchedFocusMetrics,
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
