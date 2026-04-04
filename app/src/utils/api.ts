import { PDFDocument } from 'pdf-lib';
import { scorePages, selectTopPages } from './pdfFilter';
import type { Metric, ExtractedData } from '../data/types';

const FIRECRAWL_API_KEY = 'fc-36ddfed03f4645f3af6db877ab2d1574';
const MAX_PDF_PAGES = 50; // Stay under Claude's 200K token input limit (dense PDFs ≈ 2K tokens/page)
const SMART_FILTER_THRESHOLD = 60; // Use smart filtering for PDFs above this page count
const SMART_FILTER_MAX_PAGES = 30; // Max pages to send after smart filtering

export interface ScrapedPdfLink {
  url: string;
  filename: string;
}

const SYSTEM_PROMPT = `You are a financial data extraction agent specialized in US public pension fund documents.

You will receive a PDF document from a public pension fund (board meeting minutes, transaction reports, investment memos, performance reports, IPC reports).

Extract ALL financial metrics into structured JSON. Be thorough — extract every single data point.

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
      "evidence_text": "exact sentence from document, max 150 chars",
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
3. Performance: separate entries for IRR, TVPI, DPI per fund
4. Always include evidence_text
5. "No activity" sections: note with value "No activity"
6. Proposed investments: use Commitment but note "proposed" in evidence
7. Co-investments: separate entries from main fund commitments
8. Capture target fund size and target returns`;

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
  const response = await fetch(`/proxy-pdf-info?url=${encodeURIComponent(pdfUrl)}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PDF processing failed: ${body || response.statusText}`);
  }
  return response.json();
}

async function fetchPdfChunk(pdfUrl: string, chunkIdx: number): Promise<string> {
  const response = await fetch(`/proxy-pdf-chunk?url=${encodeURIComponent(pdfUrl)}&chunk=${chunkIdx}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch chunk ${chunkIdx} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return uint8ToBase64(new Uint8Array(buffer));
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
): Promise<ExtractionResult> {
  const isChunked = totalPages > MAX_PDF_PAGES;
  const userText = isChunked
    ? `Extract all financial metrics from this document. This is pages ${pageOffset + 1}–${Math.min(pageOffset + MAX_PDF_PAGES, totalPages)} of a ${totalPages}-page document. Report page_reference relative to the original document (add ${pageOffset} to any page number you see).`
    : 'Extract all financial metrics from this document.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    }),
  });

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your Anthropic API key in settings.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (errorBody.includes('100 PDF pages')) {
      throw new Error('PDF too large (over 100 pages). This document has a complex structure that prevents automatic splitting.');
    }
    throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('API returned invalid JSON response.');
  }

  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === 'text'
  );
  if (!textBlock?.text) {
    throw new Error('No text content in API response');
  }

  let parsed: ExtractedData;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse extraction results. The API returned malformed JSON.');
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

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {
      source_organization: '',
      document_type: '',
      document_date: '',
      reporting_period: '',
    },
  };
}

async function extractChunkWithPageMap(
  base64: string,
  apiKey: string,
  sourceName: string,
  originalPageNumbers: number[],
  totalPages: number,
): Promise<ExtractionResult> {
  const pageMapStr = originalPageNumbers
    .map((orig, i) => `page ${i + 1} in this PDF = page ${orig} in the original`)
    .join(', ');

  const userText = `Extract all financial metrics from this document. This is a filtered subset (${originalPageNumbers.length} pages) of a ${totalPages}-page document. Page mapping: ${pageMapStr}. Report page_reference using the ORIGINAL document page numbers.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    }),
  });

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your Anthropic API key in settings.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
  }

  let data;
  try { data = await response.json(); } catch { throw new Error('API returned invalid JSON response.'); }

  const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
  if (!textBlock?.text) throw new Error('No text content in API response');

  let parsed: ExtractedData;
  try {
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(jsonStr);
  } catch { throw new Error('Failed to parse extraction results.'); }

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

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {
      source_organization: '', document_type: '', document_date: '', reporting_period: '',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Merge results from multiple chunks                                 */
/* ------------------------------------------------------------------ */

function mergeResults(results: ExtractionResult[]): ExtractionResult {
  return {
    metrics: results.flatMap((r) => r.metrics),
    signals: results.flatMap((r) => r.signals),
    metadata: results[0]?.metadata || {
      source_organization: '',
      document_type: '',
      document_date: '',
      reporting_period: '',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface ExtractionResult {
  metrics: Metric[];
  signals: { signal_type: string; description: string }[];
  metadata: ExtractedData['document_metadata'];
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

function persistLog(message: string, status: string) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, status }),
  }).catch(() => {});
}

export async function extractMetricsFromPdfUrl(
  pdfUrl: string,
  apiKey: string,
  log: LogFn = () => {},
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

  // Step 1: Get PDF info (triggers server-side download + cache)
  log('Downloading and analyzing PDF...');
  const info = await getPdfInfo(pdfUrl);
  log(`${info.totalPages} pages detected`, 'done');

  // Step 2: For small PDFs, send directly
  if (info.totalPages <= SMART_FILTER_THRESHOLD) {
    log('Small document — sending directly to Claude...');
    const base64 = await fetchPdfChunk(pdfUrl, 0);
    log('Extracting financial metrics...', 'info');
    const result = await extractChunk(base64, apiKey, pdfFilename, 0, info.totalPages);
    log(`Found ${result.metrics.length} metrics`, 'done');
    return result;
  }

  // Large PDF — smart filtering
  log('Large document — downloading for analysis...');
  const fullPdfResponse = await fetch(`/proxy-pdf?url=${encodeURIComponent(pdfUrl)}`);
  if (!fullPdfResponse.ok) throw new Error(`Failed to download PDF (${fullPdfResponse.status})`);
  const pdfBytes = new Uint8Array(await fullPdfResponse.arrayBuffer());
  log(`Downloaded ${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB`, 'done');

  // Score every page for financial keywords
  log(`Scanning ${info.totalPages} pages for financial content...`);
  const scores = await scorePages(pdfBytes);
  const relevantPages = selectTopPages(scores, SMART_FILTER_MAX_PAGES);

  if (relevantPages.length === 0) {
    log('No financial keywords found — using first chunk as fallback', 'info');
    const base64 = await fetchPdfChunk(pdfUrl, 0);
    return extractChunk(base64, apiKey, pdfFilename, 0, info.totalPages);
  }

  log(`Found ${relevantPages.length} relevant pages (of ${info.totalPages})`, 'done');

  // Create subset PDF
  log('Building subset PDF with relevant pages...');
  const pagesParam = relevantPages.join(',');
  const subsetResponse = await fetch(
    `/proxy-pdf-subset?url=${encodeURIComponent(pdfUrl)}&pages=${pagesParam}`
  );
  if (!subsetResponse.ok) {
    const body = await subsetResponse.text().catch(() => '');
    throw new Error(`PDF subset creation failed: ${body || subsetResponse.statusText}`);
  }
  const subsetBytes = new Uint8Array(await subsetResponse.arrayBuffer());
  const subsetBase64 = uint8ToBase64(subsetBytes);
  log(`Subset: ${relevantPages.length} pages, ${(subsetBytes.length / 1024).toFixed(0)} KB`, 'done');

  // Send to Claude
  log('Sending to Claude for extraction...');
  const result = await extractChunkWithPageMap(
    subsetBase64, apiKey, pdfFilename, relevantPages, info.totalPages,
  );
  log(`Extracted ${result.metrics.length} metrics`, 'done');

  return result;
}

export async function scrapeUrlForPdfs(url: string): Promise<ScrapedPdfLink[]> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['links', 'rawHtml'] }),
  });

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
