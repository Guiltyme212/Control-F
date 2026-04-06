import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, ShieldCheck, ShieldAlert, AlertTriangle, XCircle, ChevronDown, Search, Target, ScanSearch } from 'lucide-react';
import { representativeCases, buildRunSummary } from '../eval';
import type { CaseScore, EvalRunSummary } from '../eval';
import { describeNegativeControlOutcome, getSummaryStats } from '../eval/scorer';

/* ------------------------------------------------------------------ */
/*  Stored-run normalization                                           */
/* ------------------------------------------------------------------ */

type StoredEvalScore = Omit<Partial<CaseScore>, 'metricMatches'> & {
  found?: number; total?: number; forbiddenFound?: string[];
  earlyRejected?: boolean;
  metadata?: { document_type?: string };
  metricMatches?: Array<{
    expected?: { metricType?: string; value?: string; valueIsPattern?: boolean; assetClass?: string; fund?: string; gp?: string };
    found?: boolean; matchedValue?: string; matchedType?: string; matchedMetricType?: string;
    matchedAsset?: string; matchedAssetClass?: string; matchedFund?: string; matchedGp?: string; reason?: string;
  }>;
  metrics?: unknown[];
};

type StoredEvalSummary = Partial<EvalRunSummary> & {
  totalCost?: number; results?: StoredEvalScore[]; scores?: StoredEvalScore[];
};

const caseById = new Map(representativeCases.map((gc) => [gc.id, gc]));

function normalizeStoredScore(raw: StoredEvalScore): CaseScore | null {
  const caseId = typeof raw.caseId === 'string' ? raw.caseId : '';
  if (!caseId) return null;
  const ref = caseById.get(caseId);
  const metricMatches = Array.isArray(raw.metricMatches) ? raw.metricMatches.map((m) => ({
    expected: { metricType: m.expected?.metricType ?? '', value: m.expected?.value, valueIsPattern: m.expected?.valueIsPattern, assetClass: m.expected?.assetClass, fund: m.expected?.fund, gp: m.expected?.gp },
    found: Boolean(m.found), matchedValue: m.matchedValue, matchedMetricType: m.matchedMetricType ?? m.matchedType,
    matchedAssetClass: m.matchedAssetClass ?? m.matchedAsset, matchedFund: m.matchedFund, matchedGp: m.matchedGp, reason: m.reason,
  })) : [];
  const metricsFound = typeof raw.metricsFound === 'number' ? raw.metricsFound : typeof raw.found === 'number' ? raw.found : metricMatches.filter((m) => m.found).length;
  const metricsExpected = typeof raw.metricsExpected === 'number' ? raw.metricsExpected : typeof raw.total === 'number' ? raw.total : metricMatches.length;
  const forbiddenMetricsFound = Array.isArray(raw.forbiddenMetricsFound) ? raw.forbiddenMetricsFound : Array.isArray(raw.forbiddenFound) ? raw.forbiddenFound : [];
  const detectedDocumentFamily = typeof raw.detectedDocumentFamily === 'string' ? raw.detectedDocumentFamily : raw.metadata?.document_type;
  const extractedCount = Array.isArray(raw.metrics) ? raw.metrics.length : metricsFound;
  const wasEarlyRejected = raw.earlyRejected === true || detectedDocumentFamily === 'rejected';

  let grade: CaseScore['grade'];
  if (caseId.startsWith('N')) {
    if (wasEarlyRejected) {
      grade = 'rejected-correctly';
    } else if (forbiddenMetricsFound.length === 0) {
      grade = 'handled-safely';
    } else {
      grade = 'rejected-incorrectly';
    }
  } else if (detectedDocumentFamily === 'rejected') {
    grade = 'rejected-incorrectly';
  } else {
    const ng = typeof raw.grade === 'string' ? raw.grade.toLowerCase().replace(/_/g, '-') : '';
    if (ng === 'pass') grade = 'pass';
    else if (ng === 'partial') grade = 'partial';
    else if (ng === 'weak') grade = 'weak';
    else grade = extractedCount > 0 ? 'weak' : 'fail';
  }

  const passed = grade === 'pass' || grade === 'rejected-correctly' || grade === 'handled-safely' || (grade === 'partial' && Boolean(ref?.partialAcceptable));
  return {
    caseId, caseName: typeof raw.caseName === 'string' ? raw.caseName : ref?.name ?? caseId,
    query: typeof raw.query === 'string' ? raw.query : ref?.query ?? '',
    documentFamilyCorrect: typeof raw.documentFamilyCorrect === 'boolean' ? raw.documentFamilyCorrect : !caseId.startsWith('N'),
    detectedDocumentFamily, metricMatches, metricsFound, metricsExpected,
    extractionScore: metricsExpected > 0 ? metricsFound / metricsExpected : 1,
    forbiddenMetricsFound, negativePassed: forbiddenMetricsFound.length === 0, passed, grade,
    costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : undefined,
    inputTokens: typeof raw.inputTokens === 'number' ? raw.inputTokens : undefined,
    outputTokens: typeof raw.outputTokens === 'number' ? raw.outputTokens : undefined,
    elapsedSec: typeof raw.elapsedSec === 'number' ? raw.elapsedSec : undefined,
  };
}

function normalizeStoredSummary(raw: unknown): EvalRunSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as StoredEvalSummary;
  const rawScores = Array.isArray(s.scores) ? s.scores : Array.isArray(s.results) ? s.results : [];
  const scores = rawScores.map(normalizeStoredScore).filter((x): x is CaseScore => x !== null);
  if (scores.length === 0) return null;
  const summary = buildRunSummary(scores, typeof s.runId === 'string' ? s.runId : 'stored-eval');
  const totalCostUsd = typeof s.totalCostUsd === 'number' ? s.totalCostUsd : typeof s.totalCost === 'number' ? s.totalCost : summary.totalCostUsd;
  const totalElapsedSec = typeof s.totalElapsedSec === 'number' ? s.totalElapsedSec : summary.totalElapsedSec;
  return { ...summary, timestamp: typeof s.timestamp === 'string' ? s.timestamp : summary.timestamp, totalCostUsd, averageCostUsd: totalCostUsd / Math.max(summary.casesRun, 1), totalElapsedSec, averageElapsedSec: totalElapsedSec / Math.max(summary.casesRun, 1) };
}

/* ------------------------------------------------------------------ */
/*  Case metadata                                                      */
/* ------------------------------------------------------------------ */

const CASE_META: Record<string, { document: string; question: string; family: string }> = {
  G1: { document: 'NY State CRF — Monthly Transaction Report', question: 'What was the T. Rowe Price termination?', family: 'Transaction report' },
  G5: { document: 'Santa Barbara County — Private Real Return Update', question: 'What is the one-year net IRR?', family: 'Performance report' },
  G9: { document: 'NJ State Investment Council — Ardian ASF IX Memo', question: 'What are the target return and fund size?', family: 'Investment memo' },
  N1: { document: 'Bridgepoint Group — Corporate Annual Report', question: 'IRR, TVPI, DPI, NAV from private markets?', family: 'Negative control' },
  N2: { document: 'DCRB — Board Meeting Minutes', question: 'IRR, TVPI, DPI from private markets?', family: 'Negative control' },
};

/* ------------------------------------------------------------------ */
/*  Visual helpers                                                     */
/* ------------------------------------------------------------------ */

function caseIcon(s: CaseScore) {
  if (s.grade === 'pass') return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
  if (s.grade === 'rejected-correctly') return <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />;
  if (s.grade === 'handled-safely') return <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0" />;
  if (s.grade === 'partial' || s.grade === 'weak') return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
  return <XCircle className="w-5 h-5 text-red-400 shrink-0" />;
}

function outcomeLabel(s: CaseScore): string {
  if (s.grade === 'pass') return 'Correct';
  if (s.grade === 'rejected-correctly') return 'Blocked';
  if (s.grade === 'handled-safely') return 'Handled safely';
  if (s.grade === 'partial') return 'Partially correct';
  if (s.grade === 'weak') return 'Weak match';
  if (s.grade === 'rejected-incorrectly') return 'Needs improvement';
  return 'Failed';
}

function outcomeColor(s: CaseScore): string {
  if (s.passed) return 'text-emerald-400';
  if (s.grade === 'partial' || s.grade === 'weak') return 'text-amber-400';
  return 'text-red-400';
}

function cardBorder(s: CaseScore | undefined): string {
  if (!s) return 'border-zinc-800';
  if (s.passed) return 'border-emerald-500/20';
  if (s.grade === 'partial' || s.grade === 'weak') return 'border-amber-500/20';
  return 'border-red-500/20';
}

function formatExpectedMetricLabel(match: CaseScore['metricMatches'][number]): string {
  const expected = match.expected;
  const parts = [expected.metricType];
  if (expected.value && !expected.valueIsPattern) {
    parts.push(expected.value);
  } else if (expected.value && expected.metricType === 'IRR') {
    parts.push(expected.value);
  } else if (expected.value && expected.metricType === 'Target Return') {
    parts.push('targeted');
  }
  return parts.join(': ');
}

function extractPdfLabel(pdfPath: string | undefined): string {
  if (!pdfPath) return '';
  const parts = pdfPath.split(/[\\/]/);
  return parts[parts.length - 1] ?? pdfPath;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EvalPage() {
  const [scores, setScores] = useState<CaseScore[]>([]);
  const [lastRunSummary, setLastRunSummary] = useState<EvalRunSummary | null>(null);
  const [previousRun, setPreviousRun] = useState<EvalRunSummary | null>(null);
  const [comparisonRun, setComparisonRun] = useState<EvalRunSummary | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Load saved results on mount
  useEffect(() => {
    fetch('/api/eval-runs')
      .then((r) => r.json())
      .then((runs: unknown[]) => {
        const normalized = Array.isArray(runs) ? runs.map(normalizeStoredSummary).filter((r): r is EvalRunSummary => r !== null) : [];
        if (normalized.length > 0) {
          const latest = normalized[0];
          setPreviousRun(latest);
          if (latest.scores.length > 0) { setScores(latest.scores); setLastRunSummary(latest); }
          if (normalized.length > 1) {
            setComparisonRun(normalized[1]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const scoreFor = (id: string) => scores.find((s) => s.caseId === id);
  const summary = useMemo(() => scores.length > 0 ? buildRunSummary(scores) : null, [scores]);
  const stats = summary ? getSummaryStats(summary) : null;
  const hasResults = scores.length > 0;
  const positiveScores = scores.filter((s) => !s.caseId.startsWith('N'));
  const negativeScores = scores.filter((s) => s.caseId.startsWith('N'));
  const positivePassing = positiveScores.filter((s) => s.passed).length;
  const blockedCount = negativeScores.filter((s) => s.grade === 'rejected-correctly').length;
  const safeCount = negativeScores.filter((s) => s.grade === 'handled-safely').length;
  const negHandled = blockedCount + safeCount;
  const displaySummary = lastRunSummary ?? previousRun;
  const lastDate = (lastRunSummary ?? previousRun)?.timestamp
    ? new Date((lastRunSummary ?? previousRun)!.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const baselinePositivePassing = comparisonRun?.scores.filter((s) => !s.caseId.startsWith('N') && s.passed).length ?? null;
  const baselineAvgCost = comparisonRun ? comparisonRun.totalCostUsd / Math.max(comparisonRun.casesRun, 1) : null;
  const baselineAvgTime = comparisonRun ? comparisonRun.totalElapsedSec / Math.max(comparisonRun.casesRun, 1) : null;

  const renderCaseCard = (gc: typeof representativeCases[number]) => {
    const s = scoreFor(gc.id);
    const meta = CASE_META[gc.id];
    const isNeg = gc.documentFamily === 'negative-control';
    const observedMatches = s?.metricMatches.filter((m) => m.found) ?? [];
    const negativeOutcome = s && isNeg ? describeNegativeControlOutcome(s) : null;
    const pdfLabel = extractPdfLabel(gc.evidencePdf);

    return (
      <div key={gc.id} className={`bg-zinc-900/55 border rounded-2xl p-5 transition-all shadow-[0_12px_32px_rgba(0,0,0,0.18)] ${cardBorder(s)}`}>
        <div className="flex gap-4">
          <div className="pt-0.5 shrink-0">
            {s ? caseIcon(s) : <div className="w-5 h-5 rounded-full border border-zinc-700" />}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                {gc.id}
              </span>
              <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                {meta?.family}
              </span>
              {pdfLabel && (
                <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  {pdfLabel}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm text-white font-medium">{meta?.document ?? gc.name}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">Known evidence PDF from the local proof set</div>
              </div>
              {s && (
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  s.passed
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : s.grade === 'partial' || s.grade === 'weak'
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                      : 'border-red-500/25 bg-red-500/10 text-red-300'
                }`}>
                  {outcomeLabel(s)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/65 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <Search className="w-3.5 h-3.5" />
                  Query
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-300 break-words">
                  {gc.query}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/65 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <Target className="w-3.5 h-3.5" />
                  Expected
                </div>
                {isNeg ? (
                  <div className="space-y-2">
                    <p className="text-[13px] leading-relaxed text-zinc-300">
                      Reject this PDF early or return no target metric.
                    </p>
                    {gc.forbiddenMetrics && gc.forbiddenMetrics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {gc.forbiddenMetrics.map((metric) => (
                          <span key={metric} className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                            No {metric}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {s?.metricMatches.map((match, index) => (
                      <span key={`${match.expected.metricType}-${index}`} className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                        {formatExpectedMetricLabel(match)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/65 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <ScanSearch className="w-3.5 h-3.5" />
                  Observed
                </div>
                {s && !isNeg && observedMatches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {observedMatches.map((match, index) => (
                      <span key={`${match.expected.metricType}-${index}`} className="rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                        {match.expected.metricType}: {match.matchedValue}
                      </span>
                    ))}
                  </div>
                )}

                {negativeOutcome && (
                  <p className="text-[13px] leading-relaxed text-zinc-300">
                    {negativeOutcome.observed}
                  </p>
                )}

                {s && !isNeg && observedMatches.length === 0 && (
                  <p className="text-[13px] leading-relaxed text-zinc-500">
                    No target metric was captured in this run.
                  </p>
                )}
              </div>
            </div>

            {s && (
              <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/55 px-3 py-2 text-[10px] text-zinc-500">
                <span className="font-medium text-zinc-400">Verdict:</span>
                <span className={outcomeColor(s)}>{outcomeLabel(s)}</span>
                {s.costUsd !== undefined && <span>${s.costUsd.toFixed(4)}</span>}
                {s.elapsedSec !== undefined && <span>{s.elapsedSec.toFixed(1)}s</span>}
                {s.inputTokens !== undefined && <span>{(s.inputTokens / 1000).toFixed(0)}k in / {((s.outputTokens ?? 0) / 1000).toFixed(0)}k out</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
              Giulio Proof Set
            </span>
            {displaySummary && (
              <span className="text-[11px] text-zinc-500">
                {`5-case local benchmark from known evidence PDFs${lastDate ? ` • verified ${lastDate}` : ''}`}
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-600">
            Saved proof page, not a live browser test runner
          </span>
        </div>

        {/* ── Hero ── */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-4">Extraction Proof</p>
          {hasResults ? (
            <>
              <h1 className="text-4xl font-bold text-white leading-tight">
                <><span className="text-emerald-400">{positivePassing}/3</span> answer cases correct. <span className="text-emerald-400">{negHandled}/2</span> safety cases handled.</>
              </h1>
              <p className="text-sm text-zinc-500 mt-3 max-w-lg mx-auto">
                We queried real pension fund documents — transaction reports, performance updates, investment memos, and known junk — and verified every answer.
              </p>
              {lastDate && <p className="text-xs text-zinc-600 mt-2">Last verified: {lastDate}</p>}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-zinc-500">No results yet</h1>
              <p className="text-sm text-zinc-600 mt-2">Run the benchmark to test the extraction pipeline against real documents.</p>
            </>
          )}
        </div>

        {hasResults && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                title: 'What this proves',
                text: 'The product can pull specific answers from the right pension document when the PDF is already known.',
              },
              {
                title: 'What it avoids',
                text: 'It blocks obvious off-target corporate documents and handles noisy governance docs without inventing metrics.',
              },
              {
                title: 'What this does not prove',
                text: 'This page does not measure live website search, source routing, or PDF ranking accuracy yet.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-2">{item.title}</div>
                <p className="text-sm text-zinc-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Stats ── */}
        {hasResults && stats && (
          <div className="grid grid-cols-4 gap-px bg-zinc-800/50 rounded-xl overflow-hidden">
            {[
              {
                label: 'Answer accuracy',
                value: `${positivePassing} of ${positiveScores.length}`,
                sub: baselinePositivePassing !== null
                  ? `${positivePassing === baselinePositivePassing ? 'Unchanged' : positivePassing > baselinePositivePassing ? 'Improved' : 'Below previous'} vs previous saved run`
                  : 'Transaction, performance, memo',
              },
              {
                label: 'Safety accuracy',
                value: `${negHandled} of ${negativeScores.length}`,
                sub: blockedCount > 0 && safeCount > 0 ? `${blockedCount} blocked, ${safeCount} handled safely` : blockedCount > 0 ? `${blockedCount} blocked before extraction` : `${safeCount} handled safely`,
              },
              {
                label: 'Cost per query',
                value: `$${stats.averageCostUsd.toFixed(2)}`,
                sub: baselineAvgCost !== null
                  ? `${stats.averageCostUsd <= baselineAvgCost ? 'Stable / lower' : 'Higher'} vs previous (${baselineAvgCost.toFixed(2)})`
                  : `$${summary!.totalCostUsd.toFixed(2)} total for ${scores.length} queries`,
              },
              {
                label: 'Response time',
                value: `${stats.averageElapsedSec.toFixed(0)}s`,
                sub: baselineAvgTime !== null
                  ? `${stats.averageElapsedSec <= baselineAvgTime ? 'Faster / stable' : 'Slower'} vs previous (${baselineAvgTime.toFixed(0)}s)`
                  : `${summary!.totalElapsedSec.toFixed(0)}s total`,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-zinc-900/80 p-5 text-center">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{stat.label}</div>
                <div className="text-xl font-semibold text-white">{stat.value}</div>
                <div className="text-[10px] text-zinc-600 mt-1">{stat.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Test cases ── */}
        {hasResults && (
          <div className="space-y-8">
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-300">Answer cases</h2>
                <p className="text-xs text-zinc-500 mt-1">These tests ask for a real metric from a known pension PDF. Passing means the target metric was found directly in the document.</p>
              </div>
              {representativeCases
                .filter((gc) => gc.documentFamily !== 'negative-control')
                .map(renderCaseCard)}
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-300">Safety cases</h2>
                <p className="text-xs text-zinc-500 mt-1">These tests use the wrong or noisy PDF on purpose. Passing means the system blocked it early or returned no false target metric.</p>
              </div>
              {representativeCases
                .filter((gc) => gc.documentFamily === 'negative-control')
                .map(renderCaseCard)}
            </div>
          </div>
        )}

        {/* ── Expandable details ── */}
        {hasResults && (
          <div className="flex flex-col items-center gap-3">
            <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              {showDetails ? 'Hide' : 'View'} full extraction details
            </button>
          </div>
        )}

        {showDetails && hasResults && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5 space-y-4 text-xs">
            <h3 className="text-zinc-500 uppercase tracking-wider text-[10px] font-medium">Per-case breakdown</h3>
            {scores.map((s) => (
              <div key={s.caseId} className="space-y-0.5 text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-600">{s.caseId}</span>
                  <span className="text-white font-medium">{s.caseName}</span>
                  <span className={outcomeColor(s)}>{outcomeLabel(s)}</span>
                </div>
                <div className="pl-7 text-zinc-600">
                  Query: "{s.query}" | Metrics: {s.metricsFound}/{s.metricsExpected}
                  {s.costUsd !== undefined && ` | $${s.costUsd.toFixed(4)}`}
                  {s.elapsedSec !== undefined && ` | ${s.elapsedSec.toFixed(1)}s`}
                  {s.inputTokens !== undefined && ` | ${s.inputTokens} in / ${s.outputTokens} out`}
                </div>
                {s.metricMatches.map((m, i) => (
                  <div key={i} className="pl-7">
                    {m.found
                      ? <span className="text-emerald-600">+ {m.expected.metricType}: "{m.matchedValue}" [{m.matchedAssetClass ?? '-'}]</span>
                      : <span className="text-red-700">- {m.expected.metricType}: {m.reason}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center pb-6">
          <p className="text-[11px] text-zinc-600">
            Refresh this page by re-running the local 5-case benchmark, not by clicking through the browser flow.
          </p>
        </div>

      </div>
    </div>
  );
}
