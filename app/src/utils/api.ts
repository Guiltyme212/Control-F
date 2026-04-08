import { PDFDocument } from 'pdf-lib';
import { extractPdfPreviewText, earlyRejectCheck, scorePages, selectTopPages } from './pdfFilter';
import { getFocusKeywords, getRequestedMetricTypes } from './searchFocus';
import { sourceRegistry } from '../data/sourceRegistry';
import type {
  Metric,
  ExtractedData,
  PdfLink,
  SearchIntent,
  SourceRegistryEntry,
  SourceSearchCandidate,
} from '../data/types';

const MAX_PDF_PAGES = 50; // Stay under Claude's 200K token input limit (dense PDFs ≈ 2K tokens/page)
const SMART_FILTER_THRESHOLD = 60; // Use smart filtering for PDFs above this page count
const FOCUSED_FILTER_THRESHOLD = 15; // Use smart filtering for focused queries above this page count
const FOCUSED_FILTER_MAX_PAGES = 15; // Max pages for focused medium-sized PDFs
const SPECIFIC_METRIC_FILTER_THRESHOLD = 5; // Tighten filtering earlier for IRR/TVPI/DPI/NAV queries
const SPECIFIC_METRIC_FILTER_MAX_PAGES = 5; // Keep focused performance extractions small — summary pages only
const SMART_FILTER_MAX_PAGES = 30; // Max pages to send after smart filtering
const FIRECRAWL_SEARCH_LIMIT = 3;
const SOURCE_SEARCH_FANOUT = 6;
const FIRECRAWL_TIMEOUT_MS = 25000;
const SCRAPE_TIMEOUT_MS = 30000;
const PDF_PROXY_TIMEOUT_MS = 45000;
const CLAUDE_TIMEOUT_MS = 300000;
const CLAUDE_MAX_RETRIES = 2;
const CLAUDE_RETRY_DELAYS = [5000, 10000]; // 5s, 10s backoff

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
  log?: (message: string, status?: 'info' | 'done' | 'error') => void,
): Promise<Response> {
  for (let attempt = 0; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(input, init, timeoutMs, timeoutMessage);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = /failed to fetch|fetch failed|network|econnreset|socket/i.test(msg);
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit');
      if ((isTransient || isRateLimit) && attempt < CLAUDE_MAX_RETRIES) {
        const delay = CLAUDE_RETRY_DELAYS[attempt] ?? 10000;
        log?.(`Network error (${msg}), retrying in ${delay / 1000}s (attempt ${attempt + 2}/${CLAUDE_MAX_RETRIES + 1})...`, 'info');
        await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(timeoutMessage); // unreachable but satisfies TS
}

export type ScrapedPdfLink = PdfLink;

const SYSTEM_PROMPT_BROAD = `You are a financial data extraction agent specialized in US public pension fund documents.

You will receive a PDF document from a public pension fund (board meeting minutes, transaction reports, investment memos, performance reports, IPC reports).

Extract ALL financial metrics into structured JSON. Be thorough — extract every single data point.

If the user instruction includes a search focus, prioritize the rows that directly answer that search and avoid flooding the response with broad unrelated tables.

Return ONLY valid JSON (no markdown fences, no explanation, no preamble) with this structure:

{
  "document_metadata": {
    "source_organization": "string",
    "document_type": "string",
    "document_date": "YYYY-MM-DD",
    "reporting_period": "string"
  },
  "extracted_metrics": [
    {
      "date": "YYYY-MM-DD",
      "lp_name": "string",
      "fund_name": "string",
      "gp_manager": "string",
      "metric_type": "Commitment | Termination | NAV | IRR | TVPI | DPI | AUM | Management Fee | Carry | Target Fund Size | Target Return | Asset Allocation | Co-Investment | Distribution | Capital Call",
      "value": "string — preserve original format",
      "currency": "USD | EUR | GBP",
      "asset_class": "string",
      "strategy": "string",
      "page_reference": "number or null",
      "evidence_text": "key phrase from document, max 80 chars",
      "confidence": "high | medium | low"
    }
  ],
  "cross_reference_signals": [
    {
      "signal_type": "string",
      "description": "string"
    }
  ]
}

Rules:
1. Extract EVERY commitment, termination, allocation, performance metric, fee structure
2. Fee structures: separate entries for mgmt fee AND carry
3. Performance: ALWAYS create separate entries for IRR, TVPI, AND DPI for each fund/asset class. Never skip one because you already extracted the others for that fund.
4. Always include evidence_text
5. "No activity" sections: note with value "No activity"
6. Proposed investments: use Commitment but note "proposed" in evidence
7. Co-investments: separate entries from main fund commitments
8. Capture target fund size and target returns
9. When a search focus is provided, extract ALL rows for each requested metric type (e.g. if the user asks for IRR, TVPI, DPI, and NAV — extract every row for all four). Only skip unrelated tables that do not contain ANY of the requested metrics.`;

function buildFocusedSystemPrompt(metricTypes: string[]): string {
  const typeList = metricTypes.join(', ');
  return `You are a financial data extraction agent specialized in US public pension fund documents.

You will receive a PDF document from a public pension fund. Your task is NARROWLY SCOPED: extract ONLY ${typeList} metrics.

Return ONLY valid JSON (no markdown fences, no explanation, no preamble) with this structure:

{
  "document_metadata": {
    "source_organization": "string",
    "document_type": "string",
    "document_date": "YYYY-MM-DD",
    "reporting_period": "string"
  },
  "extracted_metrics": [
    {
      "date": "YYYY-MM-DD",
      "lp_name": "string",
      "fund_name": "string",
      "gp_manager": "string",
      "metric_type": "${typeList}",
      "value": "string — preserve original format",
      "currency": "USD | EUR | GBP",
      "asset_class": "string",
      "strategy": "string",
      "page_reference": "number or null",
      "evidence_text": "key phrase from document, max 80 chars",
      "confidence": "high | medium | low"
    }
  ],
  "cross_reference_signals": [
    {
      "signal_type": "string",
      "description": "string"
    }
  ]
}

Rules:
1. ONLY extract metrics of type ${typeList}. Do NOT extract commitments, fees, allocations, or any other metric types.
2. Extract one row per asset class or sub-strategy (e.g. Private Equity, Real Estate, Credit, Infrastructure, Total Private Markets). Do NOT extract individual GP/manager-level rows.
3. For each asset class, create separate entries for each requested metric type. Never skip one because you already extracted the others.
4. For performance metrics (IRR, TVPI, DPI), extract ONLY the inception-to-date (ITD) or since-inception value. Do NOT create separate rows for different time horizons (1-year, 3-year, 5-year, 10-year, etc.).
5. Always include evidence_text.
6. Keep the response concise — only the requested metrics, nothing else.`;
}

function getSystemPrompt(focusQuery?: string): string {
  if (!focusQuery) return SYSTEM_PROMPT_BROAD;
  const normalized = normalizeForSearch(focusQuery);
  const metricTypes: string[] = [];
  if (normalized.includes('irr')) metricTypes.push('IRR');
  if (normalized.includes('tvpi')) metricTypes.push('TVPI');
  if (normalized.includes('dpi')) metricTypes.push('DPI');
  if (normalized.includes('nav')) metricTypes.push('NAV');
  if (normalized.includes('aum')) metricTypes.push('AUM');
  if (metricTypes.length > 0) return buildFocusedSystemPrompt(metricTypes);
  return SYSTEM_PROMPT_BROAD;
}



const INTENT_KEYWORDS: Record<SearchIntent, string[]> = {
  commitment: [
    'commitment',
    'commitments',
    'investment',
    'investments',
    'infrastructure',
    'real assets',
    'private equity',
    'private markets',
    'approval',
    'approvals',
  ],
  performance: [
    'performance',
    'irr',
    'tvpi',
    'dpi',
    'nav',
    'aum',
    'return',
    'returns',
    'asset allocation',
  ],
  board: [
    'board',
    'agenda',
    'minutes',
    'meeting',
    'meetings',
    'board materials',
    'committee',
  ],
  financial: [
    'financial',
    'acfr',
    'annual report',
    'financial report',
    'financial overview',
    'total fund',
    'asset listing',
  ],
  general: [],
};

interface FirecrawlSearchItem {
  title?: string;
  description?: string;
  url: string;
}

interface StreamedClaudeResponse {
  text: string;
  model: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

async function callClaudeStreaming(
  apiKey: string,
  systemPrompt: string,
  userContent: Array<Record<string, unknown>>,
  maxTokens: number,
  log?: (message: string, status?: 'info' | 'done' | 'error') => void,
): Promise<StreamedClaudeResponse> {
  const response = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    CLAUDE_TIMEOUT_MS,
    'Claude extraction timed out before returning a result.',
    log,
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Anthropic API key in settings.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    if (errorBody.includes('100 PDF pages')) {
      throw new Error('PDF too large (over 100 pages).');
    }
    throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body from streaming API');

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let model = '';
  let stopReason = '';
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]' || !jsonStr) continue;

      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'message_start' && event.message) {
          model = event.message.model || '';
          if (event.message.usage) {
            inputTokens = event.message.usage.input_tokens || 0;
          }
        } else if (event.type === 'content_block_delta' && event.delta?.text) {
          text += event.delta.text;
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason || stopReason;
          if (event.usage) {
            outputTokens = event.usage.output_tokens || 0;
          }
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return { text, model, stopReason, inputTokens, outputTokens };
}

interface ExtractionOptions {
  focusQuery?: string;
  extractionMode?: 'broad' | 'focused';
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function getFirecrawlApiKey(): string {
  const apiKey = import.meta.env.VITE_FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Firecrawl API key. Add VITE_FIRECRAWL_API_KEY to app/.env.local.');
  }
  return apiKey;
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase();
}

function getHostname(rawUrl: string): string {
  return new URL(rawUrl).hostname.replace(/^www\./, '');
}

function collectMatchedKeywords(text: string, keywords: string[]): string[] {
  const normalized = normalizeForSearch(text);
  return keywords.filter((keyword) => normalized.includes(keyword)).slice(0, 6);
}

function buildFocusInstruction(focusQuery?: string): string {
  if (!focusQuery) return '';

  const normalizedQuery = normalizeForSearch(focusQuery);
  const focusMetricHints: string[] = [];

  if (normalizedQuery.includes('irr')) focusMetricHints.push('IRR');
  if (normalizedQuery.includes('tvpi')) focusMetricHints.push('TVPI');
  if (normalizedQuery.includes('dpi')) focusMetricHints.push('DPI');
  if (normalizedQuery.includes('nav')) focusMetricHints.push('NAV');
  if (normalizedQuery.includes('aum')) focusMetricHints.push('AUM');

  const metricHintText = focusMetricHints.length
    ? ` ONLY extract these metric types: ${focusMetricHints.join(', ')}. Extract one row per asset class or sub-strategy (e.g. Private Equity, Real Estate, Credit, Infrastructure, Total). Do NOT extract individual GP/manager-level rows — only summary-level data.`
    : '';

  return ` User search focus: "${focusQuery}".${metricHintText} Only extract rows that directly answer this search. Skip individual fund/manager details — focus on asset-class and total-portfolio summaries. IMPORTANT: Your response must be ONLY the JSON object, starting with { — no thinking, no explanation, no preamble.`;
}

function textIncludesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(normalizeForSearch(phrase)));
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url);
}

function scoreDocumentTypeFit(
  documentType: SourceRegistryEntry['documentType'],
  intents: SearchIntent[],
): number {
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

function getDocumentFamilyPreferences(
  intents: SearchIntent[],
  requestedMetricTypes: string[],
): { preferred: Set<string>; penalized: Set<string> } {
  const preferred = new Set<string>();
  const penalized = new Set<string>();
  const hasPerformanceMultiples = requestedMetricTypes.some((m) =>
    ['IRR', 'TVPI', 'DPI'].includes(m),
  );
  const hasNavOnly = requestedMetricTypes.includes('NAV') && !hasPerformanceMultiples;
  const hasCommitmentOnly = intents.includes('commitment') && !intents.includes('performance');

  if (hasPerformanceMultiples) {
    preferred.add('performance');
    preferred.add('investment');
    penalized.add('meeting');
    penalized.add('minutes');
  } else if (hasNavOnly) {
    preferred.add('performance');
    preferred.add('financial');
    preferred.add('investment');
    penalized.add('minutes');
  } else if (hasCommitmentOnly) {
    preferred.add('meeting');
    preferred.add('minutes');
    preferred.add('investment');
    penalized.add('financial');
  }

  return { preferred, penalized };
}

function scoreIntentSignals(text: string, intents: SearchIntent[]): number {
  let score = 0;

  if (intents.includes('commitment')) {
    if (textIncludesAny(text, ['commitment', 'commitments', 'new investment', 'approvals', 'infrastructure', 'real assets'])) {
      score += 8;
    }
    if (textIncludesAny(text, ['meeting', 'agenda', 'minutes', 'board materials'])) {
      score += 5;
    }
    if (textIncludesAny(text, ['annual report', 'financial report', 'acfr'])) {
      score -= 8;
    }
  }

  if (intents.includes('performance')) {
    if (textIncludesAny(text, ['performance', 'quarterly', 'private markets', 'asset allocation', 'irr', 'tvpi', 'dpi', 'nav'])) {
      score += 8;
    }
    if (textIncludesAny(text, ['meeting', 'agenda', 'minutes'])) {
      score -= 5;
    }
  }

  if (intents.includes('board')) {
    if (textIncludesAny(text, ['board', 'agenda', 'minutes', 'meeting', 'committee'])) {
      score += 8;
    }
    if (textIncludesAny(text, ['annual report', 'performance report'])) {
      score -= 5;
    }
  }

  if (intents.includes('financial')) {
    if (textIncludesAny(text, ['acfr', 'annual report', 'financial report', 'financial overview', 'total fund'])) {
      score += 8;
    }
    if (textIncludesAny(text, ['meeting', 'agenda', 'minutes'])) {
      score -= 5;
    }
  }

  return score;
}

function scoreRequestedMetricTypeFit(text: string, requestedMetricTypes: string[]): number {
  let score = 0;

  for (const metricType of requestedMetricTypes) {
    if (textIncludesAny(text, [metricType])) {
      score += ['IRR', 'TVPI', 'DPI', 'NAV'].includes(metricType) ? 6 : 3;
    }
  }

  return score;
}

function scoreSourceRiskPatterns(text: string, intents: SearchIntent[], requestedMetricTypes: string[]): number {
  let score = 0;
  const wantsSpecificPerformanceMetrics = requestedMetricTypes.some((metricType) =>
    ['IRR', 'TVPI', 'DPI'].includes(metricType),
  );

  if (intents.includes('performance')) {
    if (textIncludesAny(text, ['private markets', 'combined portfolio', 'performance review', 'performance report', 'quarterly performance', 'portfolio report'])) {
      score += wantsSpecificPerformanceMetrics ? 12 : 6;
    }

    if (
      wantsSpecificPerformanceMetrics
      && textIncludesAny(text, ['financial report', 'financial reports', 'financial statement', 'financial statements', 'annual report', 'acfr', 'net position'])
    ) {
      score -= 18;
    }

    if (
      wantsSpecificPerformanceMetrics
      && textIncludesAny(text, ['asset allocation'])
      && !textIncludesAny(text, ['private markets', 'combined portfolio', 'performance review', 'performance report', 'irr', 'tvpi', 'dpi'])
    ) {
      score -= 14;
    }

    if (wantsSpecificPerformanceMetrics && textIncludesAny(text, ['board meeting', 'agenda', 'minutes', 'committee'])) {
      score -= 12;
    }
  }

  if (intents.includes('commitment') && textIncludesAny(text, ['performance report', 'asset allocation', 'financial report'])) {
    score -= 6;
  }

  return score;
}

function scoreRegistryEntry(entry: SourceRegistryEntry, query: string, intents: SearchIntent[]): number {
  const normalizedQuery = normalizeForSearch(query);
  const requestedMetricTypes = getRequestedMetricTypes(query);
  let score = 0;

  for (const intent of intents) {
    if (entry.intents.includes(intent)) {
      score += 5;
    }
    score += entry.keywords.filter((keyword) =>
      INTENT_KEYWORDS[intent].some((intentKeyword) => normalizeForSearch(keyword).includes(normalizeForSearch(intentKeyword))),
    ).length;
  }

  score += entry.keywords.filter((keyword) => normalizedQuery.includes(normalizeForSearch(keyword))).length * 2;
  score += scoreDocumentTypeFit(entry.documentType, intents);
  score += scoreRequestedMetricTypeFit(
    normalizeForSearch(`${entry.label} ${entry.keywords.join(' ')} ${entry.notes || ''}`),
    requestedMetricTypes,
  );
  score += scoreSourceRiskPatterns(
    normalizeForSearch(`${entry.label} ${entry.url} ${entry.keywords.join(' ')} ${entry.notes || ''}`),
    intents,
    requestedMetricTypes,
  );

  return score;
}

function buildSearchQuery(query: string, entry: SourceRegistryEntry, intents: SearchIntent[]): string {
  const host = getHostname(entry.url);
  const intentTerms = intents.flatMap((intent) => INTENT_KEYWORDS[intent]).slice(0, 4).join(' ');
  return `${query} ${entry.pensionFund} ${entry.label} ${intentTerms} site:${host}`;
}

async function firecrawlSearch(query: string, entry: SourceRegistryEntry, intents: SearchIntent[]): Promise<FirecrawlSearchItem[]> {
  const response = await fetchWithTimeout(
    'https://api.firecrawl.dev/v1/search',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getFirecrawlApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: buildSearchQuery(query, entry, intents),
        limit: FIRECRAWL_SEARCH_LIMIT,
        timeout: FIRECRAWL_TIMEOUT_MS,
      }),
    },
    FIRECRAWL_TIMEOUT_MS,
    'Source search timed out while querying Firecrawl.',
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Source search failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Firecrawl source search failed');
  }

  return (data.data || []) as FirecrawlSearchItem[];
}

function toFallbackCandidate(entry: SourceRegistryEntry, score: number): SourceSearchCandidate {
  return {
    id: `fallback-${entry.id}`,
    registryId: entry.id,
    pensionFund: entry.pensionFund,
    label: entry.label,
    url: entry.url,
    description: entry.notes || `Approved ${entry.pensionFund} source`,
    score,
    matchedKeywords: entry.keywords.slice(0, 4),
    documentType: entry.documentType,
  };
}

function scoreSearchCandidate(
  entry: SourceRegistryEntry,
  item: FirecrawlSearchItem,
  query: string,
  intents: SearchIntent[],
  baseScore: number,
): SourceSearchCandidate {
  const requestedMetricTypes = getRequestedMetricTypes(query);
  const title = item.title || entry.label;
  const description = item.description || entry.notes || `${entry.pensionFund} source match`;
  const normalizedBundle = normalizeForSearch(`${title} ${description} ${item.url} ${query}`);
  const matchedKeywords = collectMatchedKeywords(
    `${title} ${description} ${item.url} ${query} ${entry.keywords.join(' ')}`,
    [...entry.keywords, ...intents.flatMap((intent) => INTENT_KEYWORDS[intent])],
  );
  const directPdfMatch = isPdfUrl(item.url);

  let score = baseScore;
  if (item.url.startsWith(entry.url)) score += 10;
  if (getHostname(item.url) === getHostname(entry.url)) score += 4;
  if (normalizedBundle.includes(normalizeForSearch(entry.label))) score += 4;
  if (normalizedBundle.includes(normalizeForSearch(entry.pensionFund))) score += 2;
  if (directPdfMatch) score -= 6;
  score += matchedKeywords.length * 2;
  score += scoreIntentSignals(normalizedBundle, intents);
  score += scoreRequestedMetricTypeFit(normalizedBundle, requestedMetricTypes);
  score += scoreSourceRiskPatterns(normalizedBundle, intents, requestedMetricTypes);

  return {
    id: `${entry.id}-${item.url}`,
    registryId: entry.id,
    pensionFund: entry.pensionFund,
    label: entry.label,
    url: entry.url,
    description: directPdfMatch ? `${description} Matched through ${title}.` : description,
    score,
    matchedKeywords,
    documentType: entry.documentType,
  };
}

export function detectSearchIntents(query: string): SearchIntent[] {
  const normalizedQuery = normalizeForSearch(query);
  const requestedMetricTypes = getRequestedMetricTypes(query);
  const hasPerformanceMetricFocus = requestedMetricTypes.some((metricType) =>
    ['IRR', 'TVPI', 'DPI', 'NAV', 'AUM', 'Asset Allocation', 'Target Return'].includes(metricType),
  );
  const intents: SearchIntent[] = [];

  if (
    hasPerformanceMetricFocus ||
    INTENT_KEYWORDS.performance.some((keyword) => normalizedQuery.includes(keyword))
  ) {
    intents.push('performance');
  }

  if (
    ['commitment', 'commitments', 'investment', 'investments', 'approval', 'approvals', 'co-investment', 'capital call', 'termination', 'terminated']
      .some((keyword) => normalizedQuery.includes(keyword))
  ) {
    intents.push('commitment');
  }

  if (INTENT_KEYWORDS.board.some((keyword) => normalizedQuery.includes(keyword))) {
    intents.push('board');
  }

  if (INTENT_KEYWORDS.financial.some((keyword) => normalizedQuery.includes(keyword))) {
    intents.push('financial');
  }

  return intents.length > 0 ? intents : ['general'];
}

/* ------------------------------------------------------------------ */
/*  Open web search fallback for unknown pension funds                  */
/* ------------------------------------------------------------------ */

async function discoverViaWebSearch(
  query: string,
  fundName: string,
  intents: SearchIntent[],
): Promise<SourceSearchCandidate[]> {
  const intentTerms = intents.flatMap((intent) => INTENT_KEYWORDS[intent]).slice(0, 4).join(' ');
  // Use the original query for context, prefer .gov and .org domains
  const searchQuery = `${query} ${fundName} ${intentTerms} site:.gov OR site:.org`;

  serverLog('WEB_SEARCH_FALLBACK', { fundName, searchQuery });

  const response = await fetchWithTimeout(
    'https://api.firecrawl.dev/v1/search',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getFirecrawlApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
        timeout: FIRECRAWL_TIMEOUT_MS,
      }),
    },
    FIRECRAWL_TIMEOUT_MS,
    'Web search timed out.',
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Web search failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  if (!data.success || !data.data?.length) return [];

  const results: SourceSearchCandidate[] = (data.data as FirecrawlSearchItem[]).map((item, idx) => {
    const title = item.title || item.url;
    const desc = item.description || '';
    const combined = normalizeForSearch(`${title} ${desc} ${item.url}`);
    let score = 50 - idx * 5; // base score by rank

    // Boost .gov and .org
    if (/\.gov\b/.test(item.url)) score += 20;
    if (/\.org\b/.test(item.url)) score += 10;

    // Boost pages mentioning investment-relevant terms
    if (textIncludesAny(combined, ['investment', 'portfolio', 'performance', 'private markets', 'private equity'])) score += 15;
    if (textIncludesAny(combined, ['board', 'meeting', 'committee', 'agenda'])) score += 10;
    if (textIncludesAny(combined, ['commitment', 'commitments', 'approved'])) score += 10;
    if (textIncludesAny(combined, ['annual report', 'quarterly', 'disclosure'])) score += 8;

    // Penalize clearly wrong pages
    if (textIncludesAny(combined, ['careers', 'job posting', 'faq', 'contact us', 'login'])) score -= 30;

    return {
      id: `web-${idx}`,
      registryId: `web-${idx}`,
      pensionFund: fundName,
      label: title,
      url: item.url,
      description: desc,
      score,
      matchedKeywords: [],
      documentType: 'general' as const,
    };
  });

  return results
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

export async function discoverSourceCandidates(
  query: string,
  pensionFunds: string[] = [],
): Promise<SourceSearchCandidate[]> {
  const intents = detectSearchIntents(query);
  const requestedMetrics = getRequestedMetricTypes(query);
  const familyPrefs = getDocumentFamilyPreferences(intents, requestedMetrics);
  const pensionFundFilter = new Set(pensionFunds.map((fund) => normalizeForSearch(fund)));
  const eligibleEntries = sourceRegistry
    .filter((entry) => pensionFundFilter.size === 0 || pensionFundFilter.has(normalizeForSearch(entry.pensionFund)))
    .map((entry) => ({ entry, baseScore: scoreRegistryEntry(entry, query, intents) }))
    .sort((a, b) => b.baseScore - a.baseScore)
    .slice(0, SOURCE_SEARCH_FANOUT);

  // If no registry entries match, fall back to open web search
  if (eligibleEntries.length === 0 && pensionFunds.length > 0) {
    serverLog('REGISTRY_MISS', { pensionFunds, fallback: 'web_search' });
    const webResults = await Promise.all(
      pensionFunds.map((fund) => discoverViaWebSearch(query, fund, intents).catch(() => [] as SourceSearchCandidate[])),
    );
    const allResults = webResults.flat();
    if (allResults.length > 0) {
      return allResults.slice(0, 6);
    }
    // If web search also fails, try without fund filter
    const broadResults = await discoverViaWebSearch(query, pensionFunds[0], intents).catch(() => []);
    return broadResults.slice(0, 3);
  }

  // Hard-route: if top entry is penalized but a preferred entry exists, promote it
  if (familyPrefs.preferred.size > 0 && eligibleEntries.length > 1) {
    const topEntry = eligibleEntries[0];
    if (familyPrefs.penalized.has(topEntry.entry.documentType)) {
      const preferredIndex = eligibleEntries.findIndex(
        (e) => familyPrefs.preferred.has(e.entry.documentType) && e.baseScore > topEntry.baseScore * 0.4,
      );
      if (preferredIndex > 0) {
        const [promoted] = eligibleEntries.splice(preferredIndex, 1);
        eligibleEntries.unshift(promoted);
      }
    }
  }

  const searchedCandidates = await Promise.all(
    eligibleEntries.map(async ({ entry, baseScore }) => {
      try {
        const results = await firecrawlSearch(query, entry, intents);
        if (results.length === 0) {
          return [toFallbackCandidate(entry, baseScore)];
        }
        return results.map((item) => scoreSearchCandidate(entry, item, query, intents, baseScore));
      } catch {
        return [toFallbackCandidate(entry, baseScore)];
      }
    }),
  );

  const deduped = new Map<string, SourceSearchCandidate>();
  for (const candidate of searchedCandidates.flat()) {
    const existing = deduped.get(candidate.url);
    if (!existing || candidate.score > existing.score) {
      deduped.set(candidate.url, candidate);
    }
  }

  const ranked = [...deduped.values()].sort((a, b) => b.score - a.score);
  if (ranked.length > 0) {
    return ranked.slice(0, 6);
  }

  return sourceRegistry
    .filter((entry) => pensionFundFilter.size === 0 || pensionFundFilter.has(normalizeForSearch(entry.pensionFund)))
    .map((entry) => toFallbackCandidate(entry, scoreRegistryEntry(entry, query, intents)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  PDF helpers                                                        */
/* ------------------------------------------------------------------ */

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface PdfChunk {
  base64: string;
  pageOffset: number;
  totalPages: number;
}

async function splitPdfIfNeeded(pdfBytes: Uint8Array): Promise<PdfChunk[] | null> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const totalPages = pdfDoc.getPageCount();

    if (totalPages <= MAX_PDF_PAGES) {
      return [{ base64: uint8ToBase64(pdfBytes), pageOffset: 0, totalPages }];
    }

    const chunks: PdfChunk[] = [];
    for (let start = 0; start < totalPages; start += MAX_PDF_PAGES) {
      const end = Math.min(start + MAX_PDF_PAGES, totalPages);
      const chunkDoc = await PDFDocument.create();
      const indices = Array.from({ length: end - start }, (_, i) => start + i);
      const copiedPages = await chunkDoc.copyPages(pdfDoc, indices);
      for (const page of copiedPages) chunkDoc.addPage(page);
      const chunkBytes = await chunkDoc.save();
      chunks.push({
        base64: uint8ToBase64(new Uint8Array(chunkBytes)),
        pageOffset: start,
        totalPages,
      });
    }

    return chunks;
  } catch {
    // pdf-lib can't handle this PDF (corrupt structure, unsupported features, etc.)
    return null;
  }
}

async function getPdfInfo(pdfUrl: string): Promise<{ totalPages: number; chunkCount: number }> {
  const response = await fetchWithTimeout(
    `/proxy-pdf-info?url=${encodeURIComponent(pdfUrl)}`,
    {},
    PDF_PROXY_TIMEOUT_MS,
    'PDF analysis timed out while downloading or counting pages. Try a smaller file or a different source page.',
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PDF processing failed: ${body || response.statusText}`);
  }
  return response.json();
}

async function fetchPdfChunk(pdfUrl: string, chunkIdx: number): Promise<string> {
  const response = await fetchWithTimeout(
    `/proxy-pdf-chunk?url=${encodeURIComponent(pdfUrl)}&chunk=${chunkIdx}`,
    {},
    PDF_PROXY_TIMEOUT_MS,
    `Timed out while preparing PDF chunk ${chunkIdx + 1}.`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch chunk ${chunkIdx} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return uint8ToBase64(new Uint8Array(buffer));
}

/* ------------------------------------------------------------------ */
/*  JSON recovery for truncated responses                              */
/* ------------------------------------------------------------------ */

function parseOrSalvageJson(raw: string): ExtractedData {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Try parsing as-is first
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Response was likely truncated — try to salvage by closing the JSON
  }

  // Find the last complete object in extracted_metrics array
  const metricsStart = jsonStr.indexOf('"extracted_metrics"');
  if (metricsStart === -1) {
    throw new Error(`No metrics in response. Preview: ${jsonStr.slice(0, 300)}`);
  }

  // Find the last complete object boundary (closing brace followed by comma or array end)
  const lastCompleteObj = jsonStr.lastIndexOf('},');
  if (lastCompleteObj === -1) {
    throw new Error(`No complete metrics found. Preview: ${jsonStr.slice(0, 300)}`);
  }

  // Truncate after the last complete object and close the structure
  const salvaged = jsonStr.slice(0, lastCompleteObj + 1) + '], "cross_reference_signals": [] }';

  try {
    return JSON.parse(salvaged);
  } catch {
    throw new Error(`Could not salvage truncated response. Preview: ${jsonStr.slice(0, 300)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Core extraction: sends a base64 PDF chunk to Claude                */
/* ------------------------------------------------------------------ */

async function extractChunk(
  base64: string,
  apiKey: string,
  sourceName: string,
  pageOffset: number,
  totalPages: number,
  options: ExtractionOptions = {},
  log?: (message: string, status?: 'info' | 'done' | 'error') => void,
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const pdfSizeKB = Math.round((base64.length * 3) / 4 / 1024);
  const isChunked = totalPages > MAX_PDF_PAGES;
  const systemPrompt = getSystemPrompt(options.focusQuery);
  const isFocused = systemPrompt !== SYSTEM_PROMPT_BROAD;
  const maxTokens = isFocused ? 16000 : 32000;
  const userText = isChunked
    ? `Extract all financial metrics from this document. This is pages ${pageOffset + 1}–${Math.min(pageOffset + MAX_PDF_PAGES, totalPages)} of a ${totalPages}-page document. Report page_reference relative to the original document (add ${pageOffset} to any page number you see).`
    : 'Extract all financial metrics from this document.';
  const focusedUserText = `${userText}${buildFocusInstruction(options.focusQuery)}`;

  serverLog('API_REQUEST', {
    function: 'extractChunk',
    source: sourceName,
    pdfSizeKB,
    totalPages,
    pageOffset,
    model: 'claude-sonnet-4-6',
    maxTokens,
  });

  const userContent = [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    { type: 'text', text: focusedUserText },
  ];

  const streamed = await callClaudeStreaming(apiKey, systemPrompt, userContent, maxTokens, log);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const { inputTokens, outputTokens } = streamed;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  serverLog('API_RESPONSE', {
    function: 'extractChunk',
    source: sourceName,
    model: streamed.model || 'unknown',
    stopReason: streamed.stopReason || 'unknown',
    inputTokens,
    outputTokens,
    costUsd: `$${costUsd.toFixed(4)}`,
    elapsed: `${elapsed}s`,
    responseChars: streamed.text.length,
  });

  if (!streamed.text) {
    throw new Error('No text content in API response');
  }

  const parsed = parseOrSalvageJson(streamed.text);

  if (!parsed.extracted_metrics?.length) {
    serverLog('EXTRACTION_EMPTY', {
      source: sourceName,
      rawResponsePreview: streamed.text.slice(0, 500),
    });
  }

  const metrics: Metric[] = (parsed.extracted_metrics || []).map((am) => ({
    date: am.date || '',
    lp: am.lp_name || '',
    fund: am.fund_name || '',
    gp: am.gp_manager || '',
    metric: am.metric_type || '',
    value: am.value || '',
    asset_class: am.asset_class || '',
    source: sourceName,
    page: am.page_reference ?? 0,
    evidence: am.evidence_text || '',
    confidence: am.confidence || 'medium',
  }));

  const wasTruncated = streamed.stopReason === 'max_tokens';

  serverLog('EXTRACTION_RESULT', {
    source: sourceName,
    metricsFound: metrics.length,
    truncated: wasTruncated,
    costUsd: `$${costUsd.toFixed(4)}`,
  });

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {
      source_organization: '',
      document_type: '',
      document_date: '',
      reporting_period: '',
    },
    truncated: wasTruncated,
    costUsd,
    inputTokens,
    outputTokens,
    elapsedSec: parseFloat(elapsed),
  };
}

async function extractChunkWithPageMap(
  base64: string,
  apiKey: string,
  sourceName: string,
  originalPageNumbers: number[],
  totalPages: number,
  options: ExtractionOptions = {},
  log?: (message: string, status?: 'info' | 'done' | 'error') => void,
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const pdfSizeKB = Math.round((base64.length * 3) / 4 / 1024);
  const pageMapStr = originalPageNumbers
    .map((orig, i) => `page ${i + 1} in this PDF = page ${orig} in the original`)
    .join(', ');

  const systemPrompt = getSystemPrompt(options.focusQuery);
  const isFocused = systemPrompt !== SYSTEM_PROMPT_BROAD;
  const maxTokens = isFocused ? 16000 : 32000;
  const userText = `Extract all financial metrics from this document. This is a filtered subset (${originalPageNumbers.length} pages) of a ${totalPages}-page document. Page mapping: ${pageMapStr}. Report page_reference using the ORIGINAL document page numbers.`;
  const focusedUserText = `${userText}${buildFocusInstruction(options.focusQuery)}`;

  serverLog('API_REQUEST', {
    function: 'extractChunkWithPageMap',
    source: sourceName,
    pdfSizeKB,
    subsetPages: originalPageNumbers.length,
    totalPages,
    model: 'claude-sonnet-4-6',
    maxTokens,
  });

  const userContent = [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    { type: 'text', text: focusedUserText },
  ];

  const streamed = await callClaudeStreaming(apiKey, systemPrompt, userContent, maxTokens, log);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const { inputTokens, outputTokens } = streamed;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  serverLog('API_RESPONSE', {
    function: 'extractChunkWithPageMap',
    source: sourceName,
    model: streamed.model || 'unknown',
    stopReason: streamed.stopReason || 'unknown',
    inputTokens,
    outputTokens,
    costUsd: `$${costUsd.toFixed(4)}`,
    elapsed: `${elapsed}s`,
    responseChars: streamed.text.length,
  });

  if (!streamed.text) throw new Error('No text content in API response');

  const parsed = parseOrSalvageJson(streamed.text);

  if (!parsed.extracted_metrics?.length) {
    serverLog('EXTRACTION_EMPTY', {
      source: sourceName,
      rawResponsePreview: streamed.text.slice(0, 800),
    });
  }

  const metrics: Metric[] = (parsed.extracted_metrics || []).map((am) => ({
    date: am.date || '',
    lp: am.lp_name || '',
    fund: am.fund_name || '',
    gp: am.gp_manager || '',
    metric: am.metric_type || '',
    value: am.value || '',
    asset_class: am.asset_class || '',
    source: sourceName,
    page: am.page_reference ?? 0,
    evidence: am.evidence_text || '',
    confidence: am.confidence || 'medium',
  }));

  const wasTruncated = streamed.stopReason === 'max_tokens';

  serverLog('EXTRACTION_RESULT', {
    source: sourceName,
    metricsFound: metrics.length,
    truncated: wasTruncated,
    costUsd: `$${costUsd.toFixed(4)}`,
  });

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {
      source_organization: '', document_type: '', document_date: '', reporting_period: '',
    },
    truncated: wasTruncated,
    costUsd,
    inputTokens,
    outputTokens,
    elapsedSec: parseFloat(elapsed),
  };
}

/* ------------------------------------------------------------------ */
/*  Merge results from multiple chunks                                 */
/* ------------------------------------------------------------------ */

function mergeResults(results: ExtractionResult[]): ExtractionResult {
  const reviewedPageNumbers = results.flatMap((r) => r.reviewedPageNumbers ?? []);
  return {
    metrics: results.flatMap((r) => r.metrics),
    signals: results.flatMap((r) => r.signals),
    metadata: results[0]?.metadata || {
      source_organization: '',
      document_type: '',
      document_date: '',
      reporting_period: '',
    },
    truncated: results.some((r) => r.truncated),
    costUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
    inputTokens: results.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
    outputTokens: results.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
    elapsedSec: results.reduce((sum, r) => sum + (r.elapsedSec ?? 0), 0),
    reviewedPageNumbers: reviewedPageNumbers.length > 0 ? reviewedPageNumbers : undefined,
    totalPages: results[0]?.totalPages,
    pageSubsetStrategy: results[0]?.pageSubsetStrategy,
    wasEarlyRejected: results.some((r) => r.wasEarlyRejected),
    skipReason: results.find((r) => r.skipReason)?.skipReason,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ExtractionResult {
  metrics: Metric[];
  signals: { signal_type: string; description: string }[];
  metadata: ExtractedData['document_metadata'];
  truncated?: boolean;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  elapsedSec?: number;
  reviewedPageNumbers?: number[];
  totalPages?: number;
  pageSubsetStrategy?: 'preview-only' | 'full-document' | 'first-chunk-fallback' | 'filtered-subset';
  wasEarlyRejected?: boolean;
  skipReason?: string;
}

/* ------------------------------------------------------------------ */
/*  LLM PDF selector: cheap Claude call to pick the right file         */
/* ------------------------------------------------------------------ */

export interface PdfCandidate {
  url: string;
  filename: string;
  sourceLabel: string;
  previewScore?: number;
  previewMatchedMetrics?: string[];
  previewNegativeSignals?: string[];
}

export async function selectBestPdfWithLLM(
  candidates: PdfCandidate[],
  query: string,
  apiKey: string,
): Promise<PdfCandidate[]> {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates;

  const numberedList = candidates
    .map((c, i) => {
      let line = `${i + 1}. ${c.filename} (from: ${c.sourceLabel})`;
      if (c.previewScore != null) {
        line += ` — Preview score: ${c.previewScore}`;
        if (c.previewMatchedMetrics?.length) {
          line += `, matched: ${c.previewMatchedMetrics.join(', ')}`;
        }
        if (c.previewNegativeSignals?.length) {
          line += `, warnings: ${c.previewNegativeSignals.join(', ')}`;
        }
      }
      return line;
    })
    .join('\n');

  const requestedMetrics = getRequestedMetricTypes(query);
  const metricHint = requestedMetrics.length > 0
    ? `Specifically these metrics: ${requestedMetrics.join(', ')}.`
    : '';

  const prompt = `You are helping a pension fund analyst find specific financial metrics in PDF documents.

The analyst is looking for: ${query}
${metricHint}

Here are PDF files found on pension fund websites:

${numberedList}

Which 1-2 files most likely contain the requested metrics?

Rules:
- Prefer disclosure reports, portfolio reports, performance reviews, combined portfolio reports
- Avoid financial statements, balance sheets, ACFR, agendas, minutes
- "Quarterly statement" is usually a balance sheet (bad). "Quarterly disclosure report" is usually performance data (good).
- More recent files are better
- If unsure between two, pick the one more likely to have the specific metrics

Return ONLY a JSON array of file numbers, e.g. [3] or [3, 7]. Nothing else.`;

  try {
    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      15000,
      'PDF selection timed out.',
    );

    if (!response.ok) {
      // Fall back to heuristic selection
      return candidates.slice(0, 2);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) return candidates.slice(0, 2);

    const selected = parsed
      .filter((n: unknown) => typeof n === 'number' && n >= 1 && n <= candidates.length)
      .map((n: number) => candidates[n - 1]);

    return selected.length > 0 ? selected : candidates.slice(0, 2);
  } catch {
    // Any failure — fall back to first 2 by heuristic rank
    return candidates.slice(0, 2);
  }
}

export async function extractMetricsFromPDF(
  file: File,
  apiKey: string
): Promise<ExtractionResult> {
  const buffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(buffer);
  const chunks = await splitPdfIfNeeded(pdfBytes);

  if (chunks) {
    // pdf-lib parsed successfully — use chunked extraction
    const results: ExtractionResult[] = [];
    for (const chunk of chunks) {
      const result = await extractChunk(
        chunk.base64,
        apiKey,
        file.name,
        chunk.pageOffset,
        chunk.totalPages,
      );
      results.push(result);
    }
    return mergeResults(results);
  }

  // Fallback: pdf-lib couldn't parse — send raw base64 and hope it's under 100 pages
  const base64 = uint8ToBase64(pdfBytes);
  return extractChunk(base64, apiKey, file.name, 0, 0);
}

export type LogFn = (message: string, status?: 'info' | 'done' | 'error') => void;

export function persistLog(message: string, status: string) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, status }),
  }).catch(() => {});
}

export function serverLog(event: string, data: Record<string, unknown>) {
  fetch('/api/server-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...data }),
  }).catch(() => {});
}

export function saveRunArtifact(artifact: Record<string, unknown>): void {
  fetch('/api/save-run-artifact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(artifact),
  }).catch(() => {});
}

function buildPageRange(startPage: number, endPage: number): number[] {
  if (endPage < startPage) return [];
  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
}

function formatPageList(pages: number[]): string {
  if (pages.length === 0) return 'none';
  if (pages.length <= 8) return pages.join(', ');
  return `${pages.slice(0, 8).join(', ')} ...`;
}

export async function extractMetricsFromPdfUrl(
  pdfUrl: string,
  apiKey: string,
  log: LogFn = () => {},
  options: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const pdfFilename = decodeURIComponent(
    new URL(pdfUrl).pathname.split('/').pop() || 'scraped.pdf'
  );

  // Wrap log to also persist to disk
  const _log = log;
  log = (message: string, status: 'info' | 'done' | 'error' = 'info') => {
    _log(message, status);
    persistLog(message, status);
  };

  try {
    const startedAt = Date.now();

    // Step 1: Get PDF info (triggers server-side download + cache)
    log('Downloading and analyzing PDF...');
    const info = await getPdfInfo(pdfUrl);
    log(`${info.totalPages} pages detected`, 'done');
    serverLog('PDF_INFO', {
      pdf: pdfFilename,
      pdfUrl,
      totalPages: info.totalPages,
      chunkCount: info.chunkCount,
    });

    // Decide whether to use smart filtering
    const hasFocusQuery = !!options.focusQuery;
    const requestedMetricTypes = hasFocusQuery ? getRequestedMetricTypes(options.focusQuery!) : [];
    const hasSpecificMetricFocus = requestedMetricTypes.some((metricType) =>
      ['IRR', 'TVPI', 'DPI', 'NAV'].includes(metricType),
    );
    const hasSpecificFocus = requestedMetricTypes.some((metricType) =>
      ['IRR', 'TVPI', 'DPI', 'NAV', 'AUM'].includes(metricType),
    );
    const effectiveExtractionMode = options.extractionMode ?? (hasSpecificFocus ? 'focused' : 'broad');
    const effectiveOptions = { ...options, extractionMode: effectiveExtractionMode };
    const shouldSmartFilter =
      info.totalPages > SMART_FILTER_THRESHOLD ||
      (hasFocusQuery && info.totalPages > FOCUSED_FILTER_THRESHOLD) ||
      (hasSpecificMetricFocus && info.totalPages > SPECIFIC_METRIC_FILTER_THRESHOLD);
    const maxFilteredPages = hasSpecificMetricFocus
      ? SPECIFIC_METRIC_FILTER_MAX_PAGES
      : info.totalPages > SMART_FILTER_THRESHOLD
      ? SMART_FILTER_MAX_PAGES
      : FOCUSED_FILTER_MAX_PAGES;

    // Step 2: Cheap preview preflight before any expensive extraction
    const previewPages = buildPageRange(1, Math.min(info.totalPages, 5));
    if (previewPages.length > 0) {
      log(`Preview preflight: scanning pages ${formatPageList(previewPages)} for off-target signals...`);
      try {
        const previewBytes = await fetchPdfPreviewSubset(pdfUrl, previewPages);
        const previewText = await extractPdfPreviewText(previewBytes, previewPages.length);
        const scannedPreviewPages = previewPages.slice(0, previewText.pagesScanned);
        const rejectCheck = earlyRejectCheck(previewText.text, options.focusQuery);

        serverLog('PDF_PREVIEW_PREFLIGHT', {
          pdf: pdfFilename,
          pdfUrl,
          requestedMetricTypes,
          pagesScanned: scannedPreviewPages,
          shouldReject: rejectCheck.shouldReject,
          rejectReason: rejectCheck.reason,
          corporateSignals: rejectCheck.corporateSignals,
          pensionSignals: rejectCheck.pensionSignals,
          confidence: rejectCheck.confidence,
        });

        if (rejectCheck.shouldReject) {
          log(`Skipped extraction: ${rejectCheck.reason}`, 'info');
          if (rejectCheck.corporateSignals.length > 0) {
            log(`Reject signals: ${rejectCheck.corporateSignals.slice(0, 4).join(', ')}`, 'info');
          }
          serverLog('EXTRACTION_SKIPPED', {
            pdf: pdfFilename,
            pdfUrl,
            strategy: 'preview-only',
            reviewedPages: scannedPreviewPages,
            reason: rejectCheck.reason,
            corporateSignals: rejectCheck.corporateSignals,
            pensionSignals: rejectCheck.pensionSignals,
          });

          return {
            metrics: [],
            signals: [{ signal_type: 'Early Reject', description: rejectCheck.reason }],
            metadata: {
              source_organization: '',
              document_type: 'rejected',
              document_date: '',
              reporting_period: '',
            },
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            elapsedSec: parseFloat(((Date.now() - startedAt) / 1000).toFixed(1)),
            reviewedPageNumbers: scannedPreviewPages,
            totalPages: info.totalPages,
            pageSubsetStrategy: 'preview-only',
            wasEarlyRejected: true,
            skipReason: rejectCheck.reason,
          };
        }

        log(`Preview passed: no hard reject signals on pages ${formatPageList(scannedPreviewPages)}.`, 'done');
      } catch (previewError) {
        const previewMessage = previewError instanceof Error ? previewError.message : 'unknown preview error';
        log('Preview preflight unavailable — continuing with extraction.', 'info');
        serverLog('PDF_PREVIEW_PREFLIGHT_ERROR', {
          pdf: pdfFilename,
          pdfUrl,
          error: previewMessage,
        });
      }
    }

    // Step 3: For small PDFs (or medium without focus), send directly
    if (!shouldSmartFilter) {
      const reviewedPageNumbers = buildPageRange(1, info.totalPages);
      log(`Page subset strategy: full document (${info.totalPages} pages).`);
      serverLog('PAGE_FILTER_RESULT', {
        pdf: pdfFilename,
        pdfUrl,
        strategy: 'full-document',
        reviewedPages: reviewedPageNumbers,
        totalPages: info.totalPages,
      });
      log('Small document — sending directly to Claude...');
      const base64 = await fetchPdfChunk(pdfUrl, 0);
      log('Extracting financial metrics...', 'info');
      const result = await extractChunk(base64, apiKey, pdfFilename, 0, info.totalPages, effectiveOptions, log);
      log(`Found ${result.metrics.length} metrics in ${result.elapsedSec?.toFixed(1) ?? '?'}s — ${result.inputTokens ?? 0} in / ${result.outputTokens ?? 0} out tokens ($${result.costUsd?.toFixed(3) ?? '?'})`, 'done');
      return {
        ...result,
        reviewedPageNumbers,
        totalPages: info.totalPages,
        pageSubsetStrategy: 'full-document',
      };
    }

    // Step 4: Smart filtering — score pages and send only the most relevant
    log(`${info.totalPages} pages — scanning for the most relevant pages...`);
    const fullPdfResponse = await fetchWithTimeout(
      `/proxy-pdf?url=${encodeURIComponent(pdfUrl)}`,
      {},
      PDF_PROXY_TIMEOUT_MS,
      'Timed out while downloading the full PDF for analysis.',
    );
    if (!fullPdfResponse.ok) throw new Error(`Failed to download PDF (${fullPdfResponse.status})`);
    const pdfBytes = new Uint8Array(await fullPdfResponse.arrayBuffer());
    log(`Downloaded ${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB`, 'done');

    log(`Scanning ${info.totalPages} pages for financial content...`);
    const focusKeywordsForScoring = hasFocusQuery
      ? getFocusKeywords(options.focusQuery!, detectSearchIntents(options.focusQuery!))
      : [];
    const scores = await scorePages(pdfBytes, focusKeywordsForScoring);
    const relevantPages = selectTopPages(scores, maxFilteredPages);

    if (relevantPages.length === 0) {
      const fallbackPages = buildPageRange(1, Math.min(MAX_PDF_PAGES, info.totalPages));
      log('No financial keywords found — using first chunk as fallback', 'info');
      log(`Page subset strategy: first chunk fallback (${fallbackPages.length} pages).`, 'info');
      serverLog('PAGE_FILTER_RESULT', {
        pdf: pdfFilename,
        pdfUrl,
        strategy: 'first-chunk-fallback',
        reviewedPages: fallbackPages,
        totalPages: info.totalPages,
        reason: 'no keyword hits',
      });
      const base64 = await fetchPdfChunk(pdfUrl, 0);
      const result = await extractChunk(base64, apiKey, pdfFilename, 0, info.totalPages, effectiveOptions, log);
      log(`Extracted ${result.metrics.length} metrics in ${result.elapsedSec?.toFixed(1) ?? '?'}s — ${result.inputTokens ?? 0} in / ${result.outputTokens ?? 0} out tokens ($${result.costUsd?.toFixed(3) ?? '?'})`, 'done');
      return {
        ...result,
        reviewedPageNumbers: fallbackPages,
        totalPages: info.totalPages,
        pageSubsetStrategy: 'first-chunk-fallback',
      };
    }

    log(`Found ${relevantPages.length} relevant pages (of ${info.totalPages})`, 'done');
    log(`Page subset strategy: filtered subset (${relevantPages.length} pages): ${formatPageList(relevantPages)}`, 'done');
    serverLog('PAGE_FILTER_RESULT', {
      pdf: pdfFilename,
      pdfUrl,
      strategy: 'filtered-subset',
      reviewedPages: relevantPages,
      totalPages: info.totalPages,
      requestedMetricTypes,
    });

    log('Building subset PDF with relevant pages...');
    const pagesParam = relevantPages.join(',');
    const subsetResponse = await fetchWithTimeout(
      `/proxy-pdf-subset?url=${encodeURIComponent(pdfUrl)}&pages=${pagesParam}`,
      {},
      PDF_PROXY_TIMEOUT_MS,
      'Timed out while preparing the filtered PDF subset.',
    );
    if (!subsetResponse.ok) {
      const body = await subsetResponse.text().catch(() => '');
      throw new Error(`PDF subset creation failed: ${body || subsetResponse.statusText}`);
    }
    const subsetBytes = new Uint8Array(await subsetResponse.arrayBuffer());
    const subsetBase64 = uint8ToBase64(subsetBytes);
    log(`Subset: ${relevantPages.length} pages, ${(subsetBytes.length / 1024).toFixed(0)} KB`, 'done');

    log('Sending to Claude for extraction...');
    const result = await extractChunkWithPageMap(
      subsetBase64, apiKey, pdfFilename, relevantPages, info.totalPages, effectiveOptions, log,
    );
    log(`Extracted ${result.metrics.length} metrics in ${result.elapsedSec?.toFixed(1) ?? '?'}s — ${result.inputTokens ?? 0} in / ${result.outputTokens ?? 0} out tokens ($${result.costUsd?.toFixed(3) ?? '?'})`, 'done');

    return {
      ...result,
      reviewedPageNumbers: relevantPages,
      totalPages: info.totalPages,
      pageSubsetStrategy: 'filtered-subset',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF extraction failed.';
    log(message, 'error');
    throw error instanceof Error ? error : new Error(message);
  }
}

export async function fetchPdfPreviewSubset(
  pdfUrl: string,
  pages: number[] = [1, 2],
): Promise<Uint8Array> {
  const pagesParam = pages.join(',');
  const response = await fetchWithTimeout(
    `/proxy-pdf-subset?url=${encodeURIComponent(pdfUrl)}&pages=${pagesParam}`,
    {},
    PDF_PROXY_TIMEOUT_MS,
    'Timed out while preparing the PDF preview subset.',
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PDF preview fetch failed: ${body || response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function deduplicateMetrics(metrics: Metric[]): Metric[] {
  const seen = new Set<string>();
  return metrics.filter((m) => {
    const key = `${m.metric}|${m.fund}|${m.asset_class}|${m.value}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeUrlForPdfs(url: string): Promise<ScrapedPdfLink[]> {
  const response = await fetchWithTimeout(
    'https://api.firecrawl.dev/v1/scrape',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getFirecrawlApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['links', 'rawHtml'] }),
    },
    SCRAPE_TIMEOUT_MS,
    'Source page scan timed out while looking for PDFs.',
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Scrape failed (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Firecrawl scrape failed');
  }

  const candidates = new Set<string>();

  // Source 1: links array (traditional <a href> links)
  const allLinks: string[] = data.data?.links || [];
  for (const link of allLinks) {
    if (/\.pdf(\?|#|$)/i.test(link)) candidates.add(link);
  }

  // Source 2: raw HTML — extract PDF URLs from src, href, data-* attributes, and inline references
  const rawHtml: string = data.data?.rawHtml || '';
  if (rawHtml) {
    const htmlPdfUrls = rawHtml.match(/https?:\/\/[^\s"'<>]+\.pdf/gi) || [];
    for (const u of htmlPdfUrls) candidates.add(u);
  }

  const pdfLinks: ScrapedPdfLink[] = [];
  for (const raw of candidates) {
    try {
      // Clean up HTML entities and trailing fragments
      const cleaned = raw.replace(/&amp;/g, '&').split(/[#?]/)[0];
      const fullUrl = cleaned.startsWith('http') ? cleaned : new URL(cleaned, url).href;
      const pathname = new URL(fullUrl).pathname;
      const filename = decodeURIComponent(pathname.split('/').pop() || 'document.pdf');
      pdfLinks.push({ url: fullUrl, filename });
    } catch {
      // Skip malformed URLs
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return pdfLinks.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}
