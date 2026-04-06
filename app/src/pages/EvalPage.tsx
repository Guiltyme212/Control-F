import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { representativeCases, runCase, buildRunSummary, formatReport } from '../eval';
import type { CaseScore, EvalRunSummary, GoldCase } from '../eval';

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
    pass: 'bg-emerald-500/20 text-emerald-400',
    partial: 'bg-amber-500/20 text-amber-400',
    weak: 'bg-orange-500/20 text-orange-400',
    'rejected-correctly': 'bg-emerald-500/20 text-emerald-400',
    'rejected-incorrectly': 'bg-red-500/20 text-red-400',
    fail: 'bg-red-500/20 text-red-400',
  };
  const labels: Record<string, string> = {
    pass: 'PASS', partial: 'PARTIAL', weak: 'WEAK',
    'rejected-correctly': 'REJECTED OK', 'rejected-incorrectly': 'REJECTED BAD', fail: 'FAIL',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${styles[grade] ?? 'bg-zinc-500/20 text-zinc-400'}`}>{labels[grade] ?? grade.toUpperCase()}</span>;
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
  const logRef = useRef<HTMLDivElement>(null);

  // Load previous run on mount
  useEffect(() => {
    fetch('/api/eval-runs')
      .then((r) => r.json())
      .then((runs: EvalRunSummary[]) => {
        if (runs.length > 0) setPreviousRun(runs[0]);
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
  }, [apiKey, log]);

  const scoreForCase = (id: string) => scores.find((s) => s.caseId === id);

  // Compute current stats for summary
  const currentPassRate = scores.length > 0
    ? scores.filter((s) => s.passed).length / scores.length
    : null;
  const currentAvgCost = scores.length > 0
    ? scores.reduce((sum, s) => sum + (s.costUsd ?? 0), 0) / scores.length
    : null;
  const currentAvgLatency = scores.length > 0
    ? scores.reduce((sum, s) => sum + (s.elapsedSec ?? 0), 0) / scores.length
    : null;
  const currentRejectRate = scores.length > 0
    ? scores.filter((s) => s.grade === 'rejected-correctly' || (s.grade === 'pass' && s.metricsExpected === 0 && s.metricsFound === 0)).length /
      Math.max(scores.filter((s) => representativeCases.find((gc) => gc.id === s.caseId)?.documentFamily === 'negative-control').length, 1)
    : null;
  const baselineRun = lastRunSummary ?? previousRun;
  const prevPassRate = baselineRun ? baselineRun.passed / Math.max(baselineRun.casesRun, 1) : null;
  const prevAvgCost = baselineRun ? baselineRun.totalCostUsd / Math.max(baselineRun.casesRun, 1) : null;
  const prevAvgLatency = baselineRun ? baselineRun.totalElapsedSec / Math.max(baselineRun.casesRun, 1) : null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Benchmark</h1>
          <p className="text-sm text-zinc-400 mt-1">
            5 representative cases — extraction correctness, reject behavior, cost, latency.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setLogs([]); setScores([]); setLastRunSummary(null); }}
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Pass Rate</div>
            <div className="text-2xl font-bold text-white">
              {currentPassRate !== null ? `${Math.round(currentPassRate * 100)}%` : prevPassRate !== null ? `${Math.round(prevPassRate * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {scores.length > 0
                ? `${scores.filter((s) => s.passed).length}/${scores.length} cases`
                : baselineRun ? `${baselineRun.passed}/${baselineRun.casesRun} (last run)` : 'No runs yet'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Avg Cost / Case</div>
            <div className="text-2xl font-bold text-white">
              {currentAvgCost !== null ? `$${currentAvgCost.toFixed(3)}` : prevAvgCost !== null ? `$${prevAvgCost.toFixed(3)}` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {scores.length > 0
                ? `$${scores.reduce((s, c) => s + (c.costUsd ?? 0), 0).toFixed(3)} total`
                : baselineRun ? `$${baselineRun.totalCostUsd.toFixed(3)} total (last run)` : ''}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Avg Latency</div>
            <div className="text-2xl font-bold text-white">
              {currentAvgLatency !== null ? `${currentAvgLatency.toFixed(0)}s` : prevAvgLatency !== null ? `${prevAvgLatency.toFixed(0)}s` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {scores.length > 0
                ? `${scores.reduce((s, c) => s + (c.elapsedSec ?? 0), 0).toFixed(0)}s total`
                : baselineRun ? `${baselineRun.totalElapsedSec.toFixed(0)}s total (last run)` : ''}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Neg. Control Reject</div>
            <div className="text-2xl font-bold text-white">
              {currentRejectRate !== null ? `${Math.round(currentRejectRate * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {scores.length > 0 ? 'of negative controls handled' : baselineRun ? `Last: ${baselineRun.passed}/${baselineRun.casesRun}` : 'No data'}
            </div>
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
                    <div className="text-[10px] text-zinc-400">
                      <span className="text-zinc-500">Expected:</span> reject &nbsp;
                      <span className="text-zinc-500">Observed:</span>{' '}
                      {s.forbiddenMetricsFound.length > 0
                        ? <span className="text-red-400">extracted {s.forbiddenMetricsFound.length} off-target metric(s)</span>
                        : <span className="text-emerald-400">correctly handled</span>}
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
