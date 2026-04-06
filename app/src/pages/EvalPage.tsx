import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { representativeCases, runCase, buildRunSummary, formatReport } from '../eval';
import type { CaseScore, EvalRunSummary, GoldCase } from '../eval';
import { describeNegativeControlOutcome, formatGradeLabel, getSummaryStats } from '../eval/scorer';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FAMILY_LABELS: Record<string, string> = {
  'transaction-report': 'Transaction / Event',
  'performance-update': 'Performance / Portfolio',
  'investment-memo': 'Investment Memo / DD',
  'board-agenda': 'Board / Agenda',
  'negative-control': 'Negative Control',
};

function gradeBadge(grade: string) {
  const styles: Record<string, string> = {
    pass: 'bg-emerald-500/20 text-emerald-300',
    partial: 'bg-amber-500/20 text-amber-300',
    weak: 'bg-orange-500/20 text-orange-300',
    'rejected-correctly': 'bg-emerald-500/20 text-emerald-300',
    'rejected-incorrectly': 'bg-red-500/20 text-red-300',
    fail: 'bg-red-500/20 text-red-300',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${styles[grade] ?? 'bg-zinc-500/20 text-zinc-400'}`}>{formatGradeLabel(grade as CaseScore['grade'])}</span>;
}

function formatDelta(current: number | null, baseline: number | null, decimals = 0, prefix = '', suffix = ''): string {
  if (current === null || baseline === null) return 'No prior run to compare';
  const delta = current - baseline;
  if (Math.abs(delta) < 0.000001) return 'No change vs last run';
  const sign = delta > 0 ? '+' : '-';
  return `vs last run: ${sign}${prefix}${Math.abs(delta).toFixed(decimals)}${suffix}`;
}

function formatCountDelta(current: number | null, baseline: number | null): string | null {
  if (current === null || baseline === null) return null;
  const delta = current - baseline;
  if (delta === 0) return null;
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function getPositiveSummaryCounts(summary: EvalRunSummary) {
  const positiveScores = summary.scores.filter((score) => !score.caseId.startsWith('N'));
  if (positiveScores.length === 0) {
    return {
      pass: summary.passed,
      partial: summary.partial,
      weak: summary.weak,
      fail: summary.failed,
    };
  }

  return {
    pass: positiveScores.filter((score) => score.grade === 'pass').length,
    partial: positiveScores.filter((score) => score.grade === 'partial').length,
    weak: positiveScores.filter((score) => score.grade === 'weak').length,
    fail: positiveScores.filter((score) => score.grade === 'fail' || score.grade === 'rejected-incorrectly').length,
  };
}

function getNegativeSummaryCounts(summary: EvalRunSummary) {
  const negativeScores = summary.scores.filter((score) => score.caseId.startsWith('N'));
  if (negativeScores.length === 0) {
    return {
      rejectedCorrectly: summary.rejectedCorrectly,
      rejectedIncorrectly: summary.rejectedIncorrectly,
    };
  }

  return {
    rejectedCorrectly: negativeScores.filter((score) => score.grade === 'rejected-correctly').length,
    rejectedIncorrectly: negativeScores.filter((score) => score.grade === 'rejected-incorrectly').length,
  };
}

type StoredEvalScore = Omit<Partial<CaseScore>, 'metricMatches'> & {
  found?: number;
  total?: number;
  forbiddenFound?: string[];
  metadata?: {
    document_type?: string;
  };
  metricMatches?: Array<{
    expected?: {
      metricType?: string;
      value?: string;
      valueIsPattern?: boolean;
      assetClass?: string;
      fund?: string;
      gp?: string;
    };
    found?: boolean;
    matchedValue?: string;
    matchedType?: string;
    matchedMetricType?: string;
    matchedAsset?: string;
    matchedAssetClass?: string;
    matchedFund?: string;
    matchedGp?: string;
    reason?: string;
  }>;
  metrics?: unknown[];
};

type StoredEvalSummary = Partial<EvalRunSummary> & {
  totalCost?: number;
  results?: StoredEvalScore[];
  scores?: StoredEvalScore[];
};

const representativeCaseById = new Map(representativeCases.map((goldCase) => [goldCase.id, goldCase]));

function normalizeStoredMetricMatches(rawMatches: StoredEvalScore['metricMatches']): CaseScore['metricMatches'] {
  if (!Array.isArray(rawMatches)) {
    return [];
  }

  return rawMatches.map((match) => ({
    expected: {
      metricType: match.expected?.metricType ?? '',
      value: match.expected?.value,
      valueIsPattern: match.expected?.valueIsPattern,
      assetClass: match.expected?.assetClass,
      fund: match.expected?.fund,
      gp: match.expected?.gp,
    },
    found: Boolean(match.found),
    matchedValue: match.matchedValue,
    matchedMetricType: match.matchedMetricType ?? match.matchedType,
    matchedAssetClass: match.matchedAssetClass ?? match.matchedAsset,
    matchedFund: match.matchedFund,
    matchedGp: match.matchedGp,
    reason: match.reason,
  }));
}

function normalizeStoredGrade(
  rawGrade: unknown,
  caseId: string,
  metricCount: number,
  documentType?: string,
): CaseScore['grade'] {
  const normalizedGrade = typeof rawGrade === 'string' ? rawGrade.toLowerCase() : '';

  if (caseId.startsWith('N')) {
    return documentType === 'rejected' || metricCount === 0
      ? 'rejected-correctly'
      : 'rejected-incorrectly';
  }

  if (documentType === 'rejected') {
    return 'rejected-incorrectly';
  }

  switch (normalizedGrade) {
    case 'pass':
      return 'pass';
    case 'partial':
      return 'partial';
    case 'weak':
      return 'weak';
    case 'rejected-correctly':
      return 'rejected-correctly';
    case 'rejected-incorrectly':
      return 'rejected-incorrectly';
    default:
      return metricCount > 0 ? 'weak' : 'fail';
  }
}

function normalizeStoredScore(rawScore: StoredEvalScore): CaseScore | null {
  const caseId = typeof rawScore.caseId === 'string' ? rawScore.caseId : '';
  if (!caseId) {
    return null;
  }

  const referenceCase = representativeCaseById.get(caseId);
  const metricMatches = normalizeStoredMetricMatches(rawScore.metricMatches);
  const metricsFound = typeof rawScore.metricsFound === 'number'
    ? rawScore.metricsFound
    : typeof rawScore.found === 'number'
      ? rawScore.found
      : metricMatches.filter((match) => match.found).length;
  const metricsExpected = typeof rawScore.metricsExpected === 'number'
    ? rawScore.metricsExpected
    : typeof rawScore.total === 'number'
      ? rawScore.total
      : metricMatches.length;
  const forbiddenMetricsFound = Array.isArray(rawScore.forbiddenMetricsFound)
    ? rawScore.forbiddenMetricsFound
    : Array.isArray(rawScore.forbiddenFound)
      ? rawScore.forbiddenFound
      : [];
  const detectedDocumentFamily = typeof rawScore.detectedDocumentFamily === 'string'
    ? rawScore.detectedDocumentFamily
    : rawScore.metadata?.document_type;
  const extractedMetricCount = Array.isArray(rawScore.metrics) ? rawScore.metrics.length : metricsFound;
  const grade = normalizeStoredGrade(rawScore.grade, caseId, extractedMetricCount, detectedDocumentFamily);
  const passed = grade === 'pass'
    || grade === 'rejected-correctly'
    || (grade === 'partial' && Boolean(referenceCase?.partialAcceptable));

  return {
    caseId,
    caseName: typeof rawScore.caseName === 'string' ? rawScore.caseName : referenceCase?.name ?? caseId,
    query: typeof rawScore.query === 'string' ? rawScore.query : referenceCase?.query ?? '',
    documentFamilyCorrect: typeof rawScore.documentFamilyCorrect === 'boolean'
      ? rawScore.documentFamilyCorrect
      : !caseId.startsWith('N'),
    detectedDocumentFamily,
    metricMatches,
    metricsFound,
    metricsExpected,
    extractionScore: metricsExpected > 0 ? metricsFound / metricsExpected : 1,
    forbiddenMetricsFound,
    negativePassed: forbiddenMetricsFound.length === 0,
    passed,
    grade,
    costUsd: typeof rawScore.costUsd === 'number' ? rawScore.costUsd : undefined,
    inputTokens: typeof rawScore.inputTokens === 'number' ? rawScore.inputTokens : undefined,
    outputTokens: typeof rawScore.outputTokens === 'number' ? rawScore.outputTokens : undefined,
    elapsedSec: typeof rawScore.elapsedSec === 'number' ? rawScore.elapsedSec : undefined,
    pagesReviewed: typeof rawScore.pagesReviewed === 'number' ? rawScore.pagesReviewed : undefined,
  };
}

function normalizeStoredSummary(rawSummary: unknown): EvalRunSummary | null {
  if (!rawSummary || typeof rawSummary !== 'object') {
    return null;
  }

  const storedSummary = rawSummary as StoredEvalSummary;
  const rawScores = Array.isArray(storedSummary.scores)
    ? storedSummary.scores
    : Array.isArray(storedSummary.results)
      ? storedSummary.results
      : [];
  const scores = rawScores
    .map(normalizeStoredScore)
    .filter((score): score is CaseScore => score !== null);

  if (scores.length === 0) {
    return null;
  }

  const summary = buildRunSummary(
    scores,
    typeof storedSummary.runId === 'string'
      ? storedSummary.runId
      : typeof storedSummary.timestamp === 'string'
        ? `stored-${storedSummary.timestamp}`
        : 'stored-eval',
  );
  const totalCostUsd = typeof storedSummary.totalCostUsd === 'number'
    ? storedSummary.totalCostUsd
    : typeof storedSummary.totalCost === 'number'
      ? storedSummary.totalCost
      : summary.totalCostUsd;
  const totalElapsedSec = typeof storedSummary.totalElapsedSec === 'number'
    ? storedSummary.totalElapsedSec
    : summary.totalElapsedSec;

  return {
    ...summary,
    timestamp: typeof storedSummary.timestamp === 'string' ? storedSummary.timestamp : summary.timestamp,
    totalCostUsd,
    averageCostUsd: totalCostUsd / Math.max(summary.casesRun, 1),
    totalElapsedSec,
    averageElapsedSec: totalElapsedSec / Math.max(summary.casesRun, 1),
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EvalPage() {
  const { apiKey } = useAppContext();
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [scores, setScores] = useState<CaseScore[]>([]);
  const [lastRunSummary, setLastRunSummary] = useState<EvalRunSummary | null>(null);
  const [previousRun, setPreviousRun] = useState<EvalRunSummary | null>(null);
  const [comparisonRun, setComparisonRun] = useState<EvalRunSummary | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Load previous run on mount
  useEffect(() => {
    fetch('/api/eval-runs')
      .then((r) => r.json())
      .then((runs: unknown[]) => {
        const normalizedRuns = Array.isArray(runs)
          ? runs
            .map(normalizeStoredSummary)
            .filter((run): run is EvalRunSummary => run !== null)
          : [];
        if (normalizedRuns.length > 0) {
          setPreviousRun(normalizedRuns[0]);
        }
      })
      .catch(() => {});
  }, []);

  const log = useCallback((msg: string, status?: 'info' | 'done' | 'error') => {
    const prefix = status === 'done' ? '[OK]' : status === 'error' ? '[ERR]' : '[..]';
    setLogs((prev) => [...prev, `${prefix} ${msg}`]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const handleRunCase = useCallback(async (goldCase: GoldCase) => {
    if (!apiKey) { log('No API key set', 'error'); return; }
    setRunning(true);
    setRunningCaseId(goldCase.id);
    log(`\n${'─'.repeat(50)}`);
    try {
      const result = await runCase(goldCase.id, apiKey, log);
      setScores((prev) => [...prev.filter((s) => s.caseId !== goldCase.id), result.score]);
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    setRunningCaseId(null);
    setRunning(false);
  }, [apiKey, log]);

  const handleRunBenchmark = useCallback(async () => {
    if (!apiKey) { log('No API key set', 'error'); return; }
    setRunning(true);
    setComparisonRun(lastRunSummary ?? previousRun);
    setScores([]);
    setLastRunSummary(null);

    const allScores: CaseScore[] = [];
    for (const gc of representativeCases) {
      setRunningCaseId(gc.id);
      log(`\n${'─'.repeat(50)}`);
      try {
        const result = await runCase(gc.id, apiKey, log);
        allScores.push(result.score);
        setScores([...allScores]);
      } catch (err) {
        log(`Error on ${gc.id}: ${err instanceof Error ? err.message : String(err)}`, 'error');
        allScores.push({
          caseId: gc.id, caseName: gc.name, query: gc.query,
          documentFamilyCorrect: false, metricMatches: [], metricsFound: 0,
          metricsExpected: gc.expectedMetrics.length, extractionScore: 0,
          forbiddenMetricsFound: [], negativePassed: false, passed: false, grade: 'fail',
        });
        setScores([...allScores]);
      }
    }

    const runSummary = buildRunSummary(allScores);
    setLastRunSummary(runSummary);
    log(`\n${formatReport(runSummary)}`);

    fetch('/api/save-eval-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runSummary),
    }).catch(() => {});

    setRunningCaseId(null);
    setRunning(false);
  }, [apiKey, lastRunSummary, log, previousRun]);

  const scoreForCase = (id: string) => scores.find((s) => s.caseId === id);
  const currentSummary = useMemo(
    () => (scores.length > 0 ? buildRunSummary(scores, 'current-preview') : null),
    [scores],
  );
  const currentStats = currentSummary ? getSummaryStats(currentSummary) : null;
  const currentPositiveCounts = currentSummary ? getPositiveSummaryCounts(currentSummary) : null;
  const currentNegativeCounts = currentSummary ? getNegativeSummaryCounts(currentSummary) : null;
  const baselineRun = comparisonRun ?? previousRun;
  const baselineStats = baselineRun ? getSummaryStats(baselineRun) : null;
  const baselinePositiveCounts = baselineRun ? getPositiveSummaryCounts(baselineRun) : null;
  const baselineNegativeCounts = baselineRun ? getNegativeSummaryCounts(baselineRun) : null;
  const summaryToDisplay = currentSummary ?? lastRunSummary ?? previousRun;
  const summaryStats = summaryToDisplay ? getSummaryStats(summaryToDisplay) : null;
  const summaryPositiveCounts = summaryToDisplay ? getPositiveSummaryCounts(summaryToDisplay) : null;
  const summaryNegativeCounts = summaryToDisplay ? getNegativeSummaryCounts(summaryToDisplay) : null;
  const positiveQualityDelta = currentSummary && baselineRun
    ? [
        formatCountDelta(currentPositiveCounts?.pass ?? null, baselinePositiveCounts?.pass ?? null) && `Pass ${formatCountDelta(currentPositiveCounts?.pass ?? null, baselinePositiveCounts?.pass ?? null)}`,
        formatCountDelta(currentPositiveCounts?.partial ?? null, baselinePositiveCounts?.partial ?? null) && `Partial ${formatCountDelta(currentPositiveCounts?.partial ?? null, baselinePositiveCounts?.partial ?? null)}`,
        formatCountDelta(currentPositiveCounts?.weak ?? null, baselinePositiveCounts?.weak ?? null) && `Weak ${formatCountDelta(currentPositiveCounts?.weak ?? null, baselinePositiveCounts?.weak ?? null)}`,
        formatCountDelta(currentPositiveCounts?.fail ?? null, baselinePositiveCounts?.fail ?? null) && `Fail ${formatCountDelta(currentPositiveCounts?.fail ?? null, baselinePositiveCounts?.fail ?? null)}`,
      ].filter(Boolean).join(' • ')
    : '';
  const negativeDelta = currentSummary && baselineRun
    ? formatCountDelta(currentNegativeCounts?.rejectedCorrectly ?? null, baselineNegativeCounts?.rejectedCorrectly ?? null)
      ? `Rejected correctly ${formatCountDelta(currentNegativeCounts?.rejectedCorrectly ?? null, baselineNegativeCounts?.rejectedCorrectly ?? null)}`
      : ''
    : '';
  const costDelta = currentStats && baselineStats
    ? formatDelta(currentStats.averageCostUsd, baselineStats.averageCostUsd, 4, '$')
    : '';
  const latencyDelta = currentStats && baselineStats
    ? formatDelta(currentStats.averageElapsedSec, baselineStats.averageElapsedSec, 0, '', 's')
    : '';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Benchmark</h1>
          <p className="text-sm text-zinc-400 mt-1">
            5 representative cases — positive quality, reject correctness, cost, and latency.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setLogs([]); setScores([]); setLastRunSummary(null); setComparisonRun(null); }}
            disabled={running}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={handleRunBenchmark}
            disabled={running || !apiKey}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 font-medium"
          >
            {running ? 'Running...' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {!apiKey && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-400">
          Set your Anthropic API key in Settings before running.
        </div>
      )}

      {/* Compact benchmark summary — always visible */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Positive quality</div>
            <div className="text-2xl font-bold text-white">
              {summaryToDisplay && summaryStats && summaryPositiveCounts ? `${summaryPositiveCounts.pass}/${summaryStats.positiveCases} pass` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {summaryToDisplay && summaryPositiveCounts
                ? `${summaryPositiveCounts.partial} partial · ${summaryPositiveCounts.weak} weak · ${summaryPositiveCounts.fail} fail`
                : 'No runs yet'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">{positiveQualityDelta || (baselineRun ? 'No change vs last run' : 'No prior run to compare')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Negative controls</div>
            <div className="text-2xl font-bold text-white">
              {summaryToDisplay && summaryStats && summaryNegativeCounts ? `${summaryNegativeCounts.rejectedCorrectly}/${summaryStats.negativeCases} rejected` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {summaryToDisplay && summaryNegativeCounts
                ? `${summaryNegativeCounts.rejectedIncorrectly} rejected incorrectly`
                : 'No runs yet'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">{negativeDelta || (baselineRun ? 'No change vs last run' : 'No prior run to compare')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Avg cost / case</div>
            <div className="text-2xl font-bold text-white">
              {summaryStats ? `$${summaryStats.averageCostUsd.toFixed(3)}` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {summaryToDisplay ? `$${summaryToDisplay.totalCostUsd.toFixed(4)} total` : 'No runs yet'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">{costDelta || 'No prior run to compare'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Avg latency / case</div>
            <div className="text-2xl font-bold text-white">
              {summaryStats ? `${summaryStats.averageElapsedSec.toFixed(0)}s` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {summaryToDisplay ? `${summaryToDisplay.totalElapsedSec.toFixed(1)}s total` : 'No runs yet'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">{latencyDelta || 'No prior run to compare'}</div>
          </div>
        </div>
      </div>

      {/* Case cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {representativeCases.map((gc) => {
          const s = scoreForCase(gc.id);
          const isRunning = runningCaseId === gc.id;
          const isNegative = gc.documentFamily === 'negative-control';

          return (
            <div
              key={gc.id}
              className={`bg-zinc-900/80 border rounded-lg p-4 transition-all ${
                isRunning ? 'border-blue-500/50 ring-1 ring-blue-500/20' :
                s ? (s.passed ? 'border-emerald-500/30' : 'border-red-500/30') :
                'border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      isNegative ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {gc.id}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {FAMILY_LABELS[gc.documentFamily] ?? gc.documentFamily}
                    </span>
                    {s && gradeBadge(s.grade)}
                  </div>
                  <p className="text-sm text-white font-medium mt-1 truncate">{gc.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">"{gc.query}"</p>
                </div>
                <button
                  onClick={() => handleRunCase(gc)}
                  disabled={running}
                  className="ml-3 shrink-0 px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30"
                >
                  {isRunning ? '...' : 'Run'}
                </button>
              </div>

              {/* Metric badges */}
              <div className="flex flex-wrap gap-1 mt-2">
                {gc.expectedMetrics.map((em, i) => {
                  const match = s?.metricMatches[i];
                  return (
                    <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${
                      match?.found ? 'bg-emerald-500/15 text-emerald-400' :
                      match && !match.found ? 'bg-red-500/15 text-red-400' :
                      'bg-zinc-800 text-zinc-500'
                    }`}>
                      {em.metricType}{em.assetClass ? ` (${em.assetClass})` : ''}
                    </span>
                  );
                })}
                {isNegative && gc.forbiddenMetrics?.map((fm) => (
                  <span key={fm} className={`text-[10px] px-1.5 py-0.5 rounded ${
                    s?.forbiddenMetricsFound.includes(fm) ? 'bg-red-500/15 text-red-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    !{fm}
                  </span>
                ))}
              </div>

              {/* Score line */}
              {s && (
                <div className="mt-2 space-y-1">
                  {isNegative ? (
                    <div className="text-[10px] text-zinc-400 space-y-0.5">
                      {(() => {
                        const outcome = describeNegativeControlOutcome(s);
                        return (
                          <>
                            <div><span className="text-zinc-500">Expected:</span> {outcome.expected}</div>
                            <div><span className="text-zinc-500">Observed:</span> {outcome.observed}</div>
                            <div><span className="text-zinc-500">Result:</span> {outcome.result}</div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-[10px] text-zinc-500">{s.metricsFound}/{s.metricsExpected} metrics matched</div>
                  )}
                  <div className="text-[10px] text-zinc-500 flex gap-4">
                    {s.costUsd !== undefined && <span>${s.costUsd.toFixed(4)}</span>}
                    {s.elapsedSec !== undefined && <span>{s.elapsedSec.toFixed(1)}s</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Log output — below the fold */}
      {logs.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg">
          <div className="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500 font-medium">Log</div>
          <div ref={logRef} className="p-4 max-h-64 overflow-y-auto font-mono text-xs text-zinc-400 whitespace-pre-wrap">
            {logs.join('\n')}
          </div>
        </div>
      )}
    </div>
  );
}
