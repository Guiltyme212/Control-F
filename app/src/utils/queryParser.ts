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
  'minnesota trs': 'Minnesota TRS',
  'mn trs': 'Minnesota TRS',
  'samcera': 'SAMCERA',
  'isbi': 'ISBI',
  'illinois sbi': 'ISBI',
  'nm pera': 'NM PERA',
  'new mexico pera': 'NM PERA',
  'nmpera': 'NM PERA',
  'calpers': 'CalPERS',
  'cal pers': 'CalPERS',
  'california pers': 'CalPERS',
  'calstrs': 'CalSTRS',
  'cal strs': 'CalSTRS',
  'california strs': 'CalSTRS',
  'texas trs': 'Texas TRS',
  'ohio pers': 'Ohio PERS',
  'opers': 'OPERS',
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
/*  Generic pension fund name extraction                               */
/* ------------------------------------------------------------------ */

// Common pension fund suffixes/acronyms
const PENSION_SUFFIXES = [
  'TRS', 'PERS', 'PERA', 'SBI', 'STRS', 'ERS', 'CalPERS', 'CalSTRS',
  'OPERS', 'SERS', 'IPERS', 'MOSERS', 'KPERS', 'NHRS', 'MPERS',
  'retirement system', 'retirement fund', 'pension fund', 'pension system',
  'retirement board', 'retirement association',
  'investment board', 'investment council',
  'teachers retirement',
];

const PENSION_SUFFIX_PATTERN = new RegExp(
  `((?:[A-Z][a-zA-Z]+\\s+)+(?:${PENSION_SUFFIXES.join('|')})\\b)` +
  `|\\b((?:${PENSION_SUFFIXES.join('|')})\\b)`,
  'gi',
);

function extractGenericFundName(query: string): string | null {
  // Try "X TRS/PERS/etc" patterns
  const matches = query.match(PENSION_SUFFIX_PATTERN);
  if (matches && matches.length > 0) {
    return matches[0].trim();
  }

  // Try standalone well-known names with state context
  const statePattern = /\b((?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming))\s+(TRS|PERS|PERA|SBI|STRS|ERS|retirement|pension|investment)\b/i;
  const stateMatch = query.match(statePattern);
  if (stateMatch) {
    return stateMatch[0].trim();
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
  // Fallback: extract any pension-fund-like name from the query
  if (matchedEntities.size === 0) {
    const generic = extractGenericFundName(query);
    if (generic) {
      matchedEntities.add(generic);
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
