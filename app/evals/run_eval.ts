/**
 * Control F — Extraction Eval Runner
 *
 * Scores run artifacts (from browser extraction runs) against gold cases.
 *
 * Usage:
 *   cd app && npx tsx evals/run_eval.ts
 *
 * Gold cases:  evals/gold_cases.json
 * Run artifacts: evals/runs/*.json   (one file per run)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const pass = `${GREEN}PASS${RESET}`;
const fail = `${RED}FAIL${RESET}`;
const na = `${DIM}N/A${RESET}`;
const warn = `${YELLOW}WARN${RESET}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GoldCase {
  id: string;
  query: string;
  fund: string;
  expected_source_family: string;
  expected_file_pattern: string;
  expected_metric_types: string[];
  expected_asset_classes: string[];
  must_not_count_asset_classes: string[];
  allowed_partial: boolean;
  notes: string;
}

interface RunMetric {
  metric: string;
  asset_class: string;
  value: string;
  page: number;
  evidence: string;
  confidence: string;
}

interface RunArtifact {
  id: string;
  timestamp: string;
  query: string;
  fund: string;
  selected_source: {
    label: string;
    document_type: string;
    url: string;
  };
  selected_pdf: {
    filename: string;
    source_label: string;
    preview_score: number | null;
  };
  retry_pdf: {
    filename: string;
    source_label: string;
  } | null;
  reviewed_pages: number[];
  total_pages: number;
  metrics: RunMetric[];
  coverage_score: number;
  completeness_label: string;
  proxy_hits: string[];
  cost_usd: number;
  elapsed_sec: number;
  documents_used: number;
}

interface DimensionResult {
  name: string;
  passed: boolean | null; // null = N/A
  detail: string;
}

interface CaseResult {
  id: string;
  fund: string;
  query: string;
  dimensions: DimensionResult[];
  cost_usd: number;
  elapsed_sec: number;
  cost_flagged: boolean;
  latency_flagged: boolean;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const EVALS_DIR = path.resolve(__dirname);
const GOLD_PATH = path.join(EVALS_DIR, "gold_cases.json");
const RUNS_DIR = path.join(EVALS_DIR, "runs");

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
function loadGoldCases(): GoldCase[] {
  if (!fs.existsSync(GOLD_PATH)) {
    console.error(`${RED}ERROR:${RESET} Gold cases file not found at ${GOLD_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(GOLD_PATH, "utf-8");
  try {
    return JSON.parse(raw) as GoldCase[];
  } catch (e) {
    console.error(`${RED}ERROR:${RESET} Failed to parse gold_cases.json — ${e}`);
    process.exit(1);
  }
}

function loadRunArtifacts(): RunArtifact[] {
  if (!fs.existsSync(RUNS_DIR)) {
    return [];
  }
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
  const artifacts: RunArtifact[] = [];
  for (const file of files) {
    const fp = path.join(RUNS_DIR, file);
    try {
      const raw = fs.readFileSync(fp, "utf-8");
      const parsed = JSON.parse(raw) as RunArtifact;
      if (!parsed.id) {
        console.warn(`${YELLOW}WARN:${RESET} Skipping ${file} — missing "id" field`);
        continue;
      }
      artifacts.push(parsed);
    } catch (e) {
      console.warn(`${YELLOW}WARN:${RESET} Skipping ${file} — ${e}`);
    }
  }
  return artifacts;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * Source-family correctness (pass/fail).
 * Gold's expected_source_family is pipe-separated alternatives.
 * Run's selected_source.document_type must match one.
 */
function scoreSourceFamily(gold: GoldCase, run: RunArtifact): DimensionResult {
  const alternatives = gold.expected_source_family.split("|").map((s) => s.trim().toLowerCase());
  const actual = (run.selected_source?.document_type ?? "").toLowerCase();

  if (!actual) {
    return { name: "Source family", passed: false, detail: "No document_type on selected_source" };
  }

  const matched = alternatives.some((alt) => actual.includes(alt));
  return {
    name: "Source family",
    passed: matched,
    detail: matched
      ? `"${actual}" matches expected [${alternatives.join(", ")}]`
      : `"${actual}" does NOT match any of [${alternatives.join(", ")}]`,
  };
}

/**
 * File-family correctness (pass/fail).
 * Gold's expected_file_pattern is pipe-separated patterns.
 * Run's selected_pdf.filename (lowercased) must match at least one.
 */
function scoreFileFamily(gold: GoldCase, run: RunArtifact): DimensionResult {
  const patterns = gold.expected_file_pattern.split("|").map((s) => s.trim().toLowerCase());
  const filename = (run.selected_pdf?.filename ?? "").toLowerCase();

  if (!filename) {
    return { name: "File family", passed: false, detail: "No filename on selected_pdf" };
  }

  const matched = patterns.some((pat) => filename.includes(pat));
  return {
    name: "File family",
    passed: matched,
    detail: matched
      ? `"${filename}" matches pattern [${patterns.join(", ")}]`
      : `"${filename}" does NOT match any of [${patterns.join(", ")}]`,
  };
}

/**
 * Metric-type correctness (score 0-1).
 * Fraction of expected_metric_types found in run metrics.
 */
function scoreMetricTypes(gold: GoldCase, run: RunArtifact): DimensionResult {
  if (!gold.expected_metric_types || gold.expected_metric_types.length === 0) {
    return { name: "Metric types", passed: null, detail: "No expected metric types (N/A)" };
  }

  const foundTypes = new Set(
    (run.metrics ?? []).map((m) => m.metric?.toUpperCase().trim())
  );

  const expected = gold.expected_metric_types;
  const hits: string[] = [];
  const misses: string[] = [];

  for (const mt of expected) {
    const upper = mt.toUpperCase().trim();
    if (foundTypes.has(upper)) {
      hits.push(mt);
    } else {
      misses.push(mt);
    }
  }

  const score = hits.length / expected.length;
  const passed = score >= 0.5; // at least half found
  const pct = Math.round(score * 100);

  let detail = `${hits.length}/${expected.length} found (${pct}%)`;
  if (misses.length > 0) detail += ` — missing: ${misses.join(", ")}`;
  if (hits.length > 0) detail += ` — found: ${hits.join(", ")}`;

  return { name: "Metric types", passed, detail: `${detail} [score=${score.toFixed(2)}]` };
}

/**
 * Scope correctness (pass/fail).
 * No metrics should have asset classes from must_not_count_asset_classes.
 */
function scoreScopeCorrectness(gold: GoldCase, run: RunArtifact): DimensionResult {
  if (!gold.must_not_count_asset_classes || gold.must_not_count_asset_classes.length === 0) {
    return { name: "Scope", passed: null, detail: "No forbidden asset classes defined (N/A)" };
  }

  const forbidden = new Set(gold.must_not_count_asset_classes.map((s) => s.toLowerCase().trim()));
  const violations: string[] = [];

  for (const m of run.metrics ?? []) {
    const ac = (m.asset_class ?? "").toLowerCase().trim();
    if (forbidden.has(ac)) {
      violations.push(`"${m.asset_class}" in metric "${m.metric}"`);
    }
  }

  if (violations.length === 0) {
    return { name: "Scope", passed: true, detail: "No forbidden asset classes found in metrics" };
  }

  return {
    name: "Scope",
    passed: false,
    detail: `Found forbidden asset classes: ${violations.join("; ")}`,
  };
}

/**
 * Provenance consistency (pass/fail).
 * Cross-checks source type vs file content.
 */
function scoreProvenance(gold: GoldCase, run: RunArtifact): DimensionResult {
  const expectedFamilies = gold.expected_source_family.split("|").map((s) => s.trim().toLowerCase());
  const docType = (run.selected_source?.document_type ?? "").toLowerCase();
  const filename = (run.selected_pdf?.filename ?? "").toLowerCase();

  const expectsPerformance = expectedFamilies.includes("performance");

  // If expected source is performance, selected_source.document_type must not be meeting/minutes
  if (expectsPerformance) {
    if (docType === "meeting" || docType === "minutes") {
      return {
        name: "Provenance",
        passed: false,
        detail: `Source type "${docType}" but expected performance family`,
      };
    }
    // Filename should not contain meeting/minutes indicators for performance queries
    if (filename.includes("agenda") || filename.includes("minutes")) {
      return {
        name: "Provenance",
        passed: false,
        detail: `Filename "${filename}" contains meeting/agenda keywords but expected performance source`,
      };
    }
  }

  return { name: "Provenance", passed: true, detail: "Source type and filename consistent with expectation" };
}

/**
 * Completeness label correctness (pass/fail).
 */
function scoreCompletenessLabel(gold: GoldCase, run: RunArtifact): DimensionResult {
  const label = (run.completeness_label ?? "").toLowerCase().trim();
  const coverage = run.coverage_score ?? 0;
  const sourceFamilyOk = scoreSourceFamily(gold, run).passed;

  if (!label) {
    return { name: "Completeness label", passed: false, detail: "No completeness_label on run" };
  }

  // If coverage is 1.0, label should be "complete"
  if (coverage >= 1.0) {
    const ok = label === "complete";
    return {
      name: "Completeness label",
      passed: ok,
      detail: ok
        ? `Label "${label}" correct for coverage=${coverage}`
        : `Label "${label}" but coverage=${coverage} — expected "complete"`,
    };
  }

  // "weak" should only appear when coverage is very low or source family is wrong
  if (label === "weak") {
    if (coverage < 0.25 || !sourceFamilyOk) {
      return {
        name: "Completeness label",
        passed: true,
        detail: `Label "weak" acceptable (coverage=${coverage}, source_ok=${sourceFamilyOk})`,
      };
    }
    return {
      name: "Completeness label",
      passed: false,
      detail: `Label "weak" but coverage=${coverage} is not very low and source family is correct`,
    };
  }

  // If allowed_partial and coverage < 1.0, "partial" or "partial-subset" are acceptable
  if (gold.allowed_partial && coverage < 1.0) {
    const acceptable = ["partial", "partial-subset"];
    const ok = acceptable.includes(label);
    return {
      name: "Completeness label",
      passed: ok,
      detail: ok
        ? `Label "${label}" acceptable for partial coverage=${coverage}`
        : `Label "${label}" unexpected — expected partial/partial-subset for coverage=${coverage}`,
    };
  }

  // Fallback: not partial-allowed but coverage < 1.0
  return {
    name: "Completeness label",
    passed: false,
    detail: `Label "${label}" with coverage=${coverage}, allowed_partial=${gold.allowed_partial}`,
  };
}

/**
 * Proxy handling (pass/fail).
 * Proxy hits should not be counted as full metric matches.
 * We check that proxy_hits metric types do NOT appear in the main found types
 * that contributed to the coverage score.
 */
function scoreProxyHandling(gold: GoldCase, run: RunArtifact): DimensionResult {
  const proxyHits = run.proxy_hits ?? [];

  if (proxyHits.length === 0) {
    return { name: "Proxy handling", passed: null, detail: "No proxy hits to check (N/A)" };
  }

  // If there are proxy hits but coverage is 1.0, that's suspicious — the proxies may be
  // inflating the score. Check if any proxy hit type also appears as a metric type.
  if (gold.expected_metric_types.length === 0) {
    return {
      name: "Proxy handling",
      passed: true,
      detail: `${proxyHits.length} proxy hit(s) present, no expected metric types to cross-check`,
    };
  }

  const metricTypes = new Set((run.metrics ?? []).map((m) => m.metric?.toUpperCase().trim()));
  const proxyTypes = proxyHits.map((p) => p.toUpperCase().trim());
  const overlaps = proxyTypes.filter((pt) => metricTypes.has(pt));

  if (overlaps.length > 0 && run.coverage_score >= 1.0) {
    return {
      name: "Proxy handling",
      passed: false,
      detail: `Proxy types [${overlaps.join(", ")}] appear as full matches AND coverage=1.0 — likely over-counted`,
    };
  }

  return {
    name: "Proxy handling",
    passed: true,
    detail: `${proxyHits.length} proxy hit(s), not inflating coverage (coverage=${run.coverage_score})`,
  };
}

// ---------------------------------------------------------------------------
// Evaluate a single case
// ---------------------------------------------------------------------------
function evaluateCase(gold: GoldCase, run: RunArtifact): CaseResult {
  const dimensions: DimensionResult[] = [
    scoreSourceFamily(gold, run),
    scoreFileFamily(gold, run),
    scoreMetricTypes(gold, run),
    scoreScopeCorrectness(gold, run),
    scoreProvenance(gold, run),
    scoreCompletenessLabel(gold, run),
    scoreProxyHandling(gold, run),
  ];

  const costFlagged = (run.cost_usd ?? 0) > 0.15;
  const latencyFlagged = (run.elapsed_sec ?? 0) > 40;

  return {
    id: gold.id,
    fund: gold.fund,
    query: gold.query,
    dimensions,
    cost_usd: run.cost_usd ?? 0,
    elapsed_sec: run.elapsed_sec ?? 0,
    cost_flagged: costFlagged,
    latency_flagged: latencyFlagged,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function printSeparator(char = "─", len = 90) {
  console.log(DIM + char.repeat(len) + RESET);
}

function printCaseResult(cr: CaseResult) {
  console.log(`\n${BOLD}${CYAN}[${cr.id}]${RESET} ${cr.fund} — "${cr.query}"`);
  printSeparator("─", 80);

  for (const dim of cr.dimensions) {
    const status =
      dim.passed === null ? na : dim.passed ? pass : fail;
    console.log(`  ${status}  ${BOLD}${dim.name}${RESET}`);
    console.log(`       ${DIM}${dim.detail}${RESET}`);
  }

  // Cost and latency
  const costStr = `$${cr.cost_usd.toFixed(3)}`;
  const latStr = `${cr.elapsed_sec.toFixed(1)}s`;
  const costTag = cr.cost_flagged ? ` ${warn} (>$0.15)` : "";
  const latTag = cr.latency_flagged ? ` ${warn} (>40s)` : "";
  console.log(`  ${DIM}Cost: ${costStr}${costTag}  |  Latency: ${latStr}${latTag}${RESET}`);
}

function printAggregates(results: CaseResult[]) {
  console.log(`\n${BOLD}${CYAN}=== AGGREGATE SCORES ===${RESET}\n`);

  const dimensionNames = [
    "Source family",
    "File family",
    "Metric types",
    "Scope",
    "Provenance",
    "Completeness label",
    "Proxy handling",
  ];

  for (const name of dimensionNames) {
    let passCount = 0;
    let failCount = 0;
    let naCount = 0;

    for (const cr of results) {
      const dim = cr.dimensions.find((d) => d.name === name);
      if (!dim || dim.passed === null) {
        naCount++;
      } else if (dim.passed) {
        passCount++;
      } else {
        failCount++;
      }
    }

    const total = passCount + failCount;
    const pct = total > 0 ? Math.round((passCount / total) * 100) : 100;
    const pctColor = pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED;
    const naNote = naCount > 0 ? ` ${DIM}(${naCount} N/A)${RESET}` : "";

    console.log(
      `  ${BOLD}${name.padEnd(24)}${RESET} ${pctColor}${pct}%${RESET}  (${passCount}/${total} pass)${naNote}`
    );
  }

  // Cost and latency summaries
  const costs = results.map((r) => r.cost_usd);
  const latencies = results.map((r) => r.elapsed_sec);
  const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxCost = Math.max(...costs);
  const maxLat = Math.max(...latencies);
  const costFlags = results.filter((r) => r.cost_flagged).length;
  const latFlags = results.filter((r) => r.latency_flagged).length;

  console.log("");
  console.log(`  ${DIM}Avg cost:    $${avgCost.toFixed(3)}  (max $${maxCost.toFixed(3)}, ${costFlags} flagged >$0.15)${RESET}`);
  console.log(`  ${DIM}Avg latency: ${avgLat.toFixed(1)}s  (max ${maxLat.toFixed(1)}s, ${latFlags} flagged >40s)${RESET}`);
}

function printTopFailures(results: CaseResult[]) {
  // Collect failure buckets: dimension -> list of case IDs
  const buckets: Record<string, string[]> = {};

  for (const cr of results) {
    for (const dim of cr.dimensions) {
      if (dim.passed === false) {
        if (!buckets[dim.name]) buckets[dim.name] = [];
        buckets[dim.name].push(cr.id);
      }
    }
  }

  const sorted = Object.entries(buckets).sort((a, b) => b[1].length - a[1].length);

  if (sorted.length === 0) {
    console.log(`\n${GREEN}${BOLD}No failures detected across all dimensions.${RESET}`);
    return;
  }

  console.log(`\n${BOLD}${RED}=== TOP FAILURE BUCKETS ===${RESET}\n`);

  for (const [dim, ids] of sorted) {
    console.log(`  ${RED}${ids.length}${RESET} failures in ${BOLD}${dim}${RESET}: ${ids.join(", ")}`);
  }
}

function printRecommendation(results: CaseResult[]) {
  let totalDims = 0;
  let totalPassed = 0;

  for (const cr of results) {
    for (const dim of cr.dimensions) {
      if (dim.passed !== null) {
        totalDims++;
        if (dim.passed) totalPassed++;
      }
    }
  }

  const overallPct = totalDims > 0 ? Math.round((totalPassed / totalDims) * 100) : 0;

  console.log(`\n${BOLD}${CYAN}=== OVERALL ===${RESET}\n`);
  const overallColor = overallPct >= 80 ? GREEN : overallPct >= 50 ? YELLOW : RED;
  console.log(`  ${overallColor}${BOLD}${overallPct}% of scored dimensions passed${RESET} (${totalPassed}/${totalDims})`);

  if (overallPct >= 90) {
    console.log(`  ${GREEN}Pipeline is performing well. Focus on edge cases and cost optimization.${RESET}`);
  } else if (overallPct >= 70) {
    console.log(`  ${YELLOW}Solid foundation but notable gaps. Review the failure buckets above.${RESET}`);
  } else if (overallPct >= 50) {
    console.log(`  ${YELLOW}Significant quality issues. Prioritize source routing and file selection.${RESET}`);
  } else {
    console.log(`  ${RED}Major pipeline issues. Start with source-family and file-family correctness.${RESET}`);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(`\n${BOLD}${CYAN}Control F — Extraction Eval Runner${RESET}`);
  console.log(`${DIM}Gold cases: ${GOLD_PATH}${RESET}`);
  console.log(`${DIM}Run artifacts: ${RUNS_DIR}/${RESET}\n`);

  const goldCases = loadGoldCases();
  console.log(`${DIM}Loaded ${goldCases.length} gold cases.${RESET}`);

  const runArtifacts = loadRunArtifacts();
  console.log(`${DIM}Loaded ${runArtifacts.length} run artifact(s).${RESET}`);

  if (runArtifacts.length === 0) {
    console.log(`
${YELLOW}${BOLD}No run artifacts found.${RESET}

${DIM}To generate run artifacts:${RESET}
  1. Start the dev server:  ${CYAN}cd app && npm run dev${RESET}
  2. Run queries in the browser for any gold case
  3. Save the extraction result as JSON in:
     ${CYAN}${RUNS_DIR}/<case-id>.json${RESET}

${DIM}Expected file schema:${RESET}
  {
    "id": "PSERS-1",       ${DIM}// must match a gold case ID${RESET}
    "timestamp": "...",
    "query": "...",
    "fund": "...",
    "selected_source": { "label": "...", "document_type": "...", "url": "..." },
    "selected_pdf": { "filename": "...", "source_label": "...", "preview_score": null },
    "retry_pdf": null,
    "reviewed_pages": [1, 2, 3],
    "total_pages": 50,
    "metrics": [ { "metric": "IRR", "asset_class": "...", "value": "...", "page": 1, "evidence": "...", "confidence": "high" } ],
    "coverage_score": 0.75,
    "completeness_label": "partial",
    "proxy_hits": [],
    "cost_usd": 0.08,
    "elapsed_sec": 22.5,
    "documents_used": 1
  }

${DIM}Gold case IDs available:${RESET}
  ${goldCases.map((g) => `${CYAN}${g.id}${RESET} — ${g.query}`).join("\n  ")}
`);
    return;
  }

  // Build lookup from gold ID -> gold case
  const goldMap = new Map<string, GoldCase>();
  for (const g of goldCases) {
    goldMap.set(g.id, g);
  }

  // Match and evaluate
  const results: CaseResult[] = [];
  const unmatched: string[] = [];

  for (const run of runArtifacts) {
    const gold = goldMap.get(run.id);
    if (!gold) {
      unmatched.push(run.id);
      continue;
    }
    results.push(evaluateCase(gold, run));
  }

  if (unmatched.length > 0) {
    console.log(
      `\n${YELLOW}${BOLD}Warning:${RESET} ${unmatched.length} run artifact(s) had no matching gold case: ${unmatched.join(", ")}`
    );
  }

  if (results.length === 0) {
    console.log(`\n${YELLOW}No matching run artifacts found for any gold case.${RESET}`);
    console.log(`${DIM}Run artifact IDs: ${runArtifacts.map((r) => r.id).join(", ")}${RESET}`);
    console.log(`${DIM}Gold case IDs: ${goldCases.map((g) => g.id).join(", ")}${RESET}`);
    return;
  }

  // Report: per-case breakdown
  console.log(`\n${BOLD}${CYAN}=== PER-CASE RESULTS (${results.length} evaluated) ===${RESET}`);

  for (const cr of results) {
    printCaseResult(cr);
  }

  // Report: unevaluated gold cases
  const evaluatedIds = new Set(results.map((r) => r.id));
  const unevaluated = goldCases.filter((g) => !evaluatedIds.has(g.id));
  if (unevaluated.length > 0) {
    console.log(`\n${DIM}Unevaluated gold cases (no run artifact): ${unevaluated.map((g) => g.id).join(", ")}${RESET}`);
  }

  // Report: aggregate scores
  printAggregates(results);

  // Report: top failure buckets
  printTopFailures(results);

  // Report: overall recommendation
  printRecommendation(results);
}

main();
