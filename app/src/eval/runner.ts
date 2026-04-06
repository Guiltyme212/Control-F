/**
 * Evaluation runner for Control F gold cases.
 *
 * Reads local evidence PDFs, sends them through the extraction pipeline
 * (bypassing Firecrawl), and scores results against gold case expectations.
 *
 * This module is designed to work in a browser environment (same as the app)
 * but feeds PDFs from local files instead of fetching from URLs.
 *
 * Usage from the app (or a dev page):
 *   import { runCase, runAll, runByFamily } from './runner';
 *   const result = await runCase('G1', apiKey);
 */

import { PDFDocument } from 'pdf-lib';
import type { Metric } from '../data/types';
import type { ExtractionResult } from '../utils/api';
import { extractPdfPreviewText, earlyRejectCheck } from '../utils/pdfFilter';
import { allGoldCases, getGoldCase } from './goldCases';
import { scoreCase, buildRunSummary, formatReport } from './scorer';
import type { GoldCase, CaseScore, EvalRunSummary, RunArtifact } from './types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_MAX_TOKENS = 32000;
const CLAUDE_TIMEOUT_MS = 300_000;
const MAX_PAGES_PER_CHUNK = 50;

/* ------------------------------------------------------------------ */
/*  System prompt (identical to api.ts)                                */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are a financial data extraction agent specialized in US public pension fund documents.

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildFocusInstruction(query: string): string {
  const normalizedQuery = query.toLowerCase();
  const focusMetricHints: string[] = [];

  if (normalizedQuery.includes('irr')) focusMetricHints.push('IRR');
  if (normalizedQuery.includes('tvpi')) focusMetricHints.push('TVPI');
  if (normalizedQuery.includes('dpi')) focusMetricHints.push('DPI');
  if (normalizedQuery.includes('nav')) focusMetricHints.push('NAV');
  if (normalizedQuery.includes('aum')) focusMetricHints.push('AUM');

  const metricHintText = focusMetricHints.length
    ? ` ONLY extract these metric types: ${focusMetricHints.join(', ')}. Extract one row per asset class or sub-strategy (e.g. Private Equity, Real Estate, Credit, Infrastructure, Total). Do NOT extract individual GP/manager-level rows — only summary-level data.`
    : '';

  return `\n\nSearch focus: "${query}"${metricHintText}\n\nPrioritize extracting metrics that directly answer this search query. Include all relevant rows for the requested metric types, but skip large tables that are entirely unrelated to the search focus. IMPORTANT: Your response must end with valid JSON — do not add any explanation after the closing brace.`;
}

interface ParsedExtraction {
  document_metadata: {
    source_organization: string;
    document_type: string;
    document_date: string;
    reporting_period: string;
  };
  extracted_metrics: Array<{
    date: string;
    lp_name: string;
    fund_name: string;
    gp_manager: string;
    metric_type: string;
    value: string;
    currency: string;
    asset_class: string;
    strategy: string;
    page_reference: number | null;
    evidence_text: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  cross_reference_signals: Array<{ signal_type: string; description: string }>;
}

function parseOrSalvageJson(raw: string): ParsedExtraction {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Truncated — try to salvage
  }

  const lastCompleteObj = jsonStr.lastIndexOf('},');
  if (lastCompleteObj === -1) {
    throw new Error(`Could not parse extraction response. Preview: ${jsonStr.slice(0, 300)}`);
  }

  const salvaged = jsonStr.slice(0, lastCompleteObj + 1) + '], "cross_reference_signals": [] }';
  return JSON.parse(salvaged);
}

/* ------------------------------------------------------------------ */
/*  PDF loading                                                        */
/* ------------------------------------------------------------------ */

export type LogFn = (message: string, status?: 'info' | 'done' | 'error') => void;

const defaultLog: LogFn = (msg, status) => {
  const prefix = status === 'done' ? '[OK]' : status === 'error' ? '[ERR]' : '[..]';
  console.log(`${prefix} ${msg}`);
};

/**
 * Load a PDF from a local file path (via fetch from the dev server's static files).
 * The evidence PDFs live in "Reference Files/" at the project root.
 */
async function loadLocalPdf(relativePath: string): Promise<Uint8Array> {
  // In the dev server, files in the project root are served statically
  const url = `/${relativePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load local PDF: ${relativePath} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Split a PDF into chunks if it exceeds MAX_PAGES_PER_CHUNK.
 */
async function chunkPdf(pdfBytes: Uint8Array): Promise<Array<{
  base64: string;
  pageOffset: number;
  totalPages: number;
}>> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (totalPages <= MAX_PAGES_PER_CHUNK) {
    return [{ base64: uint8ToBase64(pdfBytes), pageOffset: 0, totalPages }];
  }

  const chunks: Array<{ base64: string; pageOffset: number; totalPages: number }> = [];
  for (let start = 0; start < totalPages; start += MAX_PAGES_PER_CHUNK) {
    const end = Math.min(start + MAX_PAGES_PER_CHUNK, totalPages);
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
}

/**
 * Create a subset PDF from specific pages.
 * Exported for use in targeted page-filtered evaluation runs.
 */
export async function subsetPdf(
  pdfBytes: Uint8Array,
  pageNumbers: number[],
): Promise<{ base64: string; totalPages: number }> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  const subsetDoc = await PDFDocument.create();

  // pageNumbers are 1-indexed from the scorer; pdf-lib uses 0-indexed
  const indices = pageNumbers
    .map((p) => p - 1)
    .filter((i) => i >= 0 && i < totalPages);

  const copiedPages = await subsetDoc.copyPages(pdfDoc, indices);
  for (const page of copiedPages) subsetDoc.addPage(page);

  const subsetBytes = await subsetDoc.save();
  return {
    base64: uint8ToBase64(new Uint8Array(subsetBytes)),
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/*  Claude API call                                                    */
/* ------------------------------------------------------------------ */

async function callClaude(
  base64: string,
  apiKey: string,
  sourceName: string,
  query: string,
  pageOffset: number,
  totalPages: number,
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const isChunked = totalPages > MAX_PAGES_PER_CHUNK;
  const userText = isChunked
    ? `Extract all financial metrics from this document. This is pages ${pageOffset + 1}–${Math.min(pageOffset + MAX_PAGES_PER_CHUNK, totalPages)} of a ${totalPages}-page document. Report page_reference relative to the original document (add ${pageOffset} to any page number you see).`
    : 'Extract all financial metrics from this document.';
  const focusedUserText = `${userText}${buildFocusInstruction(query)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: focusedUserText },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Claude API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  const elapsed = (Date.now() - startTime) / 1000;
  const usage = data.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const textBlock = data.content?.find((block: { type: string }) => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text content in Claude response');
  }

  const parsed = parseOrSalvageJson(textBlock.text);

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
    truncated: data.stop_reason === 'max_tokens',
    costUsd,
    inputTokens,
    outputTokens,
    elapsedSec: elapsed,
  };
}

/* ------------------------------------------------------------------ */
/*  Merge chunked results                                              */
/* ------------------------------------------------------------------ */

function mergeResults(results: ExtractionResult[]): ExtractionResult {
  if (results.length === 1) return results[0];

  const allMetrics: Metric[] = [];
  const allSignals: Array<{ signal_type: string; description: string }> = [];
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalElapsed = 0;
  let anyTruncated = false;

  for (const r of results) {
    allMetrics.push(...r.metrics);
    allSignals.push(...r.signals);
    totalCost += r.costUsd ?? 0;
    totalInput += r.inputTokens ?? 0;
    totalOutput += r.outputTokens ?? 0;
    totalElapsed += r.elapsedSec ?? 0;
    if (r.truncated) anyTruncated = true;
  }

  // Deduplicate metrics
  const seen = new Set<string>();
  const dedupedMetrics = allMetrics.filter((m) => {
    const key = `${m.metric}|${m.fund}|${m.asset_class}|${m.value}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    metrics: dedupedMetrics,
    signals: allSignals,
    metadata: results[0].metadata,
    truncated: anyTruncated,
    costUsd: totalCost,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    elapsedSec: totalElapsed,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API: run evaluation cases                                   */
/* ------------------------------------------------------------------ */

export interface CaseResult {
  goldCase: GoldCase;
  extraction: ExtractionResult;
  score: CaseScore;
  artifact: RunArtifact;
}

/**
 * Run a single gold case: load PDF, extract, score.
 */
export async function runCase(
  caseId: string,
  apiKey: string,
  log: LogFn = defaultLog,
): Promise<CaseResult> {
  const goldCase = getGoldCase(caseId);
  if (!goldCase) throw new Error(`Unknown gold case: ${caseId}`);

  log(`[${goldCase.id}] ${goldCase.name}`);
  log(`  Query: "${goldCase.query}"`);
  log(`  PDF: ${goldCase.evidencePdf}`);

  // Load the evidence PDF
  log('  Loading PDF...');
  const pdfBytes = await loadLocalPdf(goldCase.evidencePdf);
  log(`  Loaded ${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB`, 'done');

  // Get page count
  let totalPages = 0;
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    totalPages = pdfDoc.getPageCount();
  } catch {
    log('  Could not parse PDF with pdf-lib, sending raw', 'info');
  }
  log(`  ${totalPages} pages detected`);

  // Early reject check — catch corporate/off-target docs before Claude
  log('  Checking for early reject signals...');
  try {
    const preview = await extractPdfPreviewText(pdfBytes, 3);
    const rejectResult = earlyRejectCheck(preview.text, goldCase.query);
    if (rejectResult.shouldReject) {
      log(`  REJECTED: ${rejectResult.reason}`, 'info');
      log(`  Corporate signals: ${rejectResult.corporateSignals.join(', ')}`, 'info');

      const isNegativeControl = goldCase.documentFamily === 'negative-control';
      const emptyResult: ExtractionResult = {
        metrics: [], signals: [], metadata: { source_organization: '', document_type: 'rejected', document_date: '', reporting_period: '' },
        costUsd: 0, inputTokens: 0, outputTokens: 0, elapsedSec: 0,
      };
      const score = scoreCase(goldCase, emptyResult);
      // For negative controls, early reject = PASS
      if (isNegativeControl) score.passed = true;
      score.grade = isNegativeControl ? 'pass' : 'fail';

      const artifact: RunArtifact = {
        caseId: goldCase.id, timestamp: new Date().toISOString(),
        pdfFile: goldCase.evidencePdf, pdfSizeBytes: pdfBytes.length,
        totalPages, pagesReviewed: 0, extractedMetrics: [], signals: [],
        documentMetadata: emptyResult.metadata, score,
        costUsd: 0, inputTokens: 0, outputTokens: 0, elapsedSec: 0,
      };

      log(`  Score: ${score.grade.toUpperCase()} (early reject — $0.00)`, isNegativeControl ? 'done' : 'error');
      return { goldCase, extraction: emptyResult, score, artifact };
    }
    log('  No early reject — proceeding to extraction', 'done');
  } catch {
    log('  Preview extraction failed — proceeding without reject check', 'info');
  }

  // Chunk if needed, then extract
  let extraction: ExtractionResult;
  const pdfFilename = goldCase.evidencePdf.split('/').pop() ?? 'evidence.pdf';

  if (totalPages <= MAX_PAGES_PER_CHUNK) {
    // Small enough to send directly
    log('  Sending to Claude...');
    const base64 = uint8ToBase64(pdfBytes);
    extraction = await callClaude(
      base64, apiKey, pdfFilename, goldCase.query, 0, totalPages,
    );
  } else {
    // Large PDF — chunk it
    log(`  Large PDF (${totalPages} pages) — chunking...`);
    const chunks = await chunkPdf(pdfBytes);
    log(`  Split into ${chunks.length} chunks`);

    const chunkResults: ExtractionResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`  Extracting chunk ${i + 1}/${chunks.length}...`);
      const result = await callClaude(
        chunks[i].base64,
        apiKey,
        pdfFilename,
        goldCase.query,
        chunks[i].pageOffset,
        chunks[i].totalPages,
      );
      chunkResults.push(result);
      log(`  Chunk ${i + 1}: ${result.metrics.length} metrics, $${result.costUsd?.toFixed(4)}`, 'done');
    }

    extraction = mergeResults(chunkResults);
  }

  log(`  Extraction complete: ${extraction.metrics.length} metrics, $${extraction.costUsd?.toFixed(4)}, ${extraction.elapsedSec?.toFixed(1)}s`, 'done');

  // Score
  const score = scoreCase(goldCase, extraction);
  log(`  Score: ${score.grade.toUpperCase()} (${score.metricsFound}/${score.metricsExpected} metrics)`, score.grade === 'fail' ? 'error' : 'done');

  // Build artifact
  const artifact: RunArtifact = {
    caseId: goldCase.id,
    timestamp: new Date().toISOString(),
    pdfFile: goldCase.evidencePdf,
    pdfSizeBytes: pdfBytes.length,
    totalPages,
    pagesReviewed: totalPages,
    extractedMetrics: extraction.metrics.map((m) => ({
      metric_type: m.metric,
      value: m.value,
      asset_class: m.asset_class,
      fund_name: m.fund,
      gp_manager: m.gp,
      evidence_text: m.evidence,
      confidence: m.confidence,
      page_reference: m.page || null,
    })),
    signals: extraction.signals,
    documentMetadata: extraction.metadata,
    score,
    costUsd: extraction.costUsd ?? 0,
    inputTokens: extraction.inputTokens ?? 0,
    outputTokens: extraction.outputTokens ?? 0,
    elapsedSec: extraction.elapsedSec ?? 0,
  };

  return { goldCase, extraction, score, artifact };
}

/**
 * Run multiple cases by ID.
 */
export async function runCases(
  caseIds: string[],
  apiKey: string,
  log: LogFn = defaultLog,
): Promise<EvalRunSummary> {
  const scores: CaseScore[] = [];

  for (const id of caseIds) {
    try {
      const result = await runCase(id, apiKey, log);
      scores.push(result.score);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`[${id}] FAILED: ${msg}`, 'error');
      scores.push({
        caseId: id,
        caseName: `Error: ${id}`,
        query: '',
        documentFamilyCorrect: false,
        metricMatches: [],
        metricsFound: 0,
        metricsExpected: 0,
        extractionScore: 0,
        forbiddenMetricsFound: [],
        negativePassed: false,
        passed: false,
        grade: 'fail',
      });
    }
    log(''); // blank line between cases
  }

  const summary = buildRunSummary(scores);
  log(formatReport(summary));
  return summary;
}

/**
 * Run all 14 gold cases.
 */
export async function runAll(
  apiKey: string,
  log: LogFn = defaultLog,
): Promise<EvalRunSummary> {
  return runCases(allGoldCases.map((c) => c.id), apiKey, log);
}

/**
 * Run cases for a specific document family.
 */
export async function runByFamily(
  family: GoldCase['documentFamily'],
  apiKey: string,
  log: LogFn = defaultLog,
): Promise<EvalRunSummary> {
  const cases = allGoldCases.filter((c) => c.documentFamily === family);
  return runCases(cases.map((c) => c.id), apiKey, log);
}

/**
 * Run only the negative control cases.
 */
export async function runNegativeControls(
  apiKey: string,
  log: LogFn = defaultLog,
): Promise<EvalRunSummary> {
  return runCases(['N1', 'N2'], apiKey, log);
}
