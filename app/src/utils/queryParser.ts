import { pensionFundNames } from '../data/sourceRegistry';
import { getRequestedMetricTypes } from './searchFocus';

/* ------------------------------------------------------------------ */
/*  Entity aliases — maps lowercase variants to canonical fund names   */
/* ------------------------------------------------------------------ */

const ENTITY_ALIASES: Record<string, string> = {
  'psers': 'PSERS',
  'pennsylvania psers': 'PSERS',
  'minnesota sbi': 'Minnesota SBI',
  'mn sbi': 'Minnesota SBI',
  'msbi': 'Minnesota SBI',
  'samcera': 'SAMCERA',
  'isbi': 'ISBI',
  'illinois sbi': 'ISBI',
  'nm pera': 'NM PERA',
  'new mexico pera': 'NM PERA',
  'nmpera': 'NM PERA',
};

/* ------------------------------------------------------------------ */
/*  Asset class aliases                                                */
/* ------------------------------------------------------------------ */

const ASSET_CLASS_ALIASES: [string, string[]][] = [
  ['Private Equity', ['private equity', 'pe ', 'buyout', 'venture capital', 'growth equity']],
  ['Infrastructure', ['infrastructure', 'infra']],
  ['Credit', ['credit', 'private credit', 'private debt', 'direct lending']],
  ['Real Assets', ['real assets']],
  ['Real Estate', ['real estate']],
  ['Natural Resources', ['natural resources']],
  ['Public Equities', ['public equities', 'public equity']],
];

const BROAD_PRIVATE_MARKETS = ['Private Equity', 'Infrastructure', 'Credit', 'Real Assets'];

/* ------------------------------------------------------------------ */
/*  Label mapping: searchFocus labels → ALL_METRICS vocabulary         */
/* ------------------------------------------------------------------ */

const METRIC_LABEL_TO_CHIP: Record<string, string> = {
  'Commitment': 'Commitments',
};

function mapMetricLabel(label: string): string {
  return METRIC_LABEL_TO_CHIP[label] || label;
}

/* ------------------------------------------------------------------ */
/*  Entity extraction for unknown funds                                */
/* ------------------------------------------------------------------ */

const STRIP_WORDS = new Set([
  // Metric keywords
  'irr', 'tvpi', 'dpi', 'nav', 'aum', 'commitment', 'commitments', 'committed',
  'management fee', 'carry', 'target return', 'target fund size', 'distribution',
  'distributions', 'capital call', 'capital calls', 'asset allocation',
  'co-investment', 'termination', 'market value', 'portfolio value',
  // Asset class keywords
  'private equity', 'infrastructure', 'credit', 'private credit', 'real assets',
  'real estate', 'natural resources', 'public equities', 'private markets',
  // Intent keywords
  'performance', 'quarterly', 'annual', 'board', 'meeting', 'minutes',
  'agenda', 'financial', 'report', 'reports', 'review', 'new', 'fund',
  'investments', 'approvals', 'manager',
]);

function extractEntityFromQuery(query: string): string | null {
  let remaining = query;
  // Strip known keywords (longest first to avoid partial removal)
  const sortedStrips = [...STRIP_WORDS].sort((a, b) => b.length - a.length);
  for (const word of sortedStrips) {
    remaining = remaining.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  }
  // Clean up whitespace and trim
  remaining = remaining.replace(/\s+/g, ' ').trim();
  // If something meaningful remains (at least 2 chars), use it as entity name
  if (remaining.length >= 2) {
    // Title-case the result
    return remaining
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  parseQueryConfig                                                   */
/* ------------------------------------------------------------------ */

export function parseQueryConfig(query: string): {
  entities: string[];
  metrics: string[];
  assetClasses: string[];
} {
  const q = query.toLowerCase();

  // --- Entities ---
  const matchedEntities = new Set<string>();
  // Check aliases first (longest match first to avoid partial hits)
  const sortedAliases = Object.keys(ENTITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (q.includes(alias)) {
      matchedEntities.add(ENTITY_ALIASES[alias]);
    }
  }
  // Also check canonical names directly
  for (const name of pensionFundNames) {
    if (q.includes(name.toLowerCase())) {
      matchedEntities.add(name);
    }
  }

  // If no known fund matched, extract the entity name from the query text.
  // Strip out metric keywords, asset class keywords, and common filler to isolate the fund name.
  if (matchedEntities.size === 0) {
    const strippedQuery = extractEntityFromQuery(query);
    if (strippedQuery) {
      matchedEntities.add(strippedQuery);
    }
  }

  const entities = Array.from(matchedEntities);

  // --- Metrics ---
  const rawMetrics = getRequestedMetricTypes(query);
  let metrics = rawMetrics.map(mapMetricLabel);

  // If no explicit metrics found, infer from query intent
  if (metrics.length === 0) {
    if (/performance|quarterly|annual report/i.test(query)) {
      metrics = ['IRR', 'TVPI', 'DPI', 'NAV'];
    } else if (/commitment|board approval/i.test(query)) {
      metrics = ['Commitments'];
    } else {
      // Broad fallback — show common performance metrics
      metrics = ['NAV', 'IRR', 'TVPI'];
    }
  }

  // --- Asset classes ---
  const matchedClasses = new Set<string>();
  for (const [className, aliases] of ASSET_CLASS_ALIASES) {
    for (const alias of aliases) {
      if (q.includes(alias)) {
        matchedClasses.add(className);
        break;
      }
    }
  }

  let assetClasses: string[];
  if (matchedClasses.size > 0) {
    assetClasses = Array.from(matchedClasses);
  } else if (/private markets/i.test(query)) {
    assetClasses = BROAD_PRIVATE_MARKETS;
  } else {
    // Default to broad private markets for performance-style queries
    assetClasses = BROAD_PRIVATE_MARKETS;
  }

  return { entities, metrics, assetClasses };
}
