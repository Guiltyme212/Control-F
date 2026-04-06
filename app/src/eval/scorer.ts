import type { Metric } from '../data/types';
import type { ExtractionResult } from '../utils/api';
import type {
  GoldCase,
  ExpectedMetric,
  MetricMatch,
  CaseScore,
  EvalRunSummary,
  DocumentFamily,
} from './types';

/* ------------------------------------------------------------------ */
/*  Readable labels and summary helpers                                */
/* ------------------------------------------------------------------ */

export function formatGradeLabel(grade: CaseScore['grade']): string {
  const labels: Record<CaseScore['grade'], string> = {
    pass: 'Pass',
    partial: 'Partial',
    weak: 'Weak',
    'rejected-correctly': 'Rejected correctly',
    'handled-safely': 'Handled safely',
    'rejected-incorrectly': 'Rejected incorrectly',
    fail: 'Fail',
  };

  return labels[grade];
}

export interface SummaryStats {
  positiveCases: number;
  negativeCases: number;
  averageCostUsd: number;
  averageElapsedSec: number;
}

export function getSummaryStats(summary: EvalRunSummary): SummaryStats {
  const positiveCases = summary.positiveCases ?? summary.scores.filter((score) => !score.caseId.startsWith('N')).length;
  const negativeCases = summary.negativeCases ?? summary.scores.filter((score) => score.caseId.startsWith('N')).length;
  const averageCostUsd = summary.averageCostUsd ?? summary.totalCostUsd / Math.max(summary.casesRun, 1);
  const averageElapsedSec = summary.averageElapsedSec ?? summary.totalElapsedSec / Math.max(summary.casesRun, 1);

  return {
    positiveCases,
    negativeCases,
    averageCostUsd,
    averageElapsedSec,
  };
}

export interface NegativeControlOutcome {
  expected: string;
  observed: string;
  result: string;
}

export function describeNegativeControlOutcome(score: CaseScore): NegativeControlOutcome {
  if (score.grade === 'rejected-correctly') {
    return {
      expected: 'Reject or handle safely',
      observed: 'Detected as off-target — rejected before extraction. No cost incurred.',
      result: 'Blocked',
    };
  }
  if (score.grade === 'handled-safely') {
    return {
      expected: 'Reject or handle safely',
      observed: 'No performance metrics in this document. Claude confirmed absence — no wrong data returned.',
      result: 'Handled safely',
    };
  }
  const forbiddenCount = score.forbiddenMetricsFound.length;
  return {
    expected: 'Reject or handle safely',
    observed: forbiddenCount > 0
      ? `Extraction surfaced ${forbiddenCount} off-target metric type(s)`
      : 'Extraction continued with uncertain results',
    result: 'Needs improvement',
  };
}

/* ------------------------------------------------------------------ */
/*  Document family detection                                          */
/* ------------------------------------------------------------------ */

const FAMILY_SIGNALS: Record<DocumentFamily, string[]> = {
  'transaction-report': [
    'transaction', 'monthly report', 'termination', 'new commitment',
    'transaction report', 'monthly transaction',
  ],
  'performance-update': [
    'performance', 'portfolio review', 'quarterly review', 'irr',
    'tvpi', 'dpi', 'since inception', 'benchmark', 'net return',
    'market value', 'unfunded commitment',
  ],
  'investment-memo': [
    'investment memo', 'ipc', 'due diligence', 'recommendation',
    'target return', 'target fund size', 'management fee', 'carry',
    'prior fund', 'track record', 'investment council',
  ],
  'board-agenda': [
    'agenda', 'board meeting', 'investment committee', 'consent',
    'approve', 'authorization', 'board of retirement',
  ],
  'negative-control': [
    'annual results', 'corporate', 'shareholder', 'revenue', 'ebitda',
    'fee-paying aum', 'fundraising',
  ],
};

/**
 * Detect which document family the extraction results suggest,
 * based on metadata and metric content.
 */
export function detectDocumentFamily(
  result: ExtractionResult,
): DocumentFamily | 'unknown' {
  const haystack = [
    result.metadata?.document_type ?? '',
    result.metadata?.source_organization ?? '',
    ...result.metrics.map((m) =>
      `${m.metric} ${m.evidence} ${m.asset_class} ${m.fund}`,
    ),
    ...result.signals.map((s) => s.description),
  ]
    .join(' ')
    .toLowerCase();

  let bestFamily: DocumentFamily | 'unknown' = 'unknown';
  let bestCount = 0;

  for (const [family, signals] of Object.entries(FAMILY_SIGNALS)) {
    const count = signals.filter((s) => haystack.includes(s)).length;
    if (count > bestCount) {
      bestCount = count;
      bestFamily = family as DocumentFamily;
    }
  }

  return bestFamily;
}

/* ------------------------------------------------------------------ */
/*  Metric matching                                                    */
/* ------------------------------------------------------------------ */

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[,\s$%]/g, '');
}

function metricTypeMatches(extracted: string, expected: string): boolean {
  const e = extracted.toLowerCase();
  const x = expected.toLowerCase();

  // Direct match
  if (e === x) return true;
  if (e.includes(x) || x.includes(e)) return true;

  // Common aliases
  const aliases: Record<string, string[]> = {
    'irr': ['internal rate of return', 'net irr', 'gross irr'],
    'tvpi': ['total value to paid-in', 'total value multiple'],
    'dpi': ['distributions to paid-in', 'realization multiple'],
    'nav': ['net asset value', 'market value', 'fair value'],
    'commitment': ['committed', 'commitments', 'unfunded commitment', 'unfunded commitments'],
    'termination': ['terminated', 'terminations'],
    'target return': ['target net irr', 'expected return', 'target gross irr'],
    'target fund size': ['fund size', 'target size'],
    'management fee': ['mgmt fee', 'management fees'],
    'carry': ['carried interest', 'incentive fee', 'performance fee'],
    'asset allocation': ['allocation', 'portfolio allocation', 'strategy allocation'],
  };

  for (const [canonical, alts] of Object.entries(aliases)) {
    const group = [canonical, ...alts];
    const eInGroup = group.some((a) => e.includes(a));
    const xInGroup = group.some((a) => x.includes(a));
    if (eInGroup && xInGroup) return true;
  }

  return false;
}

function valueMatches(
  extractedValue: string,
  expectedValue: string,
  isPattern: boolean,
): boolean {
  if (!expectedValue) return true; // No expected value = any value is OK

  const normalized = normalizeForComparison(extractedValue);

  if (isPattern) {
    try {
      return new RegExp(expectedValue, 'i').test(extractedValue) ||
             new RegExp(expectedValue, 'i').test(normalized);
    } catch {
      // Invalid regex, fall back to includes
      return normalized.includes(normalizeForComparison(expectedValue));
    }
  }

  return normalized.includes(normalizeForComparison(expectedValue));
}

function fieldMatches(extracted: string | undefined, expected: string | undefined): boolean {
  if (!expected) return true; // No expectation = anything is fine
  if (!extracted) return false;
  return extracted.toLowerCase().includes(expected.toLowerCase()) ||
         expected.toLowerCase().includes(extracted.toLowerCase());
}

/**
 * Try to match a single expected metric against the full set of extracted metrics.
 */
function matchExpectedMetric(
  expected: ExpectedMetric,
  extractedMetrics: Metric[],
): MetricMatch {
  for (const metric of extractedMetrics) {
    const typeOk = metricTypeMatches(metric.metric, expected.metricType);
    const valueOk = valueMatches(metric.value, expected.value ?? '', expected.valueIsPattern ?? false);
    const assetOk = fieldMatches(metric.asset_class, expected.assetClass);
    const fundOk = fieldMatches(metric.fund, expected.fund);
    const gpOk = fieldMatches(metric.gp, expected.gp);

    if (typeOk && valueOk && assetOk && fundOk && gpOk) {
      return {
        expected,
        found: true,
        matchedValue: metric.value,
        matchedMetricType: metric.metric,
        matchedAssetClass: metric.asset_class,
        matchedFund: metric.fund,
        matchedGp: metric.gp,
      };
    }
  }

  // Not found — figure out why
  const typeMatches = extractedMetrics.filter((m) =>
    metricTypeMatches(m.metric, expected.metricType),
  );

  let reason: string;
  if (typeMatches.length === 0) {
    reason = `No metrics of type "${expected.metricType}" found in extraction`;
  } else {
    const issues: string[] = [];
    for (const m of typeMatches) {
      if (expected.value && !valueMatches(m.value, expected.value, expected.valueIsPattern ?? false)) {
        issues.push(`value mismatch: got "${m.value}", expected pattern "${expected.value}"`);
      }
      if (expected.assetClass && !fieldMatches(m.asset_class, expected.assetClass)) {
        issues.push(`asset class mismatch: got "${m.asset_class}", expected "${expected.assetClass}"`);
      }
      if (expected.fund && !fieldMatches(m.fund, expected.fund)) {
        issues.push(`fund mismatch: got "${m.fund}", expected "${expected.fund}"`);
      }
      if (expected.gp && !fieldMatches(m.gp, expected.gp)) {
        issues.push(`GP mismatch: got "${m.gp}", expected "${expected.gp}"`);
      }
    }
    reason = `Found ${typeMatches.length} "${expected.metricType}" metric(s) but none fully matched: ${issues.join('; ')}`;
  }

  return { expected, found: false, reason };
}

/* ------------------------------------------------------------------ */
/*  Forbidden metric checking (for negative controls)                  */
/* ------------------------------------------------------------------ */

function isAbsenceValue(metric: Metric): boolean {
  const val = (metric.value || '').toLowerCase();
  const ev = (metric.evidence || '').toLowerCase();
  return (
    val.includes('no activity') ||
    val.includes('not found') ||
    val.includes('not available') ||
    ev.includes('no irr') || ev.includes('no tvpi') || ev.includes('no dpi') ||
    ev.includes('not reported')
  );
}

function checkForbiddenMetrics(
  extractedMetrics: Metric[],
  forbiddenTypes: string[],
): string[] {
  if (!forbiddenTypes.length) return [];

  return forbiddenTypes.filter((forbidden) =>
    extractedMetrics.some((m) =>
      metricTypeMatches(m.metric, forbidden) &&
      m.confidence !== 'low' &&
      !isAbsenceValue(m),
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  Case scoring                                                       */
/* ------------------------------------------------------------------ */

/**
 * Score a single gold case against extraction results.
 */
export function scoreCase(
  goldCase: GoldCase,
  result: ExtractionResult,
): CaseScore {
  const detectedFamily = detectDocumentFamily(result);
  const documentFamilyCorrect =
    goldCase.documentFamily === 'negative-control'
      ? detectedFamily === 'negative-control' || result.metrics.length === 0
      : detectedFamily === goldCase.documentFamily;

  // Match expected metrics
  const metricMatches = goldCase.expectedMetrics.map((expected) =>
    matchExpectedMetric(expected, result.metrics),
  );
  const metricsFound = metricMatches.filter((m) => m.found).length;
  const metricsExpected = goldCase.expectedMetrics.length;
  const extractionScore = metricsExpected > 0 ? metricsFound / metricsExpected : 1;

  // Check forbidden metrics (for negative controls)
  const forbiddenMetricsFound = checkForbiddenMetrics(
    result.metrics,
    goldCase.forbiddenMetrics ?? [],
  );
  const negativePassed = forbiddenMetricsFound.length === 0;

  // Determine grade
  const wasEarlyRejected = result.metadata?.document_type === 'rejected';
  let grade: CaseScore['grade'];

  if (goldCase.documentFamily === 'negative-control') {
    if (wasEarlyRejected) {
      grade = 'rejected-correctly';
    } else if (negativePassed) {
      // Not early-rejected, but no forbidden metrics surfaced
      // Claude correctly identified absence (e.g. "No activity")
      grade = 'handled-safely';
    } else {
      grade = 'rejected-incorrectly';
    }
  } else if (wasEarlyRejected) {
    // Positive case got rejected — that's wrong
    grade = 'rejected-incorrectly';
  } else if (extractionScore === 1 && negativePassed) {
    grade = 'pass';
  } else if (extractionScore > 0 && goldCase.partialAcceptable) {
    grade = 'partial';
  } else if (extractionScore > 0) {
    grade = 'weak';
  } else {
    grade = 'fail';
  }

  const passed = grade === 'pass' || grade === 'rejected-correctly' || grade === 'handled-safely' ||
    (grade === 'partial' && goldCase.partialAcceptable);

  return {
    caseId: goldCase.id,
    caseName: goldCase.name,
    query: goldCase.query,
    documentFamilyCorrect,
    detectedDocumentFamily: detectedFamily,
    metricMatches,
    metricsFound,
    metricsExpected,
    extractionScore,
    forbiddenMetricsFound,
    negativePassed,
    passed,
    grade,
    costUsd: result.costUsd,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    elapsedSec: result.elapsedSec,
  };
}

/* ------------------------------------------------------------------ */
/*  Run summary                                                        */
/* ------------------------------------------------------------------ */

/**
 * Aggregate individual case scores into a run summary.
 */
export function buildRunSummary(
  scores: CaseScore[],
  runId?: string,
): EvalRunSummary {
  const positiveCases = scores.filter((score) => !score.caseId.startsWith('N')).length;
  const negativeCases = scores.filter((score) => score.caseId.startsWith('N')).length;
  const totalCostUsd = scores.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  const totalElapsedSec = scores.reduce((sum, s) => sum + (s.elapsedSec ?? 0), 0);

  return {
    runId: runId ?? `eval-${Date.now()}`,
    timestamp: new Date().toISOString(),
    casesRun: scores.length,
    positiveCases,
    negativeCases,
    passed: scores.filter((s) => s.passed).length,
    partial: scores.filter((s) => s.grade === 'partial').length,
    weak: scores.filter((s) => s.grade === 'weak').length,
    rejectedCorrectly: scores.filter((s) => s.grade === 'rejected-correctly').length,
    handledSafely: scores.filter((s) => s.grade === 'handled-safely').length,
    rejectedIncorrectly: scores.filter((s) => s.grade === 'rejected-incorrectly').length,
    failed: scores.filter((s) => !s.passed).length,
    totalCostUsd,
    averageCostUsd: totalCostUsd / Math.max(scores.length, 1),
    totalElapsedSec,
    averageElapsedSec: totalElapsedSec / Math.max(scores.length, 1),
    scores,
  };
}

/* ------------------------------------------------------------------ */
/*  Human-readable report                                              */
/* ------------------------------------------------------------------ */

/**
 * Format a run summary as a readable text report.
 */
export function formatReport(summary: EvalRunSummary): string {
  const lines: string[] = [];
  const divider = '═'.repeat(70);
  const thinDivider = '─'.repeat(70);
  const stats = getSummaryStats(summary);
  const positivePassing = summary.scores.filter((score) => !score.caseId.startsWith('N') && score.passed).length;

  lines.push(divider);
  lines.push(`  CONTROL F EVALUATION REPORT`);
  lines.push(`  Run: ${summary.runId}`);
  lines.push(`  Time: ${summary.timestamp}`);
  lines.push(divider);
  lines.push('');
  lines.push(`  OVERALL:  ${summary.passed}/${summary.casesRun} passing`);
  lines.push(`  POSITIVE CASES: ${positivePassing}/${stats.positiveCases} passing  |  ${summary.partial} partial  |  ${summary.weak} weak  |  ${summary.failed} not passing`);
  lines.push(`  NEGATIVE CONTROLS: ${summary.rejectedCorrectly} blocked  |  ${summary.handledSafely} handled safely  |  ${summary.rejectedIncorrectly} needs work`);
  lines.push(`  COST:     $${summary.totalCostUsd.toFixed(4)} total  |  $${stats.averageCostUsd.toFixed(4)} avg/case`);
  lines.push(`  TIME:     ${summary.totalElapsedSec.toFixed(1)}s total  |  ${stats.averageElapsedSec.toFixed(1)}s avg/case`);
  lines.push('');
  lines.push(thinDivider);

  for (const score of summary.scores) {
    const badge = `[${formatGradeLabel(score.grade)}]`;

    lines.push(`  ${badge}  ${score.caseId}: ${score.caseName}`);
    lines.push(`         Query: "${score.query}"`);
    lines.push(`         Doc family: ${score.detectedDocumentFamily ?? 'unknown'} (expected: ${score.caseId.startsWith('N') ? 'negative-control' : 'positive'})`);
    lines.push(`         Metrics: ${score.metricsFound}/${score.metricsExpected} matched (${(score.extractionScore * 100).toFixed(0)}%)`);

    if (score.costUsd !== undefined) {
      lines.push(`         Cost: $${score.costUsd.toFixed(4)} | ${score.inputTokens ?? 0} in / ${score.outputTokens ?? 0} out | ${score.elapsedSec?.toFixed(1) ?? '?'}s`);
    }

    if (score.caseId.startsWith('N')) {
      const negativeOutcome = describeNegativeControlOutcome(score);
      lines.push(`         Expected: ${negativeOutcome.expected}`);
      lines.push(`         Observed: ${negativeOutcome.observed}`);
      lines.push(`         Result: ${negativeOutcome.result}`);
    }

    // Show metric details
    for (const match of score.metricMatches) {
      if (match.found) {
        lines.push(`           + ${match.expected.metricType}: "${match.matchedValue}" [${match.matchedAssetClass ?? '-'}]`);
      } else {
        lines.push(`           - ${match.expected.metricType}: NOT FOUND — ${match.reason}`);
      }
    }

    // Show forbidden metric violations
    if (score.forbiddenMetricsFound.length > 0) {
      lines.push(`           ! FORBIDDEN metrics found: ${score.forbiddenMetricsFound.join(', ')}`);
    }

    lines.push(thinDivider);
  }

  return lines.join('\n');
}
