/**
 * Unit test for PDF scoring heuristics.
 * Validates that for "PSERS private markets IRR, TVPI, DPI, and NAV":
 *   - "Portfolio Quarterly Disclosure Report" ranks above "Quarterly Statement"
 *   - Financial statements get properly penalized
 *   - Disclosure/portfolio reports get properly boosted
 *
 * Run: node test-scoring-heuristics.cjs
 */

// ── Re-implement the scoring helpers (mirrors LiveSearchTrackerCard.tsx) ──

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function fileMatchesMetricType(text, metricType) {
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

function scorePdfLink(filename, url, intents, focusMetricTypes) {
  const normalized = `${filename} ${url}`.toLowerCase();
  const normalizedFocusMetricTypes = focusMetricTypes.map((m) => m.toLowerCase());
  const wantsSpecificPerformanceMetrics = normalizedFocusMetricTypes.some((m) => ['irr', 'tvpi', 'dpi'].includes(m));
  let score = 0;
  const reasons = [];

  if (/\b2026\b/.test(normalized)) { score += 8; reasons.push('2026'); }
  else if (/\b2025\b/.test(normalized)) { score += 7; reasons.push('2025'); }
  else if (/\b2024\b/.test(normalized)) { score += 4; reasons.push('2024'); }

  if (includesAny(normalized, ['apr', 'april', 'mar', 'march', 'feb', 'january', 'jan', 'may', 'jun', 'june'])) {
    score += 2;
  }

  if (intents.includes('performance')) {
    const matchedFocusMetrics = focusMetricTypes.filter((metric) => fileMatchesMetricType(normalized, metric));
    if (matchedFocusMetrics.length > 0) {
      score += matchedFocusMetrics.length * 16;
      reasons.push(matchedFocusMetrics.join(' + '));
    }

    // Strong boost for portfolio/disclosure reports
    if (includesAny(normalized, ['disclosure report', 'portfolio report', 'combined portfolio', 'portfolio quarterly'])) {
      score += wantsSpecificPerformanceMetrics ? 25 : 20;
      reasons.push('portfolio/disclosure report');
      if (normalized.includes('quarterly') && normalized.includes('disclosure')) {
        score += 8;
        reasons.push('quarterly disclosure');
      }
    } else if (includesAny(normalized, ['performance review', 'performance report', 'private markets', 'private market'])) {
      score += 12;
      reasons.push('performance report');
    }

    // Penalize financial statements
    if (includesAny(normalized, ['financial statement', 'quarterly statement', 'statement of', 'net position', 'fiduciary'])) {
      score -= 18;
      reasons.push('financial statement (not performance)');
    }

    // Compound penalty
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

  return { filename, score, reasons };
}

// ── Preview scoring (mirrors pdfFilter.ts scorePreviewText) ──

const HIGH_VALUE_KEYWORDS = new Set(['irr', 'tvpi', 'dpi', 'nav', 'commitment', 'commitments']);

function scorePreviewText(text, focusKeywords, requestedMetricTypes) {
  const normalized = text.toLowerCase();
  const matchedKeywords = [];
  const matchedMetricTypes = requestedMetricTypes.filter((mt) => normalized.includes(mt.toLowerCase()));
  const negativeSignals = [];
  let score = 0;

  for (const keyword of focusKeywords) {
    const matches = normalized.match(new RegExp(keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
    if (!matches) continue;
    matchedKeywords.push(keyword);
    const weight = HIGH_VALUE_KEYWORDS.has(keyword.toLowerCase()) ? 12 : 4;
    score += Math.min(matches.length, 4) * weight;
  }

  if (matchedMetricTypes.length > 0) {
    score += matchedMetricTypes.length * 14;
    score += matchedMetricTypes.length >= Math.min(requestedMetricTypes.length, 2) ? 8 : 0;
    if (requestedMetricTypes.length > 0 && matchedMetricTypes.length === requestedMetricTypes.length) {
      score += 20; // was 14, now 20
    }
  }

  // Negative signals
  if (/\bfinancial statements?\b/i.test(normalized)) negativeSignals.push('financial statements');
  if (/\bstatement of fiduciary/i.test(normalized)) negativeSignals.push('fiduciary statements');
  if (/\bnet position\b/i.test(normalized)) negativeSignals.push('net position summary');

  const wantsSpecificPerformanceMetrics = requestedMetricTypes.some((mt) => ['IRR', 'TVPI', 'DPI'].includes(mt));
  const looksAllocationHeavy = normalized.includes('asset allocation') || normalized.includes('alternative investments');

  if (wantsSpecificPerformanceMetrics && matchedMetricTypes.length === 0 && looksAllocationHeavy) {
    negativeSignals.push('allocation-heavy summary');
    score -= 22;
  }

  // Updated penalty logic (was: matchedMetricTypes.length < 2 → -18)
  if (wantsSpecificPerformanceMetrics && negativeSignals.length > 0 && matchedMetricTypes.length === 0) {
    score -= 18;
  } else if (wantsSpecificPerformanceMetrics && negativeSignals.length > 0 && matchedMetricTypes.length < 2) {
    score -= 8; // reduced from -18
  } else if (negativeSignals.length > 0 && matchedMetricTypes.length === 0) {
    score -= 10;
  }

  return { score, matchedKeywords, matchedMetricTypes, negativeSignals };
}

// ═══════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════

const QUERY_INTENTS = ['performance'];
const FOCUS_METRICS = ['IRR', 'TVPI', 'DPI', 'NAV'];
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

// ── Test 1: Filename scoring — disclosure vs quarterly statement ──
console.log('\n═══ TEST 1: Filename Scoring ═══');
console.log('Query: "PSERS private markets IRR, TVPI, DPI, and NAV"\n');

const pdfs = [
  { filename: 'quarterly statement december 2024.pdf', url: 'https://psers.pa.gov/docs/quarterly-statement-december-2024.pdf' },
  { filename: 'portfolio quarterly public disclosure report december 2024.pdf', url: 'https://psers.pa.gov/docs/portfolio-quarterly-disclosure-report-dec-2024.pdf' },
  { filename: 'private markets combined portfolio report q4 2024.pdf', url: 'https://psers.pa.gov/docs/private-markets-combined-portfolio-q4-2024.pdf' },
  { filename: 'statement of fiduciary net position 2024.pdf', url: 'https://psers.pa.gov/docs/fiduciary-net-position-2024.pdf' },
  { filename: 'asset allocation and performance summary 2024.pdf', url: 'https://psers.pa.gov/docs/asset-allocation-performance-2024.pdf' },
  { filename: 'psers private equity performance review march 2025.pdf', url: 'https://psers.pa.gov/docs/pe-performance-review-march-2025.pdf' },
];

const scored = pdfs
  .map((pdf) => scorePdfLink(pdf.filename, pdf.url, QUERY_INTENTS, FOCUS_METRICS))
  .sort((a, b) => b.score - a.score);

console.log('Ranked results:');
scored.forEach((item, i) => {
  console.log(`  ${i + 1}. [${item.score}] ${item.filename}`);
  console.log(`     Reasons: ${item.reasons.join(', ')}`);
});

console.log('');
assert(
  scored[0].filename.includes('disclosure') || scored[0].filename.includes('combined portfolio'),
  'Top file is a disclosure/portfolio report (not a quarterly statement)'
);
assert(
  scored.findIndex((s) => s.filename.includes('quarterly statement')) >
  scored.findIndex((s) => s.filename.includes('disclosure')),
  '"quarterly statement" ranks below "disclosure report"'
);
assert(
  scored.find((s) => s.filename.includes('quarterly statement')).score <
  scored.find((s) => s.filename.includes('disclosure')).score,
  '"quarterly statement" has lower score than "disclosure report"'
);
assert(
  scored.find((s) => s.filename.includes('fiduciary')).score < 0,
  '"statement of fiduciary net position" has negative score'
);
assert(
  scored.find((s) => s.filename.includes('combined portfolio')).score > 20,
  '"private markets combined portfolio report" has strong positive score'
);

// ── Test 2: Preview scoring — metrics found despite negative signals ──
console.log('\n═══ TEST 2: Preview Scoring — Metrics with Negative Signals ═══\n');

const disclosurePreview = `
  Portfolio Quarterly Public Disclosure Report. Statement of Fiduciary Net Position summary.
  Private Equity: IRR 11.4%, TVPI 1.52x, DPI 0.87x, NAV $4.2 billion.
  Real Estate: IRR 8.9%, TVPI 1.31x. Infrastructure: IRR 12.1%.
`;

const statementPreview = `
  Statement of Fiduciary Net Position. December 31, 2024.
  Net Position Restricted for Pensions: $72.1 billion.
  Total assets: $74.3 billion. Total liabilities: $2.2 billion.
  Financial Statements for the Year Ended December 31, 2024.
`;

const focusKeywords = ['irr', 'tvpi', 'dpi', 'nav', 'private markets', 'portfolio', 'performance review'];

const disclosureScore = scorePreviewText(disclosurePreview, focusKeywords, FOCUS_METRICS);
const statementScore = scorePreviewText(statementPreview, focusKeywords, FOCUS_METRICS);

console.log(`Disclosure report preview:`);
console.log(`  Score: ${disclosureScore.score}, Matched metrics: [${disclosureScore.matchedMetricTypes}], Negative: [${disclosureScore.negativeSignals}]`);
console.log(`Statement preview:`);
console.log(`  Score: ${statementScore.score}, Matched metrics: [${statementScore.matchedMetricTypes}], Negative: [${statementScore.negativeSignals}]`);
console.log('');

assert(
  disclosureScore.score > statementScore.score,
  'Disclosure report preview scores higher than statement preview'
);
assert(
  disclosureScore.score > 0,
  'Disclosure report has positive preview score despite "fiduciary" mention'
);
assert(
  statementScore.score < 0,
  'Financial statement has negative preview score'
);
assert(
  disclosureScore.matchedMetricTypes.length >= 3,
  `Disclosure preview matched ${disclosureScore.matchedMetricTypes.length} of 4 target metrics`
);

// ── Test 3: Combined scoring (filename + preview) ──
console.log('\n═══ TEST 3: Combined Scoring (Filename + Preview) ═══\n');

const disclosureCombined = scored.find((s) => s.filename.includes('disclosure')).score + disclosureScore.score;
const statementCombined = scored.find((s) => s.filename.includes('quarterly statement')).score + statementScore.score;

console.log(`  Disclosure combined: ${disclosureCombined} (filename: ${scored.find((s) => s.filename.includes('disclosure')).score} + preview: ${disclosureScore.score})`);
console.log(`  Statement combined:  ${statementCombined} (filename: ${scored.find((s) => s.filename.includes('quarterly statement')).score} + preview: ${statementScore.score})`);
console.log('');

assert(
  disclosureCombined > statementCombined,
  'Combined score: disclosure report wins over quarterly statement'
);
assert(
  disclosureCombined - statementCombined > 20,
  `Score gap is meaningful (${disclosureCombined - statementCombined} points)`
);

// ── Test 4: Edge cases ──
console.log('\n═══ TEST 4: Edge Cases ═══\n');

// A "quarterly" file that IS a disclosure report should NOT be penalized
const quarterlyDisclosure = scorePdfLink(
  'quarterly disclosure report december 2024.pdf',
  'https://psers.pa.gov/docs/quarterly-disclosure-dec-2024.pdf',
  QUERY_INTENTS, FOCUS_METRICS
);
assert(
  quarterlyDisclosure.score > 20,
  `"quarterly disclosure report" is not penalized (score: ${quarterlyDisclosure.score})`
);

// A generic "quarterly statement" without disclosure context IS penalized
const genericStatement = scorePdfLink(
  'quarterly statement september 2024.pdf',
  'https://psers.pa.gov/docs/quarterly-statement-sep-2024.pdf',
  QUERY_INTENTS, FOCUS_METRICS
);
assert(
  genericStatement.score < 0,
  `"quarterly statement" IS penalized (score: ${genericStatement.score})`
);

// Preview with 1 matched metric and negative signals gets reduced penalty (-8 not -18)
const partialMatchPreview = scorePreviewText(
  'Statement of Fiduciary Net Position. NAV for private equity: $3.1 billion.',
  focusKeywords, FOCUS_METRICS
);
assert(
  partialMatchPreview.negativeSignals.length > 0 && partialMatchPreview.score > -10,
  `Partial match with negative signals gets reduced penalty (score: ${partialMatchPreview.score})`
);

// ── Summary ──
console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
