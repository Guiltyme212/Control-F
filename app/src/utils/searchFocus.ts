import type { Metric, SearchIntent } from '../data/types';

interface MetricAliasDefinition {
  label: string;
  aliases: string[];
}

const METRIC_ALIAS_DEFINITIONS: MetricAliasDefinition[] = [
  { label: 'IRR', aliases: ['irr', 'internal rate of return'] },
  { label: 'TVPI', aliases: ['tvpi'] },
  { label: 'DPI', aliases: ['dpi'] },
  { label: 'NAV', aliases: ['nav', 'net asset value'] },
  { label: 'AUM', aliases: ['aum', 'assets under management'] },
  { label: 'Asset Allocation', aliases: ['asset allocation'] },
  { label: 'Commitment', aliases: ['commitment', 'commitments', 'committed'] },
  { label: 'Co-Investment', aliases: ['co-investment', 'co investment', 'coinvestment'] },
  { label: 'Management Fee', aliases: ['management fee', 'mgmt fee'] },
  { label: 'Carry', aliases: ['carry', 'carried interest'] },
  { label: 'Target Fund Size', aliases: ['target fund size', 'fund size'] },
  { label: 'Target Return', aliases: ['target return'] },
  { label: 'Distribution', aliases: ['distribution', 'distributions'] },
  { label: 'Capital Call', aliases: ['capital call', 'capital calls'] },
];

const SPECIFIC_PERFORMANCE_METRICS = new Set(['IRR', 'TVPI', 'DPI', 'NAV', 'AUM']);
const PERFORMANCE_MULTIPLES = new Set(['IRR', 'TVPI', 'DPI']);
const BROAD_ALLOCATION_METRICS = new Set(['AUM', 'Asset Allocation']);
const METRIC_SORT_ORDER = [
  'IRR',
  'TVPI',
  'DPI',
  'NAV',
  'AUM',
  'Asset Allocation',
  'Commitment',
  'Co-Investment',
  'Management Fee',
  'Carry',
  'Target Return',
  'Target Fund Size',
  'Distribution',
  'Capital Call',
];

function normalize(value: string): string {
  return value.toLowerCase();
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function aliasesForMetric(label: string): string[] {
  const definition = METRIC_ALIAS_DEFINITIONS.find((candidate) => candidate.label === label);
  return definition ? definition.aliases : [label.toLowerCase()];
}

export function getRequestedMetricTypes(query: string): string[] {
  const normalizedQuery = normalize(query);
  return sortMetricNames(
    METRIC_ALIAS_DEFINITIONS
      .filter((definition) => definition.aliases.some((alias) => normalizedQuery.includes(alias)))
      .map((definition) => definition.label),
  );
}

export function getFocusMetricTargets(query: string): string[] {
  return getRequestedMetricTypes(query);
}

export function isSpecificPerformanceMetricQuery(query: string): boolean {
  return getRequestedMetricTypes(query).some((metric) => SPECIFIC_PERFORMANCE_METRICS.has(metric));
}

export function isPerformanceMultiple(metricName: string): boolean {
  return PERFORMANCE_MULTIPLES.has(metricName);
}

export function isBroadAllocationMetric(metricName: string): boolean {
  return BROAD_ALLOCATION_METRICS.has(metricName);
}

export function sortMetricNames(values: string[]): string[] {
  return dedupe(values).sort((left, right) => {
    const leftIndex = METRIC_SORT_ORDER.indexOf(left);
    const rightIndex = METRIC_SORT_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

export function metricMatchesRequestedFocus(
  metric: Pick<Metric, 'metric' | 'fund' | 'asset_class' | 'evidence' | 'value'>,
  requestedMetricTypes: string[],
): boolean {
  if (requestedMetricTypes.length === 0) {
    return true;
  }

  const haystack = normalize(
    [metric.metric, metric.fund, metric.asset_class, metric.evidence, metric.value]
      .filter(Boolean)
      .join(' '),
  );

  return requestedMetricTypes.some((requestedMetric) =>
    aliasesForMetric(requestedMetric).some((alias) => haystack.includes(alias)),
  );
}

export function getFocusKeywords(query: string, intents: SearchIntent[] = []): string[] {
  const normalizedQuery = normalize(query);
  const requestedMetrics = getRequestedMetricTypes(query);
  const keywords = new Set<string>();

  requestedMetrics.forEach((metric) => {
    aliasesForMetric(metric).forEach((alias) => keywords.add(alias));
  });

  if (normalizedQuery.includes('private markets')) keywords.add('private markets');
  if (normalizedQuery.includes('private equity')) keywords.add('private equity');
  if (normalizedQuery.includes('real assets')) keywords.add('real assets');
  if (normalizedQuery.includes('infrastructure')) keywords.add('infrastructure');
  if (normalizedQuery.includes('total fund')) keywords.add('total fund');

  if (intents.includes('performance')) {
    keywords.add('performance');
    keywords.add('report');
    keywords.add('quarterly');
    keywords.add('review');
  }

  if (isSpecificPerformanceMetricQuery(query)) {
    ['private markets', 'portfolio', 'combined portfolio', 'performance review', 'portfolio report'].forEach((keyword) =>
      keywords.add(keyword),
    );
  }

  if (intents.includes('commitment')) {
    ['commitment', 'commitments', 'investment', 'approval', 'approved'].forEach((keyword) =>
      keywords.add(keyword),
    );
  }

  if (intents.includes('board')) {
    ['agenda', 'minutes', 'meeting', 'committee', 'board packet'].forEach((keyword) =>
      keywords.add(keyword),
    );
  }

  if (intents.includes('financial')) {
    ['financial report', 'annual report', 'acfr'].forEach((keyword) => keywords.add(keyword));
  }

  return dedupe(Array.from(keywords).filter(Boolean));
}
