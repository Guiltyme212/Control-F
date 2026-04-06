import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const FINANCIAL_KEYWORDS = [
  'commitment', 'committed', 'allocation', 'allocated', 'terminated', 'termination',
  'million', 'billion', 'irr', 'tvpi', 'dpi', 'nav', 'aum',
  'infrastructure', 'private equity', 'real estate', 'credit',
  'management fee', 'carry', 'hurdle', 'fund size', 'target return',
  'distribution', 'capital call', 'co-investment', 'co-invest',
  'performance', 'vintage', 'unfunded', 'paid-in', 'net asset',
];

const FINANCIAL_PATTERNS = [
  /\$[\d,.]+/g,
  /€[\d,.]+/g,
  /[\d.]+%/g,
  /[\d.]+x\b/g,
  /\d{1,3}(,\d{3})+/g,
];

interface PageScore {
  pageNum: number;
  score: number;
}

export interface PdfPreviewScore {
  score: number;
  matchedKeywords: string[];
  matchedMetricTypes: string[];
  negativeSignals: string[];
  excerpt: string;
  numericSignalCount: number;
  pagesScanned: number;
}

const PREVIEW_NUMERIC_PATTERNS = [
  /\$[\d,.]+/g,
  /€[\d,.]+/g,
  /[\d.]+%/g,
  /[\d.]+x\b/g,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PREVIEW_NEGATIVE_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'financial statements', pattern: /\bfinancial statements?\b/i },
  { label: 'fiduciary statements', pattern: /\bstatement of fiduciary (net position|changes in fiduciary net position)\b/i },
  { label: 'net position summary', pattern: /\bnet position\b/i },
  { label: 'basic financial report', pattern: /\b(acfr|annual comprehensive financial report|annual financial report)\b/i },
];

const BOARD_PACKET_SIGNALS = [
  'board meeting',
  'board of trustees',
  'board packet',
  'agenda',
  'minutes',
  'committee',
  'consent',
  'resolution',
  'action item',
];

const PERFORMANCE_DOCUMENT_SIGNALS = [
  'performance report',
  'performance review',
  'portfolio report',
  'quarterly review',
  'quarterly performance',
  'combined portfolio',
  'private markets',
  'since inception',
  'benchmark',
  'net return',
  'irr',
  'tvpi',
  'dpi',
];

const FINANCIAL_STATEMENT_SIGNALS = [
  'financial statements',
  'annual financial report',
  'annual comprehensive financial report',
  'statement of fiduciary net position',
  'statement of changes in fiduciary net position',
  'net position',
  'balance sheet',
  'income statement',
  'cash flow statement',
  'net assets',
];

const ALLOCATION_HEAVY_SIGNALS = [
  'asset allocation',
  'allocation',
  'total fund',
  'market value',
  'alternative investments',
];

const SPECIFIC_PERFORMANCE_METRICS = ['irr', 'tvpi', 'dpi'];

const COMMITMENT_DOCUMENT_SIGNALS = [
  'commitment',
  'commitments',
  'approved',
  'approval',
  'co-investment',
  'capital call',
  'new investment',
  'million',
  'billion',
  'termination',
  'terminated',
  'allocation recommendation',
  'investment recommendation',
];

function collectSignals(text: string, signals: string[]): string[] {
  return signals.filter((signal) => text.includes(signal));
}

function analyzeQueryContext(queryContext?: string) {
  const normalized = (queryContext || '').toLowerCase();

  return {
    normalized,
    wantsPerformance: normalized.includes('performance'),
    wantsSpecificPerformanceMetrics: SPECIFIC_PERFORMANCE_METRICS.some((metric) => normalized.includes(metric)),
    wantsBoard: ['board', 'agenda', 'minutes', 'meeting', 'committee'].some((term) => normalized.includes(term)),
    wantsFinancial: ['financial', 'acfr', 'annual report', 'balance sheet', 'net position'].some((term) => normalized.includes(term)),
    wantsCommitment: ['commitment', 'commitments', 'investment', 'investments', 'approval', 'approvals', 'co-investment', 'capital call', 'termination', 'terminated']
      .some((term) => normalized.includes(term)),
  };
}

function previewTextMatchesMetricType(text: string, metricType: string): boolean {
  const normalized = text.toLowerCase();

  switch (metricType) {
    case 'Asset Allocation':
      return normalized.includes('asset allocation') || normalized.includes('allocation');
    case 'Target Fund Size':
      return normalized.includes('target fund size') || normalized.includes('fund size');
    case 'Target Return':
      return normalized.includes('target return');
    case 'Management Fee':
      return normalized.includes('management fee') || normalized.includes('mgmt fee');
    case 'Co-Investment':
      return normalized.includes('co-investment') || normalized.includes('coinvestment') || normalized.includes('co investment');
    case 'Capital Call':
      return normalized.includes('capital call') || normalized.includes('capital calls');
    default:
      return normalized.includes(metricType.toLowerCase());
  }
}

export async function extractPdfPreviewText(pdfData: Uint8Array, maxPages = 5): Promise<{ text: string; pagesScanned: number }> {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const pagesScanned = Math.min(doc.numPages, maxPages);
  const pageTexts: string[] = [];

  for (let i = 1; i <= pagesScanned; i += 1) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    pageTexts.push(text);
  }

  doc.destroy();

  return {
    text: pageTexts.join(' ').replace(/\s+/g, ' ').trim(),
    pagesScanned,
  };
}

// Core performance metrics are worth much more — these are what users specifically search for
const HIGH_VALUE_KEYWORDS = new Set(['irr', 'tvpi', 'dpi', 'nav', 'commitment', 'commitments']);

export function scorePreviewText(
  text: string,
  focusKeywords: string[],
  requestedMetricTypes: string[] = [],
): PdfPreviewScore {
  const normalized = text.toLowerCase();
  const matchedKeywords: string[] = [];
  const matchedMetricTypes = requestedMetricTypes.filter((metricType) => previewTextMatchesMetricType(text, metricType));
  const negativeSignals: string[] = [];
  let score = 0;

  for (const keyword of focusKeywords) {
    const escapedKeyword = escapeRegExp(keyword.toLowerCase());
    const matches = normalized.match(new RegExp(escapedKeyword, 'gi'));
    if (!matches) continue;
    matchedKeywords.push(keyword);
    const weight = HIGH_VALUE_KEYWORDS.has(keyword.toLowerCase()) ? 12 : 4;
    score += Math.min(matches.length, 4) * weight;
  }

  if (matchedMetricTypes.length > 0) {
    score += matchedMetricTypes.length * 14;
    score += matchedMetricTypes.length >= Math.min(requestedMetricTypes.length, 2) ? 8 : 0;
    if (requestedMetricTypes.length > 0 && matchedMetricTypes.length === requestedMetricTypes.length) {
      score += 20;
    }
    // Proportional bonus: smoother gradient between 1/3 and 3/3 metric match
    if (requestedMetricTypes.length > 0) {
      score += Math.round(matchedMetricTypes.length / requestedMetricTypes.length * 15);
    }
  }

  let numericSignalCount = 0;
  for (const pattern of PREVIEW_NUMERIC_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      numericSignalCount += matches.length;
    }
  }
  score += Math.min(numericSignalCount, 12);

  const percentCount = (text.match(/[\d.]+%/g) || []).length;
  const multipleCount = (text.match(/[\d.]+x\b/g) || []).length;
  if (percentCount >= 5 || multipleCount >= 3) {
    score += 8;
  }

  for (const signal of PREVIEW_NEGATIVE_SIGNAL_PATTERNS) {
    if (signal.pattern.test(normalized)) {
      negativeSignals.push(signal.label);
    }
  }

  const wantsSpecificPerformanceMetrics = requestedMetricTypes.some((metricType) =>
    ['IRR', 'TVPI', 'DPI'].includes(metricType),
  );
  const looksAllocationHeavy = normalized.includes('asset allocation') || normalized.includes('alternative investments');

  if (wantsSpecificPerformanceMetrics && matchedMetricTypes.length === 0 && looksAllocationHeavy) {
    negativeSignals.push('allocation-heavy summary');
    score -= 22;
  }

  if (wantsSpecificPerformanceMetrics && negativeSignals.length > 0 && matchedMetricTypes.length === 0) {
    score -= 18;
  } else if (wantsSpecificPerformanceMetrics && negativeSignals.length > 0 && matchedMetricTypes.length < 2) {
    score -= 8;
  } else if (negativeSignals.length > 0 && matchedMetricTypes.length === 0) {
    score -= 10;
  }

  const firstKeyword = matchedMetricTypes[0]?.toLowerCase() || matchedKeywords[0]?.toLowerCase();
  let excerpt = text.slice(0, 180).trim();
  if (firstKeyword) {
    const matchIndex = normalized.indexOf(firstKeyword);
    if (matchIndex >= 0) {
      const start = Math.max(0, matchIndex - 60);
      const end = Math.min(text.length, matchIndex + 140);
      excerpt = text.slice(start, end).trim();
    }
  }

  return {
    score,
    matchedKeywords: matchedKeywords.slice(0, 6),
    matchedMetricTypes,
    negativeSignals,
    excerpt,
    numericSignalCount,
    pagesScanned: 0,
  };
}

export async function scorePages(pdfData: Uint8Array, focusKeywords: string[] = []): Promise<PageScore[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const scores: PageScore[] = [];
  const normalizedFocusKeywords = focusKeywords.map((keyword) => keyword.toLowerCase());
  const hasSpecificPerformanceMetricFocus = normalizedFocusKeywords.some((keyword) => HIGH_VALUE_KEYWORDS.has(keyword));

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ')
      .toLowerCase();

    let score = 0;

    for (const keyword of FINANCIAL_KEYWORDS) {
      const matches = text.match(new RegExp(keyword, 'gi'));
      if (matches) score += matches.length;
    }

    for (const pattern of FINANCIAL_PATTERNS) {
      const matches = text.match(new RegExp(pattern));
      if (matches) score += matches.length * 2;
    }

    let focusMetricHits = 0;
    for (const focusKeyword of focusKeywords) {
      const matches = text.match(new RegExp(focusKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
      if (matches) {
        const normalizedKeyword = focusKeyword.toLowerCase();
        const weight = HIGH_VALUE_KEYWORDS.has(normalizedKeyword) ? 12 : 4;
        score += matches.length * weight;
        if (HIGH_VALUE_KEYWORDS.has(normalizedKeyword)) {
          focusMetricHits += matches.length;
        }
      }
    }

    if (hasSpecificPerformanceMetricFocus) {
      if (focusMetricHits > 0) {
        score += 18;
      }

      if (
        focusMetricHits === 0
        && (
          text.includes('statement of fiduciary net position')
          || text.includes('statement of changes in fiduciary net position')
          || text.includes('financial statements')
          || text.includes('net position')
        )
      ) {
        score -= 18;
      }
    }

    scores.push({ pageNum: i, score });
  }

  return scores;
}

export function selectTopPages(scores: PageScore[], maxPages: number, focused = false): number[] {
  const totalPages = scores.length;
  const topHits = scores
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  if (topHits.length === 0) return [];

  // Group hits into clusters (pages within 3 of each other = same cluster)
  const sortedHits = [...topHits].sort((a, b) => a.pageNum - b.pageNum);
  const clusters: Array<{ pages: number[]; maxScore: number }> = [];
  let currentCluster: { pages: number[]; maxScore: number } = {
    pages: [sortedHits[0].pageNum],
    maxScore: sortedHits[0].score,
  };

  for (let i = 1; i < sortedHits.length; i++) {
    const hit = sortedHits[i];
    const lastPage = currentCluster.pages[currentCluster.pages.length - 1];
    if (hit.pageNum - lastPage <= 5) {
      // Same cluster
      currentCluster.pages.push(hit.pageNum);
      currentCluster.maxScore = Math.max(currentCluster.maxScore, hit.score);
    } else {
      // New cluster
      clusters.push(currentCluster);
      currentCluster = { pages: [hit.pageNum], maxScore: hit.score };
    }
  }
  clusters.push(currentCluster);

  // Sort clusters by max score (strongest cluster first)
  clusters.sort((a, b) => b.maxScore - a.maxScore);

  // Keep top 4 clusters max (multi-section performance reports can have 4+ data sections)
  const topClusters = clusters.slice(0, 4);

  // Expand each cluster with neighbor pages
  const windowPages = new Set<number>();
  for (const cluster of topClusters) {
    const minPage = Math.min(...cluster.pages);
    const maxPage = Math.max(...cluster.pages);
    // Widen by cluster strength: strong clusters get ±3 to catch multi-page tables and summary rows
    const widen = cluster.maxScore > 30 ? 3 : cluster.maxScore > 15 ? 2 : 1;
    for (let p = Math.max(1, minPage - widen); p <= Math.min(totalPages, maxPage + widen); p++) {
      windowPages.add(p);
    }
  }

  // Cap at a reasonable limit (slightly above maxPages to allow windows; wider for focused queries)
  const multiplier = focused ? 2.0 : 1.6;
  const windowMax = Math.min(Math.ceil(maxPages * multiplier), maxPages + 8);
  return [...windowPages]
    .sort((a, b) => a - b)
    .slice(0, windowMax);
}

/**
 * Extract date signals from a PDF filename/URL and return a freshness score.
 * Newer documents score higher.
 */
export function scoreFreshness(filename: string): { score: number; year: number | null; quarter: number | null } {
  const lower = filename.toLowerCase();

  // Try to extract year
  let year: number | null = null;
  let quarter: number | null = null;

  // Patterns: 2025, 2024, FY2025, FY25, fy-2025
  const yearMatch = lower.match(/(?:fy[-\s]?)?(\d{4})/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 2018 && y <= 2030) year = y;
  }
  // Fallback: 2-digit year like q3-25, fy25
  if (!year) {
    const shortYearMatch = lower.match(/(?:fy|q\d[-\s]?)(\d{2})\b/);
    if (shortYearMatch) {
      const y = parseInt(shortYearMatch[1], 10);
      if (y >= 18 && y <= 30) year = 2000 + y;
    }
  }

  // Try to extract quarter
  const quarterMatch = lower.match(/q([1-4])/i);
  if (quarterMatch) {
    quarter = parseInt(quarterMatch[1], 10);
  }

  // Try month patterns: june, march, september, december, jan, feb, etc.
  if (!quarter) {
    if (/(?:jan|feb|mar|q1|first.quarter|march)/i.test(lower)) quarter = 1;
    else if (/(?:apr|may|jun|q2|second.quarter|june)/i.test(lower)) quarter = 2;
    else if (/(?:jul|aug|sep|q3|third.quarter|september)/i.test(lower)) quarter = 3;
    else if (/(?:oct|nov|dec|q4|fourth.quarter|december)/i.test(lower)) quarter = 4;
  }

  // Compute score
  const currentYear = new Date().getFullYear();
  let score = 0;

  if (year) {
    if (year === currentYear) score += 10;
    else if (year === currentYear - 1) score += 6;
    else if (year === currentYear - 2) score += 2;
    else if (year < currentYear - 2) score -= 5;
  }

  if (quarter) {
    // Within same year, later quarters are better
    score += quarter * 2;
  }

  return { score, year, quarter };
}

/* ------------------------------------------------------------------ */
/*  Early reject layer                                                 */
/*  Catches corporate financials and wrong-entity docs before Claude   */
/* ------------------------------------------------------------------ */

/**
 * Signals that indicate a corporate annual report / manager financials
 * rather than a pension-fund document. If enough of these are present
 * and no pension-fund signals exist, the doc should be rejected early.
 */
const CORPORATE_SIGNALS = [
  'annual results', 'annual report and accounts', 'shareholder',
  'earnings per share', 'dividend', 'revenue', 'ebitda',
  'fee-paying aum', 'fee paying aum', 'fundraising',
  'management company', 'group financial statements',
  'consolidated statement', 'profit and loss', 'income statement',
  'balance sheet', 'cash flow statement', 'operating profit',
  'statutory accounts', 'auditor', 'directors\' report',
  'share price', 'stock exchange', 'listed on',
  'pre - performance related earnings', 'underlying fre',
];

const PENSION_FUND_SIGNALS = [
  'pension', 'retirement', 'public employees', 'board of trustees',
  'fiduciary', 'plan assets', 'defined benefit',
  'investment committee', 'board of retirement',
  'state investment', 'employee retirement',
  'unfunded liability', 'actuarial',
  'private markets', 'asset allocation',
  'investment memo', 'investment recommendation',
  'ipc report', 'due diligence',
];

export interface EarlyRejectResult {
  /** Whether the document should be rejected before extraction */
  shouldReject: boolean;
  /** Reason for rejection (human-readable) */
  reason: string;
  /** Stable machine-readable code for logging/debugging */
  rejectCode?: string;
  /** Human-readable family hint for the off-target document */
  documentFamilyHint?: string;
  /** Specific signals detected */
  corporateSignals: string[];
  pensionSignals: string[];
  /** Confidence in the reject decision */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Check preview text from first few pages of a PDF for corporate/off-target signals.
 * Call this BEFORE sending to Claude to avoid expensive extraction of wrong documents.
 *
 * @param previewText - Text from first 3-5 pages
 * @param queryContext - The user's search query (for entity matching)
 * @returns Reject decision with reasoning
 */
export function earlyRejectCheck(
  previewText: string,
  queryContext?: string,
): EarlyRejectResult {
  const text = previewText.toLowerCase();
  const queryProfile = analyzeQueryContext(queryContext);

  // Count corporate vs pension signals
  const corporateHits = CORPORATE_SIGNALS.filter((s) => text.includes(s));
  const pensionHits = PENSION_FUND_SIGNALS.filter((s) => text.includes(s));
  const boardPacketHits = collectSignals(text, BOARD_PACKET_SIGNALS);
  const performanceHits = collectSignals(text, PERFORMANCE_DOCUMENT_SIGNALS);
  const financialStatementHits = collectSignals(text, FINANCIAL_STATEMENT_SIGNALS);
  const allocationHeavyHits = collectSignals(text, ALLOCATION_HEAVY_SIGNALS);

  const buildReject = (params: {
    rejectCode: string;
    reason: string;
    corporateSignals: string[];
    pensionSignals: string[];
    confidence: 'high' | 'medium';
    documentFamilyHint?: string;
  }): EarlyRejectResult => ({
    shouldReject: true,
    reason: params.reason,
    rejectCode: params.rejectCode,
    documentFamilyHint: params.documentFamilyHint,
    corporateSignals: params.corporateSignals,
    pensionSignals: params.pensionSignals,
    confidence: params.confidence,
  });

  const signalsSummary = (values: string[]) => values.length > 0 ? values.slice(0, 4).join(', ') : 'none';

  // Strong corporate signal with no pension signal = reject
  if (corporateHits.length >= 3 && pensionHits.length === 0) {
    return buildReject({
      rejectCode: 'CORPORATE_FINANCIALS',
      reason: `REJECT[CORPORATE_FINANCIALS]: preview looks like a manager/company annual report (${corporateHits.length} corporate signals, 0 pension signals).`,
      corporateSignals: corporateHits,
      pensionSignals: pensionHits,
      confidence: 'high',
      documentFamilyHint: 'corporate annual report',
    });
  }

  // Moderate corporate signal (2+) with very few pension signals
  if (corporateHits.length >= 2 && pensionHits.length <= 1) {
    return buildReject({
      rejectCode: 'CORPORATE_FINANCIALS',
      reason: `REJECT[CORPORATE_FINANCIALS]: strong corporate financial indicators (${signalsSummary(corporateHits)}).`,
      corporateSignals: corporateHits,
      pensionSignals: pensionHits,
      confidence: 'medium',
      documentFamilyHint: 'corporate financial report',
    });
  }

  const performanceQuery = queryProfile.wantsPerformance || queryProfile.wantsSpecificPerformanceMetrics;
  const boardPacketLooksOffTarget = queryProfile.wantsSpecificPerformanceMetrics
    && boardPacketHits.length >= 2
    && performanceHits.length === 0;
  const financialStatementLooksOffTarget = performanceQuery
    && financialStatementHits.length >= 2
    && performanceHits.length === 0;
  const allocationHeavyLooksOffTarget = queryProfile.wantsSpecificPerformanceMetrics
    && allocationHeavyHits.length >= 2
    && performanceHits.length === 0;

  if (boardPacketLooksOffTarget) {
    return buildReject({
      rejectCode: 'PERFORMANCE_BOARD_PACKET',
      reason: `REJECT[PERFORMANCE_BOARD_PACKET]: performance-multiple query landed on a board/minutes packet (${signalsSummary(boardPacketHits)}), with no direct performance signals in the preview.`,
      corporateSignals: boardPacketHits,
      pensionSignals: pensionHits,
      confidence: 'medium',
      documentFamilyHint: 'board / minutes packet',
    });
  }

  if (financialStatementLooksOffTarget) {
    return buildReject({
      rejectCode: 'PERFORMANCE_FINANCIAL_STATEMENT',
      reason: `REJECT[PERFORMANCE_FINANCIAL_STATEMENT]: preview looks like an annual report / financial statement family (${signalsSummary(financialStatementHits)}), with no direct performance metrics in the preview.`,
      corporateSignals: financialStatementHits,
      pensionSignals: pensionHits,
      confidence: 'high',
      documentFamilyHint: 'financial statement / annual report',
    });
  }

  if (allocationHeavyLooksOffTarget) {
    return buildReject({
      rejectCode: 'PERFORMANCE_ALLOCATION_ONLY',
      reason: `REJECT[PERFORMANCE_ALLOCATION_ONLY]: performance query landed on an allocation-heavy summary (${signalsSummary(allocationHeavyHits)}), but IRR/TVPI/DPI are absent from the preview.`,
      corporateSignals: allocationHeavyHits,
      pensionSignals: pensionHits,
      confidence: 'medium',
      documentFamilyHint: 'allocation summary',
    });
  }

  // Commitment query landing on an agenda/minutes with no actual commitment content
  const commitmentHits = collectSignals(text, COMMITMENT_DOCUMENT_SIGNALS);
  const commitmentOnAgenda = queryProfile.wantsCommitment
    && !queryProfile.wantsBoard
    && boardPacketHits.length >= 2
    && commitmentHits.length === 0;
  // Also catch: query wants both board + commitment, but doc is pure agenda (no dollar amounts, no approvals)
  const commitmentOnPureAgenda = queryProfile.wantsCommitment
    && queryProfile.wantsBoard
    && boardPacketHits.length >= 2
    && commitmentHits.length === 0
    && !text.includes('$');

  if (commitmentOnAgenda || commitmentOnPureAgenda) {
    return buildReject({
      rejectCode: 'COMMITMENT_AGENDA_ONLY',
      reason: `REJECT[COMMITMENT_AGENDA_ONLY]: commitment query landed on a board agenda/minutes (${signalsSummary(boardPacketHits)}), but no commitment-relevant content (approvals, dollar amounts, fund names) found in preview.`,
      corporateSignals: boardPacketHits,
      pensionSignals: pensionHits,
      confidence: 'medium',
      documentFamilyHint: 'board agenda / minutes',
    });
  }

  // Entity mismatch check: if the query names a specific pension fund,
  // and the preview text mentions a different corporate entity prominently
  if (queryContext) {
    const query = queryContext.toLowerCase();
    const knownPensionFunds = [
      'psers', 'pera', 'isbi', 'minnesota sbi', 'samcera', 'sdcers',
      'calpers', 'calstrs', 'ny state', 'new york', 'new jersey',
      'dcrb', 'santa barbara',
    ];

    const queryMentionsFund = knownPensionFunds.some((f) => query.includes(f));

    if (queryMentionsFund && corporateHits.length >= 1 && pensionHits.length === 0) {
      // Query mentions a pension fund, but the doc looks corporate
      return buildReject({
        rejectCode: 'ENTITY_MISMATCH',
        reason: `REJECT[ENTITY_MISMATCH]: query targets a pension fund but the preview looks like corporate financials (no pension-fund signals found).`,
        corporateSignals: corporateHits,
        pensionSignals: pensionHits,
        confidence: 'medium',
        documentFamilyHint: 'entity mismatch',
      });
    }
  }

  // No reject
  return {
    shouldReject: false,
    reason: '',
    rejectCode: undefined,
    documentFamilyHint: undefined,
    corporateSignals: corporateHits,
    pensionSignals: pensionHits,
    confidence: 'low',
  };
}
