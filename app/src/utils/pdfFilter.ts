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

export function selectTopPages(scores: PageScore[], maxPages: number): number[] {
  const totalPages = scores.length;
  const topHits = scores
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  // Expand each hit into a page window (page-1, page, page+1) to catch
  // adjacent summary rows, totals, and table continuations
  const windowPages = new Set<number>();
  for (const hit of topHits) {
    if (hit.pageNum > 1) windowPages.add(hit.pageNum - 1);
    windowPages.add(hit.pageNum);
    if (hit.pageNum < totalPages) windowPages.add(hit.pageNum + 1);
  }

  // Cap at a reasonable limit (slightly above maxPages to allow windows)
  const windowMax = Math.min(Math.ceil(maxPages * 1.6), maxPages + 5);
  return [...windowPages]
    .sort((a, b) => a - b)
    .slice(0, windowMax);
}
