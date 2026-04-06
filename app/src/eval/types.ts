/**
 * Evaluation harness types for Control F gold-case testing.
 *
 * These types define the structure for benchmark cases, scoring,
 * and run artifacts used to evaluate the extraction pipeline
 * against known-good evidence documents.
 */

/* ------------------------------------------------------------------ */
/*  Document families                                                  */
/* ------------------------------------------------------------------ */

/**
 * The four document families Giulio's evidence docs represent,
 * plus a negative-control family for docs that should be rejected.
 */
export type DocumentFamily =
  | 'transaction-report'     // Monthly transaction / event reports (NY State CRF style)
  | 'performance-update'     // Portfolio performance / quarterly reviews (Santa Barbara PRR style)
  | 'investment-memo'        // Due diligence / IPC recommendation packets (NJ Ardian style)
  | 'board-agenda'           // Board / investment committee agendas (SDCERS style)
  | 'negative-control';      // Docs that should NOT produce valid pension metrics (Bridgepoint, noisy minutes)

/**
 * The frozen MVP pension-fund universe from Giulio's email.
 */
export const MVP_PENSION_FUNDS = [
  'NM PERA',
  'ISBI',
  'PSERS',
  'Minnesota SBI',
  'SAMCERA',
] as const;

export type MvpPensionFund = typeof MVP_PENSION_FUNDS[number];

/* ------------------------------------------------------------------ */
/*  Gold case definition                                               */
/* ------------------------------------------------------------------ */

export interface ExpectedMetric {
  /** e.g. 'Commitment', 'IRR', 'TVPI', 'Termination', 'Target Return' */
  metricType: string;
  /** Expected value string — exact or regex pattern */
  value?: string;
  /** If true, `value` is treated as a regex pattern */
  valueIsPattern?: boolean;
  /** Expected asset class / strategy */
  assetClass?: string;
  /** Expected fund name */
  fund?: string;
  /** Expected GP / manager name */
  gp?: string;
  /** Acceptable confidence levels */
  acceptableConfidence?: ('high' | 'medium' | 'low')[];
}

export interface GoldCase {
  /** Unique case ID, e.g. 'G1', 'N1' */
  id: string;
  /** Human-readable case name */
  name: string;
  /** The query a user would type */
  query: string;
  /** Which document family this case tests */
  documentFamily: DocumentFamily;
  /** Which pension fund the query targets (or null for non-pension docs) */
  pensionFund: string | null;
  /** Path to the local evidence PDF (relative to project root) */
  evidencePdf: string;
  /** Expected metric types that MUST be extracted */
  expectedMetrics: ExpectedMetric[];
  /** Metric types that must NOT appear (for negative controls) */
  forbiddenMetrics?: string[];
  /** Asset classes that should be in scope */
  expectedAssetClasses?: string[];
  /** Whether partial extraction is acceptable */
  partialAcceptable: boolean;
  /** Description of what must NOT count as success */
  failureConditions: string[];
  /** Free-text notes about this case */
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Scoring results                                                    */
/* ------------------------------------------------------------------ */

export interface MetricMatch {
  expected: ExpectedMetric;
  found: boolean;
  /** The actual extracted metric that matched, if any */
  matchedValue?: string;
  matchedMetricType?: string;
  matchedAssetClass?: string;
  matchedFund?: string;
  matchedGp?: string;
  /** Why it didn't match, if not found */
  reason?: string;
}

export interface CaseScore {
  caseId: string;
  caseName: string;
  query: string;

  /* Retrieval correctness */
  documentFamilyCorrect: boolean;
  detectedDocumentFamily?: string;

  /* Extraction correctness */
  metricMatches: MetricMatch[];
  metricsFound: number;
  metricsExpected: number;
  extractionScore: number;       // 0-1, metricsFound / metricsExpected

  /* Negative control */
  forbiddenMetricsFound: string[];
  negativePassed: boolean;       // true if no forbidden metrics appeared

  /* Overall */
  passed: boolean;
  grade: 'pass' | 'partial' | 'weak' | 'rejected-correctly' | 'handled-safely' | 'rejected-incorrectly' | 'fail';

  /* Cost / performance */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  elapsedSec?: number;
  pagesReviewed?: number;
}

export interface EvalRunSummary {
  runId: string;
  timestamp: string;
  casesRun: number;
  positiveCases?: number;
  negativeCases?: number;
  passed: number;
  partial: number;
  weak: number;
  rejectedCorrectly: number;
  handledSafely: number;
  rejectedIncorrectly: number;
  failed: number;
  totalCostUsd: number;
  averageCostUsd?: number;
  totalElapsedSec: number;
  averageElapsedSec?: number;
  scores: CaseScore[];
}

/* ------------------------------------------------------------------ */
/*  Run artifacts (per-case diagnostic data)                           */
/* ------------------------------------------------------------------ */

export interface RunArtifact {
  caseId: string;
  timestamp: string;
  /** The PDF that was fed into extraction */
  pdfFile: string;
  pdfSizeBytes: number;
  totalPages: number;
  pagesReviewed: number;
  /** Raw metrics returned by Claude */
  extractedMetrics: Array<{
    metric_type: string;
    value: string;
    asset_class: string;
    fund_name: string;
    gp_manager: string;
    evidence_text: string;
    confidence: string;
    page_reference: number | null;
  }>;
  /** Signals returned by Claude */
  signals: Array<{ signal_type: string; description: string }>;
  /** Document metadata from Claude */
  documentMetadata: {
    source_organization: string;
    document_type: string;
    document_date: string;
    reporting_period: string;
  };
  /** Scoring result */
  score: CaseScore;
  /** Cost breakdown */
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  elapsedSec: number;
}
