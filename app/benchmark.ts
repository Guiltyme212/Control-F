#!/usr/bin/env npx tsx
/**
 * Control F Pipeline Accuracy Benchmark
 * ======================================
 * Tests all decision-making logic against known-good answers.
 * Run: cd app && npx tsx benchmark.ts
 *
 * Tests:
 *  1. Query parsing (metric detection, intent classification)
 *  2. Document-family routing (hard preferences, penalties)
 *  3. Source scoring (right source wins for each query type)
 *  4. Coverage scoring (asset-class-aware, proxy detection)
 *  5. Deduplication
 *  6. Page window selection (neighbors included)
 *  7. Gold-test definitions (all 16 cases from gold_cases.json)
 *  8. Freshness scoring (year/quarter extraction, ordering)
 */

// ─── Types ───

type SearchIntent = 'commitment' | 'performance' | 'board' | 'financial' | 'general';

interface Metric {
  date: string; lp: string; fund: string; gp: string;
  metric: string; value: string; asset_class: string;
  source: string; page: number; evidence: string;
  confidence: 'high' | 'medium' | 'low';
}

interface SourceRegistryEntry {
  id: string; pensionFund: string; label: string; url: string;
  documentType: 'meeting' | 'minutes' | 'performance' | 'financial' | 'investment' | 'general';
  intents: SearchIntent[]; keywords: string[]; notes?: string;
}

// ─── Inline the functions under test ───

const METRIC_ALIAS_DEFINITIONS = [
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

function getRequestedMetricTypes(query: string): string[] {
  const q = query.toLowerCase();
  return METRIC_ALIAS_DEFINITIONS
    .filter((d) => d.aliases.some((a) => q.includes(a)))
    .map((d) => d.label);
}

const INTENT_KEYWORDS: Record<SearchIntent, string[]> = {
  commitment: ['commitment', 'commitments', 'investment', 'investments', 'infrastructure', 'real assets', 'private equity', 'private markets', 'approval', 'approvals'],
  performance: ['performance', 'irr', 'tvpi', 'dpi', 'nav', 'aum', 'return', 'returns', 'asset allocation'],
  board: ['board', 'agenda', 'minutes', 'meeting', 'meetings', 'board materials', 'committee'],
  financial: ['financial', 'acfr', 'annual report', 'financial report', 'financial overview', 'total fund', 'asset listing'],
  general: [],
};

function detectSearchIntents(query: string): SearchIntent[] {
  const q = query.toLowerCase();
  const metrics = getRequestedMetricTypes(query);
  const hasPerf = metrics.some((m) => ['IRR', 'TVPI', 'DPI', 'NAV', 'AUM', 'Asset Allocation', 'Target Return'].includes(m));
  const intents: SearchIntent[] = [];
  if (hasPerf || INTENT_KEYWORDS.performance.some((k) => q.includes(k))) intents.push('performance');
  if (['commitment', 'commitments', 'investment', 'investments', 'approval', 'approvals', 'co-investment', 'capital call', 'termination'].some((k) => q.includes(k))) intents.push('commitment');
  if (INTENT_KEYWORDS.board.some((k) => q.includes(k))) intents.push('board');
  if (INTENT_KEYWORDS.financial.some((k) => q.includes(k))) intents.push('financial');
  return intents.length > 0 ? intents : ['general'];
}

function scoreDocumentTypeFit(documentType: string, intents: SearchIntent[]): number {
  let score = 0;
  if (intents.includes('commitment')) {
    if (documentType === 'meeting') score += 8;
    if (documentType === 'minutes') score += 7;
    if (documentType === 'investment') score += 5;
    if (documentType === 'performance') score -= 3;
    if (documentType === 'financial') score -= 10;
    if (documentType === 'general') score -= 8;
  }
  if (intents.includes('performance')) {
    if (documentType === 'performance') score += 8;
    if (documentType === 'investment' || documentType === 'financial') score += 3;
    if (documentType === 'meeting' || documentType === 'minutes') score -= 12;
    if (documentType === 'general') score -= 2;
  }
  if (intents.includes('board')) {
    if (documentType === 'meeting' || documentType === 'minutes') score += 8;
    if (documentType === 'investment') score += 2;
    if (documentType === 'performance') score -= 3;
    if (documentType === 'financial') score -= 5;
    if (documentType === 'general') score -= 6;
  }
  if (intents.includes('financial')) {
    if (documentType === 'financial') score += 8;
    if (documentType === 'performance') score += 3;
    if (documentType === 'investment') score += 1;
    if (documentType === 'meeting' || documentType === 'minutes') score -= 5;
    if (documentType === 'general') score -= 4;
  }
  return score;
}

function getDocumentFamilyPreferences(intents: SearchIntent[], requestedMetricTypes: string[]) {
  const preferred = new Set<string>();
  const penalized = new Set<string>();
  const hasPerformanceMultiples = requestedMetricTypes.some((m) => ['IRR', 'TVPI', 'DPI'].includes(m));
  const hasNavOnly = requestedMetricTypes.includes('NAV') && !hasPerformanceMultiples;
  const hasCommitmentOnly = intents.includes('commitment') && !intents.includes('performance');
  if (hasPerformanceMultiples) {
    preferred.add('performance'); preferred.add('investment');
    penalized.add('meeting'); penalized.add('minutes');
  } else if (hasNavOnly) {
    preferred.add('performance'); preferred.add('financial'); preferred.add('investment');
    penalized.add('minutes');
  } else if (hasCommitmentOnly) {
    preferred.add('meeting'); preferred.add('minutes'); preferred.add('investment');
    penalized.add('financial');
  }
  return { preferred, penalized };
}

const PROXY_INDICATORS = ['multiple of cost', 'moc', 'proxy', 'equivalent', 'approximat', 'estimated', 'implied'];
function isProxyMetricMatch(metric: Pick<Metric, 'metric' | 'evidence' | 'value'>): boolean {
  const ev = (metric.evidence || '').toLowerCase();
  const val = (metric.value || '').toLowerCase();
  return PROXY_INDICATORS.some((ind) => ev.includes(ind) || val.includes(ind));
}

function assetClassMatches(metricAssetClass: string, hints: string[]): boolean {
  if (hints.length === 0) return true;
  const n = metricAssetClass.toLowerCase();
  if (n.includes('total') || n.includes('combined') || n.includes('aggregate')) return true;
  return hints.some((hint) => {
    const h = hint.toLowerCase();
    if (n.includes(h) || h.includes(n)) return true;
    if (h === 'private equity' && (n.includes('pe') || n.includes('buyout'))) return true;
    if (h === 'infrastructure' && n.includes('infra')) return true;
    if (h === 'real estate' && (n.includes('property') || n.includes('reit'))) return true;
    if (h === 'credit' && (n.includes('debt') || n.includes('lending') || n.includes('fixed income'))) return true;
    if (h === 'private markets' && (n.includes('private') || n.includes('alternative'))) return true;
    return false;
  });
}

function computeCoverageScore(metrics: Metric[], requestedMetricTypes: string[], assetClassHints: string[] = []) {
  if (requestedMetricTypes.length === 0) return { score: 1, foundTypes: [] as string[], missingTypes: [] as string[] };
  const meaningful = metrics.filter((m) => m.value.trim().toLowerCase() !== 'no activity');
  const scoped = assetClassHints.length > 0 ? meaningful.filter((m) => assetClassMatches(m.asset_class, assetClassHints)) : meaningful;
  const foundTypes = requestedMetricTypes.filter((mt) => {
    const matches = scoped.filter((m) => {
      const haystack = [m.metric, m.fund, m.asset_class, m.evidence, m.value].filter(Boolean).join(' ').toLowerCase();
      const def = METRIC_ALIAS_DEFINITIONS.find((d) => d.label === mt);
      const aliases = def ? def.aliases : [mt.toLowerCase()];
      return aliases.some((a) => haystack.includes(a));
    });
    return matches.some((m) => !isProxyMetricMatch(m));
  });
  const missingTypes = requestedMetricTypes.filter((mt) => !foundTypes.includes(mt));
  return { score: foundTypes.length / requestedMetricTypes.length, foundTypes, missingTypes };
}

function deduplicateMetrics(metrics: Metric[]): Metric[] {
  const seen = new Set<string>();
  return metrics.filter((m) => {
    const key = `${m.metric}|${m.fund}|${m.asset_class}|${m.value}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Source Registry (production data) ───

const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  { id: 'nmpera-meeting', pensionFund: 'NM PERA', label: 'Meeting Information', url: '', documentType: 'meeting', intents: ['board', 'commitment', 'general'], keywords: ['board', 'meeting', 'agenda', 'investment committee'] },
  { id: 'nmpera-minutes', pensionFund: 'NM PERA', label: 'Meeting Minutes', url: '', documentType: 'minutes', intents: ['board', 'commitment'], keywords: ['minutes', 'board meeting', 'audio'] },
  { id: 'nmpera-perf', pensionFund: 'NM PERA', label: 'Investments Performance', url: '', documentType: 'performance', intents: ['performance', 'financial'], keywords: ['performance', 'private equity', 'nav', 'irr'] },
  { id: 'nmpera-fin', pensionFund: 'NM PERA', label: 'ACFR', url: '', documentType: 'financial', intents: ['financial'], keywords: ['acfr', 'financial overview', 'total fund', 'aum'] },
  { id: 'psers-meeting', pensionFund: 'PSERS', label: 'Board of Trustees Meetings', url: '', documentType: 'meeting', intents: ['board', 'commitment'], keywords: ['board meetings', 'agenda', 'minutes', 'investment committee'] },
  { id: 'psers-fin', pensionFund: 'PSERS', label: 'Financial Reports', url: '', documentType: 'financial', intents: ['financial'], keywords: ['financial reports', 'acfr', 'annual report', 'total fund'] },
  { id: 'psers-perf', pensionFund: 'PSERS', label: 'Asset Allocation and Performance', url: '', documentType: 'performance', intents: ['performance'], keywords: ['private markets', 'portfolio quarterly', 'disclosure report', 'irr', 'tvpi', 'dpi', 'nav'] },
  { id: 'psers-agenda', pensionFund: 'PSERS', label: 'Board Agenda', url: '', documentType: 'meeting', intents: ['board', 'commitment'], keywords: ['board agenda', 'new investments'] },
  { id: 'mnsbi-perf', pensionFund: 'Minnesota SBI', label: 'Comprehensive Performance Report', url: '', documentType: 'performance', intents: ['performance', 'financial'], keywords: ['comprehensive performance report', 'quarterly report', 'performance', 'nav', 'private markets'] },
  { id: 'mnsbi-iac', pensionFund: 'Minnesota SBI', label: 'IAC Meetings', url: '', documentType: 'meeting', intents: ['board', 'commitment'], keywords: ['iac meetings', 'investment advisory council', 'agenda'] },
  { id: 'mnsbi-board', pensionFund: 'Minnesota SBI', label: 'Board Meetings', url: '', documentType: 'meeting', intents: ['board', 'commitment'], keywords: ['board meetings', 'agenda', 'board packet'] },
  { id: 'mnsbi-fin', pensionFund: 'Minnesota SBI', label: 'Annual Reports', url: '', documentType: 'financial', intents: ['financial'], keywords: ['annual reports', 'financial report', 'acfr'] },
  { id: 'samcera-meeting', pensionFund: 'SAMCERA', label: 'Board of Retirement Meetings', url: '', documentType: 'meeting', intents: ['board', 'commitment'], keywords: ['board of retirement', 'meeting agenda', 'board packet'] },
  { id: 'samcera-fin', pensionFund: 'SAMCERA', label: 'Financial Reports', url: '', documentType: 'financial', intents: ['financial'], keywords: ['financial reports', 'annual comprehensive financial report'] },
  { id: 'samcera-perf', pensionFund: 'SAMCERA', label: 'Investment Performance Reports', url: '', documentType: 'performance', intents: ['performance', 'financial'], keywords: ['investment performance reports', 'private markets', 'irr', 'tvpi', 'dpi'] },
  { id: 'isbi-investments', pensionFund: 'ISBI', label: 'Investments', url: '', documentType: 'investment', intents: ['commitment', 'performance', 'general'], keywords: ['investments', 'asset allocation', 'portfolio', 'real assets', 'private equity'] },
  { id: 'isbi-meeting-minutes', pensionFund: 'ISBI', label: 'Meeting Minutes', url: '', documentType: 'minutes', intents: ['board', 'commitment'], keywords: ['meeting minutes', 'board', 'investment committee', 'approvals'] },
  { id: 'isbi-general', pensionFund: 'ISBI', label: 'General Information and Reports', url: '', documentType: 'general', intents: ['performance', 'financial', 'commitment', 'general'], keywords: ['quarterly performance', 'monthly report', 'annual report', 'financial reports', 'investment managers'] },
];

// ─── Test Framework ───

let passed = 0;
let failed = 0;
let sectionPassed = 0;
let sectionFailed = 0;

function section(name: string) {
  if (sectionPassed + sectionFailed > 0) {
    console.log(`  ${sectionPassed}/${sectionPassed + sectionFailed} passed\n`);
  }
  console.log(`\u2550\u2550\u2550 ${name} \u2550\u2550\u2550`);
  sectionPassed = 0;
  sectionFailed = 0;
}

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) { passed++; sectionPassed++; }
  else { console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ''}`); failed++; sectionFailed++; }
}

function findBestSource(fund: string, query: string): SourceRegistryEntry {
  const intents = detectSearchIntents(query);
  const metrics = getRequestedMetricTypes(query);
  const prefs = getDocumentFamilyPreferences(intents, metrics);
  const entries = SOURCE_REGISTRY.filter((e) => e.pensionFund === fund);
  const scored = entries.map((e) => ({ entry: e, score: scoreDocumentTypeFit(e.documentType, intents) }));
  scored.sort((a, b) => b.score - a.score);

  // Apply hard routing
  if (prefs.preferred.size > 0 && scored.length > 1) {
    const top = scored[0];
    if (prefs.penalized.has(top.entry.documentType)) {
      const preferred = scored.find((s) => prefs.preferred.has(s.entry.documentType) && s.score > top.score * 0.4);
      if (preferred) return preferred.entry;
    }
  }
  return scored[0].entry;
}

function m(metric: string, value: string, asset_class: string, evidence = ''): Metric {
  return { date: '2025-06-30', lp: 'Test', fund: 'Test Fund', gp: '', metric, value, asset_class, source: 'test.pdf', page: 1, evidence: evidence || `${metric} ${value}`, confidence: 'high' };
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: QUERY PARSING
// ═══════════════════════════════════════════════════════════

section('1. QUERY PARSING');

const queryTests = [
  { q: 'PSERS private markets IRR, TVPI, DPI, and NAV', metrics: ['IRR', 'TVPI', 'DPI', 'NAV'], intents: ['performance'] },
  { q: 'Minnesota SBI quarterly private markets performance', metrics: [], intents: ['performance'] },
  { q: 'SAMCERA new fund commitments', metrics: ['Commitment'], intents: ['commitment'] },
  { q: 'NM PERA board meeting agenda', metrics: [], intents: ['board'] },
  { q: 'PSERS AUM total fund', metrics: ['AUM'], intents: ['performance'] },
  { q: 'PSERS NAV', metrics: ['NAV'], intents: ['performance'] },
  { q: 'Minnesota SBI IRR TVPI DPI NAV private markets', metrics: ['IRR', 'TVPI', 'DPI', 'NAV'], intents: ['performance'] },
  { q: 'SAMCERA asset allocation', metrics: ['Asset Allocation'], intents: ['performance'] },
  { q: 'PSERS financial report acfr', metrics: [], intents: ['financial'] },
  { q: 'NM PERA infrastructure commitments', metrics: ['Commitment'], intents: ['commitment'] },
  { q: 'PSERS management fee carry', metrics: ['Management Fee', 'Carry'], intents: [] },
  { q: 'Minnesota SBI capital call distributions', metrics: ['Distribution', 'Capital Call'], intents: [] },
];

for (const { q, metrics: expected, intents: expectedIntents } of queryTests) {
  const metrics = getRequestedMetricTypes(q);
  const intents = detectSearchIntents(q);
  for (const em of expected) {
    assert(metrics.includes(em), `"${q}" detects ${em}`, `got [${metrics.join(', ')}]`);
  }
  assert(metrics.length === expected.length, `"${q}" finds exactly ${expected.length} metrics`, `got ${metrics.length}: [${metrics.join(', ')}]`);
  for (const ei of expectedIntents) {
    assert(intents.includes(ei), `"${q}" has intent ${ei}`, `got [${intents.join(', ')}]`);
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: DOCUMENT-FAMILY ROUTING
// ═══════════════════════════════════════════════════════════

section('2. DOCUMENT-FAMILY ROUTING');

const routingTests = [
  { fund: 'PSERS', q: 'PSERS private markets IRR, TVPI, DPI, NAV', expectedType: 'performance', expectedLabel: 'Asset Allocation and Performance' },
  { fund: 'PSERS', q: 'PSERS new fund commitments approvals', expectedType: 'meeting', expectedLabel: 'Board of Trustees Meetings' },
  { fund: 'PSERS', q: 'PSERS financial report acfr', expectedType: 'financial', expectedLabel: 'Financial Reports' },
  { fund: 'Minnesota SBI', q: 'Minnesota SBI quarterly private markets performance', expectedType: 'performance', expectedLabel: 'Comprehensive Performance Report' },
  { fund: 'Minnesota SBI', q: 'Minnesota SBI IRR TVPI DPI NAV', expectedType: 'performance', expectedLabel: 'Comprehensive Performance Report' },
  { fund: 'Minnesota SBI', q: 'Minnesota SBI board meeting agenda', expectedType: 'meeting' },
  { fund: 'SAMCERA', q: 'SAMCERA private markets IRR TVPI DPI', expectedType: 'performance', expectedLabel: 'Investment Performance Reports' },
  { fund: 'SAMCERA', q: 'SAMCERA new fund commitments', expectedType: 'meeting', expectedLabel: 'Board of Retirement Meetings' },
  { fund: 'NM PERA', q: 'NM PERA IRR NAV private equity', expectedType: 'performance', expectedLabel: 'Investments Performance' },
  { fund: 'NM PERA', q: 'NM PERA board approvals', expectedType: 'meeting' },
];

for (const { fund, q, expectedType, expectedLabel } of routingTests) {
  const best = findBestSource(fund, q);
  assert(best.documentType === expectedType, `"${q}" routes to ${expectedType}`, `got ${best.documentType} (${best.label})`);
  if (expectedLabel) {
    assert(best.label === expectedLabel, `"${q}" picks "${expectedLabel}"`, `got "${best.label}"`);
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: SCORING PENALTIES
// ═══════════════════════════════════════════════════════════

section('3. SCORING PENALTIES');

// Performance queries should strongly penalize board sources
const perfIntents: SearchIntent[] = ['performance'];
assert(scoreDocumentTypeFit('performance', perfIntents) > 0, 'Performance type gets positive score for performance query');
assert(scoreDocumentTypeFit('meeting', perfIntents) < -8, 'Meeting type gets strong negative for performance query', `got ${scoreDocumentTypeFit('meeting', perfIntents)}`);
assert(scoreDocumentTypeFit('minutes', perfIntents) < -8, 'Minutes type gets strong negative for performance query');
assert(scoreDocumentTypeFit('performance', perfIntents) - scoreDocumentTypeFit('meeting', perfIntents) >= 15, 'Performance vs meeting gap is >= 15 points');

// Commitment queries should prefer board sources
const commitIntents: SearchIntent[] = ['commitment'];
assert(scoreDocumentTypeFit('meeting', commitIntents) > scoreDocumentTypeFit('financial', commitIntents), 'Meeting > Financial for commitment');
assert(scoreDocumentTypeFit('financial', commitIntents) < 0, 'Financial is negative for commitment');

// ═══════════════════════════════════════════════════════════
// SECTION 4: COVERAGE SCORING
// ═══════════════════════════════════════════════════════════

section('4. COVERAGE SCORING');

// 4a: Basic coverage
const basicMetrics = [m('IRR', '12%', 'PE'), m('TVPI', '1.4x', 'PE'), m('NAV', '$5B', 'PE')];
const basic = computeCoverageScore(basicMetrics, ['IRR', 'TVPI', 'DPI', 'NAV']);
assert(basic.score === 0.75, 'Basic: 3/4 = 75%');
assert(basic.missingTypes.includes('DPI'), 'Basic: DPI missing');

// 4b: Asset-class filtering
const mixedMetrics = [
  m('IRR', '5%', 'Opportunistic'), m('NAV', '800', 'Event Driven'),
  m('IRR', '12%', 'Private Equity'), m('NAV', '$10B', 'Total Private Markets'),
];
const noFilter = computeCoverageScore(mixedMetrics, ['IRR', 'NAV']);
const withFilter = computeCoverageScore(mixedMetrics, ['IRR', 'NAV'], ['Private Equity', 'Infrastructure']);
assert(noFilter.score === 1.0, 'No filter: 100% (all asset classes count)');
assert(withFilter.score === 1.0, 'With filter: 100% (PE + Total rows match)');

const onlyOpportunistic = [m('IRR', '5%', 'Opportunistic'), m('NAV', '800', 'Event Driven')];
const filteredOut = computeCoverageScore(onlyOpportunistic, ['IRR', 'NAV'], ['Private Equity']);
assert(filteredOut.score === 0, 'Filtered: 0% (Opportunistic excluded when PE specified)');

// 4c: Proxy detection
const proxyMetrics = [
  m('IRR', '10%', 'PE'),
  m('TVPI', '1.5x', 'PE', 'Multiple of Cost 1.5x (TVPI proxy)'),
  m('NAV', '$5B', 'PE'),
];
const proxyCoverage = computeCoverageScore(proxyMetrics, ['IRR', 'TVPI', 'DPI', 'NAV']);
assert(!proxyCoverage.foundTypes.includes('TVPI'), 'Proxy: TVPI not counted (only proxy exists)');
assert(proxyCoverage.missingTypes.includes('TVPI'), 'Proxy: TVPI listed as missing');
assert(proxyCoverage.score === 0.5, 'Proxy: 50% (IRR + NAV only)');

// 4d: Real + proxy together
const realAndProxy = [
  m('TVPI', '1.5x', 'PE', 'Multiple of Cost 1.5x'),
  m('TVPI', '1.42x', 'PE', 'TVPI 1.42x'),
];
const realAndProxyCoverage = computeCoverageScore(realAndProxy, ['TVPI']);
assert(realAndProxyCoverage.foundTypes.includes('TVPI'), 'Real+Proxy: TVPI counted (real match exists)');

// 4e: "Total" rows always pass asset class filter
const totalRows = [m('IRR', '10%', 'Total Private Markets'), m('NAV', '$26B', 'Combined Portfolio')];
const totalCoverage = computeCoverageScore(totalRows, ['IRR', 'NAV'], ['Infrastructure']);
assert(totalCoverage.score === 1.0, 'Total/Combined rows pass any asset class filter');

// 4f: No activity values ignored
const noActivityMetrics = [m('IRR', 'No activity', 'PE'), m('NAV', '$5B', 'PE')];
const noActivityCoverage = computeCoverageScore(noActivityMetrics, ['IRR', 'NAV']);
assert(noActivityCoverage.score === 0.5, '"No activity" values filtered out');

// ═══════════════════════════════════════════════════════════
// SECTION 5: DEDUPLICATION
// ═══════════════════════════════════════════════════════════

section('5. DEDUPLICATION');

const dupes = [
  m('IRR', '12%', 'PE'), m('IRR', '12%', 'PE'),  // exact dupe
  m('TVPI', '1.4x', 'PE'), m('IRR', '8%', 'Infra'),  // different
];
const deduped = deduplicateMetrics(dupes);
assert(deduped.length === 3, 'Dedup: 4 -> 3 (one exact duplicate removed)');

// ═══════════════════════════════════════════════════════════
// SECTION 6: PAGE WINDOW SELECTION
// ═══════════════════════════════════════════════════════════

section('6. PAGE WINDOW SELECTION');

// Simulate page scores for a 100-page document
interface PageScore { pageNum: number; score: number; }
function selectTopPages(scores: PageScore[], maxPages: number): number[] {
  const totalPages = scores.length;
  const topHits = scores.filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, maxPages);
  const windowPages = new Set<number>();
  for (const hit of topHits) {
    if (hit.pageNum > 1) windowPages.add(hit.pageNum - 1);
    windowPages.add(hit.pageNum);
    if (hit.pageNum < totalPages) windowPages.add(hit.pageNum + 1);
  }
  const windowMax = Math.min(Math.ceil(maxPages * 1.6), maxPages + 5);
  return [...windowPages].sort((a, b) => a - b).slice(0, windowMax);
}

const pageScores: PageScore[] = Array.from({ length: 100 }, (_, i) => ({
  pageNum: i + 1,
  score: [83, 85, 90].includes(i + 1) ? 50 : 0,
}));

const selectedPages = selectTopPages(pageScores, 5);
assert(selectedPages.includes(83), 'Page 83 (hit) included');
assert(selectedPages.includes(82), 'Page 82 (neighbor) included');
assert(selectedPages.includes(84), 'Page 84 (neighbor) included');
assert(selectedPages.includes(84), 'Page 84 (between cluster hits 83 and 85) included');
assert(selectedPages.includes(85), 'Page 85 (hit) included');
assert(selectedPages.includes(86), 'Page 86 (neighbor) included');
assert(selectedPages.includes(89), 'Page 89 (neighbor of 90) included');
assert(selectedPages.includes(90), 'Page 90 (hit) included');
assert(selectedPages.includes(91), 'Page 91 (neighbor of 90) included');
assert(!selectedPages.includes(50), 'Page 50 (non-hit) excluded');
assert(selectedPages.length <= 10, `Window pages capped reasonably (got ${selectedPages.length})`);

// ═══════════════════════════════════════════════════════════
// SECTION 7: GOLD-TEST BENCHMARK DEFINITIONS (all 16 cases)
// ═══════════════════════════════════════════════════════════

section('7. GOLD-TEST DEFINITIONS (all 16 cases)');

interface GoldTest {
  id: string;
  query: string;
  fund: string;
  expectedSourceFamily: string; // pipe-separated means any match is acceptable
  expectedMetricTypes: string[];
  expectedAssetClasses?: string[];
  notes: string;
}

const GOLD_TESTS: GoldTest[] = [
  {
    id: 'PSERS-1',
    query: 'PSERS private markets IRR, TVPI, DPI, and NAV',
    fund: 'PSERS',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: ['IRR', 'TVPI', 'DPI', 'NAV'],
    expectedAssetClasses: ['Private Equity', 'Infrastructure', 'Credit', 'Real Estate', 'Total Private Markets'],
    notes: 'DPI may genuinely be absent from PSERS disclosures. TVPI proxy via "Multiple of Cost" must not count as full hit.',
  },
  {
    id: 'PSERS-2',
    query: 'PSERS quarterly private markets performance',
    fund: 'PSERS',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: [],
    notes: 'Broad query. Should produce asset-class summary headline, not a single-row headline.',
  },
  {
    id: 'PSERS-3',
    query: 'PSERS new fund commitments and approvals',
    fund: 'PSERS',
    expectedSourceFamily: 'meeting',
    expectedMetricTypes: ['Commitment'],
    notes: 'Must route to board/meeting, not financial reports.',
  },
  {
    id: 'PSERS-4',
    query: 'PSERS asset allocation total fund',
    fund: 'PSERS',
    expectedSourceFamily: 'performance|financial',
    expectedMetricTypes: ['Asset Allocation'],
    notes: 'Both performance and financial sources are acceptable for asset allocation.',
  },
  {
    id: 'PSERS-5',
    query: 'PSERS manager termination T. Rowe Price',
    fund: 'PSERS',
    expectedSourceFamily: 'meeting|minutes',
    expectedMetricTypes: [],
    notes: 'Manager-change detection query. Should route to board/meeting materials, not performance tables.',
  },
  {
    id: 'MNSBI-1',
    query: 'Minnesota SBI quarterly private markets performance',
    fund: 'Minnesota SBI',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: [],
    notes: 'Broad query. Should pick Comprehensive Performance Report. Expect partial-subset completeness for 135-page document.',
  },
  {
    id: 'MNSBI-2',
    query: 'Minnesota SBI IRR TVPI DPI NAV private markets',
    fund: 'Minnesota SBI',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: ['IRR', 'TVPI', 'DPI', 'NAV'],
    notes: 'DPI may not exist in this report. TVPI may be labeled "Investment Multiple" -- proxy detection should catch this.',
  },
  {
    id: 'MNSBI-3',
    query: 'Minnesota SBI private credit total NAV IRR TVPI',
    fund: 'Minnesota SBI',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: ['NAV', 'IRR', 'TVPI'],
    notes: 'Narrow scope: Private Credit specifically. Exact row-level result is acceptable here.',
  },
  {
    id: 'MNSBI-4',
    query: 'Minnesota SBI board meeting agenda new investments',
    fund: 'Minnesota SBI',
    expectedSourceFamily: 'meeting',
    expectedMetricTypes: [],
    notes: 'Board query. Must NOT route to Comprehensive Performance Report.',
  },
  {
    id: 'SAMCERA-1',
    query: 'SAMCERA private markets IRR TVPI DPI',
    fund: 'SAMCERA',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: ['IRR', 'TVPI', 'DPI'],
    notes: 'Performance query for SAMCERA. Should pick Investment Performance Reports.',
  },
  {
    id: 'SAMCERA-2',
    query: 'SAMCERA private equity performance review',
    fund: 'SAMCERA',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: [],
    notes: 'Broad performance query scoped to PE. Should produce summary output, not row-level headline.',
  },
  {
    id: 'SAMCERA-3',
    query: 'SAMCERA new commitments board meeting',
    fund: 'SAMCERA',
    expectedSourceFamily: 'meeting',
    expectedMetricTypes: ['Commitment'],
    notes: 'Commitment query for SAMCERA. Must route to Board of Retirement Meetings.',
  },
  {
    id: 'NMPERA-1',
    query: 'NM PERA IRR NAV private equity performance',
    fund: 'NM PERA',
    expectedSourceFamily: 'performance',
    expectedMetricTypes: ['IRR', 'NAV'],
    notes: 'NM PERA site may return 403. Routing should still be correct even if scraping fails.',
  },
  {
    id: 'NMPERA-2',
    query: 'NM PERA board approvals commitments',
    fund: 'NM PERA',
    expectedSourceFamily: 'meeting|minutes',
    expectedMetricTypes: ['Commitment'],
    notes: 'Board/commitment query. Must route to meeting/minutes.',
  },
  {
    id: 'ISBI-1',
    query: 'ISBI quarterly performance private markets',
    fund: 'ISBI',
    expectedSourceFamily: 'investment|general',
    expectedMetricTypes: [],
    notes: 'ISBI has limited availability (closed sessions). Should route to investment or general, not meeting minutes.',
  },
  {
    id: 'ISBI-2',
    query: 'ISBI meeting minutes manager termination',
    fund: 'ISBI',
    expectedSourceFamily: 'minutes',
    expectedMetricTypes: [],
    notes: 'Manager-change signal query. Must route to meeting minutes.',
  },
];

console.log('\n  Gold-test routing validation:');
for (const gt of GOLD_TESTS) {
  const best = findBestSource(gt.fund, gt.query);
  const acceptableFamilies = gt.expectedSourceFamily.split('|');
  const routeCorrect = acceptableFamilies.includes(best.documentType);
  assert(routeCorrect, `[${gt.id}] routes to ${gt.expectedSourceFamily}`, `got ${best.documentType} (${best.label})`);

  const metrics = getRequestedMetricTypes(gt.query);
  const metricsCorrect = gt.expectedMetricTypes.every((em) => metrics.includes(em)) && metrics.length === gt.expectedMetricTypes.length;
  assert(metricsCorrect, `[${gt.id}] parses ${gt.expectedMetricTypes.length} metrics`, `expected [${gt.expectedMetricTypes.join(',')}], got [${metrics.join(',')}]`);
}

console.log('\n  Gold-test query sheet (for manual browser validation):');
console.log('  ' + '-'.repeat(95));
console.log('  | ID        | Query                                          | Source Family      | Metrics          |');
console.log('  ' + '-'.repeat(95));
for (const gt of GOLD_TESTS) {
  const q = gt.query.padEnd(47).slice(0, 47);
  const sf = gt.expectedSourceFamily.padEnd(19);
  const mt = (gt.expectedMetricTypes.join(',') || 'broad').padEnd(17);
  console.log(`  | ${gt.id.padEnd(10)}| ${q}| ${sf}| ${mt}|`);
}
console.log('  ' + '-'.repeat(95));

// ═══════════════════════════════════════════════════════════
// SECTION 8: FRESHNESS SCORING
// ═══════════════════════════════════════════════════════════

section('8. FRESHNESS SCORING');

function scoreFreshness(filename: string): { score: number; year: number | null; quarter: number | null } {
  const lower = filename.toLowerCase();
  let year: number | null = null;
  let quarter: number | null = null;

  const yearMatch = lower.match(/(?:fy[-\s]?)?(\d{4})/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 2018 && y <= 2030) year = y;
  }
  if (!year) {
    const shortYearMatch = lower.match(/(?:fy|q\d[-\s]?)(\d{2})\b/);
    if (shortYearMatch) {
      const y = parseInt(shortYearMatch[1], 10);
      if (y >= 18 && y <= 30) year = 2000 + y;
    }
  }

  const quarterMatch = lower.match(/q([1-4])/i);
  if (quarterMatch) quarter = parseInt(quarterMatch[1], 10);
  if (!quarter) {
    if (/(?:jan|feb|mar|march)/i.test(lower)) quarter = 1;
    else if (/(?:apr|may|jun|june)/i.test(lower)) quarter = 2;
    else if (/(?:jul|aug|sep|september)/i.test(lower)) quarter = 3;
    else if (/(?:oct|nov|dec|december)/i.test(lower)) quarter = 4;
  }

  const currentYear = new Date().getFullYear();
  let score = 0;
  if (year) {
    if (year === currentYear) score += 10;
    else if (year === currentYear - 1) score += 6;
    else if (year === currentYear - 2) score += 2;
    else if (year < currentYear - 2) score -= 5;
  }
  if (quarter) score += quarter * 2;
  return { score, year, quarter };
}

const freshnessTests = [
  { file: 'psers-portfolio-quarterly-q3-25.pdf', year: 2025, quarter: 3 },
  { file: 'msbi_comprehensive_performance_report_june_30_2025.pdf', year: 2025, quarter: 2 },
  { file: 'Q4-2024-Performance-Report.pdf', year: 2024, quarter: 4 },
  { file: 'FY2023-Annual-Report.pdf', year: 2023, quarter: null },
  { file: 'board-meeting-agenda-march-2025.pdf', year: 2025, quarter: 1 },
  { file: 'some-random-file.pdf', year: null, quarter: null },
  { file: 'q4-25-disclosure-report.pdf', year: 2025, quarter: 4 },
  { file: 'FY25-Q1-Performance.pdf', year: 2025, quarter: 1 },
];

for (const { file, year, quarter } of freshnessTests) {
  const result = scoreFreshness(file);
  if (year !== null) {
    assert(result.year === year, `"${file}" year=${year}`, `got ${result.year}`);
  } else {
    assert(result.year === null, `"${file}" no year detected`, `got ${result.year}`);
  }
  if (quarter !== null) {
    assert(result.quarter === quarter, `"${file}" Q${quarter}`, `got Q${result.quarter}`);
  }
}

// Freshness ordering: newer should score higher
const q4_25 = scoreFreshness('report-q4-25.pdf');
const q3_25 = scoreFreshness('report-q3-25.pdf');
const q4_24 = scoreFreshness('report-q4-24.pdf');
const q1_23 = scoreFreshness('report-q1-23.pdf');
assert(q4_25.score > q3_25.score, 'Q4-25 > Q3-25');
assert(q3_25.score > q4_24.score, 'Q3-25 > Q4-24');
assert(q4_24.score > q1_23.score, 'Q4-24 > Q1-23');

// ═══════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════

console.log(`  ${sectionPassed}/${sectionPassed + sectionFailed} passed\n`);
console.log('\u2550'.repeat(50));
const total = passed + failed;
const pct = ((passed / total) * 100).toFixed(1);
console.log(`\n  TOTAL: ${passed}/${total} passed (${pct}%)`);
if (failed > 0) {
  console.log(`  ${failed} FAILURES \u2014 see above for details`);
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
