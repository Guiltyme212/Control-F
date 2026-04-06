/**
 * Control F — Gold Case Evaluation Runner (CLI)
 *
 * Reads evidence PDFs from disk, sends them to Claude, scores results.
 * No browser needed.
 *
 * Usage:
 *   cd app && node evals/run_gold_eval.cjs           # run all small cases
 *   cd app && node evals/run_gold_eval.cjs G5 G6     # run specific cases
 */

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const EVIDENCE_DIR = path.resolve(__dirname, '..', '..', 'Reference Files');
const RESULTS_DIR = path.resolve(__dirname, 'gold-runs');
const ENV_FILE = path.resolve(__dirname, '..', '.env.local');

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_MAX_TOKENS = 32000;

// Load API key from .env.local
function loadApiKey() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('ERROR: No .env.local found at', ENV_FILE);
    process.exit(1);
  }
  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  const match = content.match(/VITE_ANTHROPIC_API_KEY=(.+)/);
  if (!match) {
    console.error('ERROR: No VITE_ANTHROPIC_API_KEY in .env.local');
    process.exit(1);
  }
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// System prompt (same as api.ts)
// ---------------------------------------------------------------------------
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
3. Performance: ALWAYS create separate entries for IRR, TVPI, AND DPI for each fund/asset class
4. Always include evidence_text
5. "No activity" sections: note with value "No activity"
6. Proposed investments: use Commitment but note "proposed" in evidence
7. Co-investments: separate entries from main fund commitments
8. Capture target fund size and target returns
9. When a search focus is provided, extract ALL rows for each requested metric type. Only skip unrelated tables that do not contain ANY of the requested metrics.`;

// ---------------------------------------------------------------------------
// Gold cases (embedded — matches goldCases.ts)
// ---------------------------------------------------------------------------
const GOLD_CASES = [
  {
    id: 'G1', name: 'NY State CRF — T. Rowe Price termination',
    query: 'NY State CRF manager termination T. Rowe Price',
    documentFamily: 'transaction-report', pdf: 'Evidence 12_NY State.pdf',
    expectedMetrics: [{ metricType: 'Termination', gp: 'T. Rowe Price', value: '2', valueIsPattern: true }],
    forbiddenMetrics: [], partialAcceptable: false,
  },
  {
    id: 'G2', name: 'NY State CRF — infrastructure commitments',
    query: 'NY State CRF infrastructure commitments November 2025',
    documentFamily: 'transaction-report', pdf: 'Evidence 12_NY State.pdf',
    expectedMetrics: [
      { metricType: 'Commitment', assetClass: 'Infrastructure' },
      { metricType: 'Commitment', assetClass: 'Real Assets' },
    ],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G3', name: 'NY State CRF — Kreos Capital VIII',
    query: 'NY State CRF credit commitment Kreos Capital VIII',
    documentFamily: 'transaction-report', pdf: 'Evidence 12_NY State.pdf',
    expectedMetrics: [{ metricType: 'Commitment', fund: 'Kreos Capital VIII', value: '200', valueIsPattern: true }],
    forbiddenMetrics: [], partialAcceptable: false,
  },
  {
    id: 'G5', name: 'Santa Barbara PRR — one-year IRR',
    query: 'Santa Barbara PRR one year IRR June 30 2025',
    documentFamily: 'performance-update', pdf: 'Evidence 15_Santa Barbara .pdf',
    expectedMetrics: [{ metricType: 'IRR', value: '8.40', valueIsPattern: true }],
    forbiddenMetrics: [], partialAcceptable: false,
  },
  {
    id: 'G6', name: 'Santa Barbara PRR — market value + unfunded',
    query: 'Santa Barbara PRR market value and unfunded commitments June 30 2025',
    documentFamily: 'performance-update', pdf: 'Evidence 15_Santa Barbara .pdf',
    expectedMetrics: [
      { metricType: 'NAV', value: '553', valueIsPattern: true },
      { metricType: 'Commitment', value: '255', valueIsPattern: true },
    ],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G7', name: 'Santa Barbara PRR — benchmark since inception',
    query: 'Santa Barbara PRR benchmark outperformance since inception',
    documentFamily: 'performance-update', pdf: 'Evidence 15_Santa Barbara .pdf',
    expectedMetrics: [{ metricType: 'IRR', value: '11', valueIsPattern: true }],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G8', name: 'Santa Barbara PRR — allocation',
    query: 'Santa Barbara PRR infrastructure natural resources allocation',
    documentFamily: 'performance-update', pdf: 'Evidence 15_Santa Barbara .pdf',
    expectedMetrics: [
      { metricType: 'Asset Allocation', assetClass: 'Infrastructure' },
      { metricType: 'Asset Allocation', assetClass: 'Natural Resources' },
    ],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G9', name: 'NJ State — Ardian target return + fund size',
    query: 'New Jersey Ardian ASF IX infrastructure target return and fund size',
    documentFamily: 'investment-memo', pdf: 'Evidence 14_New Jersey State Investment Council.pdf',
    expectedMetrics: [
      { metricType: 'Target Return', value: '12.*14', valueIsPattern: true },
      { metricType: 'Target Fund Size', value: '7.5', valueIsPattern: true },
    ],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G10', name: 'NJ State — Ardian prior fund performance',
    query: 'New Jersey Ardian ASF prior fund IRR TVPI DPI',
    documentFamily: 'investment-memo', pdf: 'Evidence 14_New Jersey State Investment Council.pdf',
    expectedMetrics: [{ metricType: 'IRR' }, { metricType: 'TVPI' }, { metricType: 'DPI' }],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'G11', name: 'NJ State — Ardian fee + carry',
    query: 'New Jersey Ardian ASF management fee and carry',
    documentFamily: 'investment-memo', pdf: 'Evidence 14_New Jersey State Investment Council.pdf',
    expectedMetrics: [{ metricType: 'Management Fee' }, { metricType: 'Carry' }],
    forbiddenMetrics: [], partialAcceptable: true,
  },
  {
    id: 'N2', name: 'DCRB — noisy board minutes (should flag weak)',
    query: 'DCRB private markets IRR TVPI DPI',
    documentFamily: 'negative-control', pdf: 'Evidence 13_DCRB.pdf',
    expectedMetrics: [],
    forbiddenMetrics: ['IRR', 'TVPI', 'DPI'], partialAcceptable: false,
  },
  {
    id: 'N1', name: 'Bridgepoint — corporate financials (should reject)',
    query: 'Bridgepoint private markets IRR TVPI DPI NAV',
    documentFamily: 'negative-control', pdf: 'Evidence 11_Bridgepoint.pdf',
    expectedMetrics: [],
    forbiddenMetrics: ['IRR', 'TVPI', 'DPI', 'NAV'], partialAcceptable: false,
  },
];

// Skipped: G4, G12 (SDCERS 40MB — too expensive for routine eval)

// ---------------------------------------------------------------------------
// Early reject layer
// ---------------------------------------------------------------------------
const CORPORATE_SIGNALS = [
  'annual results', 'annual report and accounts', 'shareholder',
  'earnings per share', 'dividend', 'revenue', 'ebitda',
  'fee-paying aum', 'fee paying aum', 'fundraising',
  'management company', 'group financial statements',
  'consolidated statement', 'profit and loss', 'income statement',
  'balance sheet', 'cash flow statement', 'operating profit',
  'statutory accounts', 'auditor', "directors' report",
  'share price', 'stock exchange', 'listed on',
  'pre - performance related earnings', 'underlying fre',
];

const PENSION_FUND_SIGNALS = [
  'pension', 'retirement', 'public employees', 'board of trustees',
  'fiduciary', 'plan assets', 'defined benefit',
  'investment committee', 'board of retirement',
  'state investment', 'employee retirement',
  'unfunded liability', 'actuarial',
  'private markets', 'asset allocation',
  'investment memo', 'investment recommendation',
  'ipc report', 'due diligence',
];

function checkEarlyReject(previewText, query) {
  const text = previewText.toLowerCase();
  const corporateHits = CORPORATE_SIGNALS.filter(s => text.includes(s));
  const pensionHits = PENSION_FUND_SIGNALS.filter(s => text.includes(s));

  if (corporateHits.length >= 3 && pensionHits.length === 0) {
    return {
      shouldReject: true,
      reason: `Corporate financials detected (${corporateHits.length} signals, 0 pension). Likely a manager annual report.`,
      corporateSignals: corporateHits, pensionSignals: pensionHits, confidence: 'high',
    };
  }
  if (corporateHits.length >= 2 && pensionHits.length <= 1) {
    return {
      shouldReject: true,
      reason: `Strong corporate indicators (${corporateHits.slice(0, 3).join(', ')}). Unlikely pension-fund doc.`,
      corporateSignals: corporateHits, pensionSignals: pensionHits, confidence: 'medium',
    };
  }
  return {
    shouldReject: false, reason: '',
    corporateSignals: corporateHits, pensionSignals: pensionHits, confidence: 'low',
  };
}

// ---------------------------------------------------------------------------
// PDF loading
// ---------------------------------------------------------------------------
function loadPdf(filename) {
  const filepath = path.join(EVIDENCE_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`PDF not found: ${filepath}`);
  }
  const bytes = fs.readFileSync(filepath);
  const base64 = bytes.toString('base64');
  const sizeMB = (bytes.length / 1024 / 1024).toFixed(1);
  return { base64, sizeBytes: bytes.length, sizeMB };
}

// ---------------------------------------------------------------------------
// Focus instruction builder
// ---------------------------------------------------------------------------
function getRequestedMetricTypes(query) {
  const aliases = [
    { label: 'IRR', aliases: ['irr', 'internal rate of return'] },
    { label: 'TVPI', aliases: ['tvpi'] },
    { label: 'DPI', aliases: ['dpi'] },
    { label: 'NAV', aliases: ['nav', 'net asset value'] },
    { label: 'AUM', aliases: ['aum', 'assets under management'] },
    { label: 'Commitment', aliases: ['commitment', 'commitments', 'committed'] },
    { label: 'Co-Investment', aliases: ['co-investment', 'co investment', 'coinvestment'] },
    { label: 'Management Fee', aliases: ['management fee', 'mgmt fee'] },
    { label: 'Carry', aliases: ['carry', 'carried interest'] },
    { label: 'Target Fund Size', aliases: ['target fund size', 'fund size'] },
    { label: 'Target Return', aliases: ['target return'] },
    { label: 'Distribution', aliases: ['distribution', 'distributions'] },
    { label: 'Capital Call', aliases: ['capital call', 'capital calls'] },
    { label: 'Asset Allocation', aliases: ['asset allocation'] },
  ];
  const q = query.toLowerCase();
  return aliases.filter(d => d.aliases.some(a => q.includes(a))).map(d => d.label);
}

function buildFocusInstruction(query) {
  const hints = getRequestedMetricTypes(query);

  const metricHint = hints.length
    ? ` ONLY extract these metric types: ${hints.join(', ')}. Extract at the asset-class and total-portfolio level. Only include GP/manager-level detail when no asset-class summary is available.`
    : '';

  return `\n\nSearch focus: "${query}"${metricHint}\n\nPrioritize extracting metrics that directly answer this search query. Include all relevant rows for the requested metric types, but skip large tables that are entirely unrelated to the search focus. IMPORTANT: Your response must end with valid JSON — do not add any explanation after the closing brace.`;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------
async function callClaude(base64, apiKey, query) {
  const startTime = Date.now();
  const userText = `Extract all financial metrics from this document.${buildFocusInstruction(query)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: userText },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const elapsed = (Date.now() - startTime) / 1000;
  const usage = data.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock?.text) throw new Error('No text in Claude response');

  // Parse JSON (with salvage for truncated responses)
  let parsed;
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const lastObj = jsonStr.lastIndexOf('},');
    if (lastObj === -1) throw new Error('Could not parse response');
    const salvaged = jsonStr.slice(0, lastObj + 1) + '], "cross_reference_signals": [] }';
    parsed = JSON.parse(salvaged);
  }

  const metrics = (parsed.extracted_metrics || []).map(m => ({
    metric: m.metric_type || '',
    value: m.value || '',
    asset_class: m.asset_class || '',
    fund: m.fund_name || '',
    gp: m.gp_manager || '',
    evidence: m.evidence_text || '',
    confidence: m.confidence || 'medium',
    page: m.page_reference ?? 0,
  }));

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {},
    costUsd,
    inputTokens,
    outputTokens,
    elapsedSec: elapsed,
    truncated: data.stop_reason === 'max_tokens',
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function metricTypeMatches(extracted, expected) {
  const e = extracted.toLowerCase();
  const x = expected.toLowerCase();
  if (e === x || e.includes(x) || x.includes(e)) return true;

  const aliases = {
    irr: ['internal rate of return', 'net irr', 'gross irr'],
    tvpi: ['total value to paid-in', 'total value multiple'],
    dpi: ['distributions to paid-in', 'realization multiple'],
    nav: ['net asset value', 'market value', 'fair value'],
    commitment: ['committed', 'commitments', 'unfunded commitment', 'unfunded commitments'],
    termination: ['terminated', 'terminations'],
    'target return': ['target net irr', 'expected return'],
    'target fund size': ['fund size', 'target size'],
    'management fee': ['mgmt fee', 'management fees'],
    carry: ['carried interest', 'incentive fee', 'performance fee'],
    'asset allocation': ['allocation', 'portfolio allocation'],
  };

  for (const [canonical, alts] of Object.entries(aliases)) {
    const group = [canonical, ...alts];
    if (group.some(a => e.includes(a)) && group.some(a => x.includes(a))) return true;
  }
  return false;
}

function fieldMatches(extracted, expected) {
  if (!expected) return true;
  if (!extracted) return false;
  return extracted.toLowerCase().includes(expected.toLowerCase()) ||
         expected.toLowerCase().includes(extracted.toLowerCase());
}

function valueMatches(extracted, expected, isPattern) {
  if (!expected) return true;
  const norm = extracted.toLowerCase().replace(/[,\s$%]/g, '');
  if (isPattern) {
    try { return new RegExp(expected, 'i').test(extracted) || new RegExp(expected, 'i').test(norm); }
    catch { return norm.includes(expected.toLowerCase()); }
  }
  return norm.includes(expected.toLowerCase().replace(/[,\s$%]/g, ''));
}

function scoreCase(goldCase, result) {
  const metricMatches = goldCase.expectedMetrics.map(exp => {
    for (const m of result.metrics) {
      if (metricTypeMatches(m.metric, exp.metricType) &&
          valueMatches(m.value, exp.value || '', exp.valueIsPattern || false) &&
          fieldMatches(m.asset_class, exp.assetClass) &&
          fieldMatches(m.fund, exp.fund) &&
          fieldMatches(m.gp, exp.gp)) {
        return { expected: exp, found: true, matchedValue: m.value, matchedType: m.metric, matchedAsset: m.asset_class };
      }
    }

    // Not found — explain why
    const typeHits = result.metrics.filter(m => metricTypeMatches(m.metric, exp.metricType));
    const reason = typeHits.length === 0
      ? `No "${exp.metricType}" metrics found`
      : `Found ${typeHits.length} "${exp.metricType}" but none matched all criteria`;
    return { expected: exp, found: false, reason };
  });

  const found = metricMatches.filter(m => m.found).length;
  const total = goldCase.expectedMetrics.length;

  // Check forbidden metrics (negative controls)
  // "No activity" values don't count — Claude correctly identified absence
  const forbiddenFound = (goldCase.forbiddenMetrics || []).filter(forbidden =>
    result.metrics.some(m =>
      metricTypeMatches(m.metric, forbidden) &&
      m.confidence !== 'low' &&
      !m.value.toLowerCase().includes('no activity') &&
      !m.value.toLowerCase().includes('not found') &&
      !m.value.toLowerCase().includes('not available') &&
      !m.evidence.toLowerCase().includes('no ') &&
      !m.evidence.toLowerCase().includes('not reported')
    )
  );

  let grade;
  if (goldCase.documentFamily === 'negative-control') {
    if (result.earlyRejected) {
      grade = 'rejected-correctly';
    } else if (forbiddenFound.length === 0) {
      grade = 'handled-safely';
    } else {
      grade = 'rejected-incorrectly';
    }
  } else if (total === 0) {
    grade = 'pass';
  } else if (found === total) {
    grade = 'pass';
  } else if (found > 0 && goldCase.partialAcceptable) {
    grade = 'partial';
  } else if (found > 0) {
    grade = 'weak';
  } else {
    grade = 'fail';
  }

  const passed = grade === 'pass' || grade === 'rejected-correctly' || grade === 'handled-safely' || (grade === 'partial' && goldCase.partialAcceptable);

  return {
    caseId: goldCase.id,
    caseName: goldCase.name,
    query: goldCase.query,
    grade,
    passed,
    found,
    total,
    metricsFound: found,
    metricsExpected: total,
    metricMatches,
    forbiddenFound,
    forbiddenMetricsFound: forbiddenFound,
    ...result,
  };
}

function hasGrade(result, ...grades) {
  return grades.includes(String(result.grade || '').toLowerCase().replace(/_/g, '-'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// The official representative benchmark — 5 cases covering all doc families
const REPRESENTATIVE_IDS = ['G1', 'G5', 'G9', 'N1', 'N2'];

async function main() {
  const apiKey = loadApiKey();
  const args = process.argv.slice(2);
  const useRepresentative = args.includes('--representative') || args.includes('-r');
  const filteredArgs = args.filter(a => !a.startsWith('-'));
  const requestedIds = useRepresentative
    ? REPRESENTATIVE_IDS
    : filteredArgs.length > 0 ? filteredArgs : REPRESENTATIVE_IDS;
  const casesToRun = GOLD_CASES.filter(c => requestedIds.includes(c.id));

  if (casesToRun.length === 0) {
    console.log('No cases to run. Available:', GOLD_CASES.map(c => c.id).join(', '));
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('  CONTROL F — GOLD CASE EVALUATION');
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  Running ${casesToRun.length} case(s): ${casesToRun.map(c => c.id).join(', ')}`);
  console.log('='.repeat(70));

  // Group by PDF to avoid re-loading
  const pdfCache = {};
  const allResults = [];
  let totalCost = 0;

  for (const gc of casesToRun) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${gc.id}] ${gc.name}`);
    console.log(`  Query: "${gc.query}"`);
    console.log(`  PDF: ${gc.pdf}`);

    try {
      // Load PDF (cache by filename)
      if (!pdfCache[gc.pdf]) {
        console.log('  Loading PDF...');
        pdfCache[gc.pdf] = loadPdf(gc.pdf);
        console.log(`  Loaded ${pdfCache[gc.pdf].sizeMB} MB`);
      } else {
        console.log(`  PDF cached (${pdfCache[gc.pdf].sizeMB} MB)`);
      }

      const { base64 } = pdfCache[gc.pdf];

      // Early reject check — extract text from first pages, scan for corporate signals
      console.log('  Checking for early reject signals...');
      let previewText = '';
      try {
        const pdfData = new Uint8Array(Buffer.from(base64, 'base64'));
        const pdf = await pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true }).promise;
        const maxPreview = Math.min(5, pdf.numPages);
        for (let i = 1; i <= maxPreview; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          previewText += tc.items.filter(it => 'str' in it).map(it => it.str).join(' ') + ' ';
        }
        pdf.destroy();
        previewText = previewText.toLowerCase();
        console.log(`  Preview: ${previewText.length} chars from ${maxPreview} pages`);
      } catch (err) {
        console.log(`  Could not parse preview: ${err.message}`);
      }
      const earlyReject = checkEarlyReject(previewText, gc.query);
      if (earlyReject.shouldReject) {
        console.log(`  [REJECTED] ${earlyReject.reason}`);
        console.log(`    Corporate signals: ${earlyReject.corporateSignals.join(', ')}`);
        console.log(`    Pension signals: ${earlyReject.pensionSignals.join(', ') || 'none'}`);
        const isNeg = gc.documentFamily === 'negative-control';
        allResults.push({
          caseId: gc.id, caseName: gc.name,
          query: gc.query,
          grade: isNeg ? 'rejected-correctly' : 'rejected-incorrectly',
          passed: isNeg,
          found: 0, total: gc.expectedMetrics.length,
          metricsFound: 0, metricsExpected: gc.expectedMetrics.length,
          metricMatches: [], forbiddenFound: [],
          forbiddenMetricsFound: [],
          metrics: [], costUsd: 0, elapsedSec: 0,
          earlyRejected: true, rejectReason: earlyReject.reason,
        });
        continue;
      }
      console.log('  No early reject — proceeding to extraction');

      // Call Claude
      console.log('  Calling Claude...');
      const result = await callClaude(base64, apiKey, gc.query);
      console.log(`  ${result.metrics.length} metrics extracted in ${result.elapsedSec.toFixed(1)}s — $${result.costUsd.toFixed(4)}`);

      // Score
      const score = scoreCase(gc, result);
      totalCost += result.costUsd;
      allResults.push(score);

      // Print result
      const icon =
        hasGrade(score, 'pass') ? '[PASS]'
          : hasGrade(score, 'partial') ? '[PART]'
            : hasGrade(score, 'weak') ? '[WEAK]'
              : hasGrade(score, 'rejected-correctly') ? '[REJ-OK]'
                : hasGrade(score, 'handled-safely') ? '[SAFE]'
                  : hasGrade(score, 'rejected-incorrectly') ? '[REJ-BAD]'
                    : '[FAIL]';
      console.log(`  ${icon} ${score.found}/${score.total} metrics matched`);

      for (const mm of score.metricMatches) {
        if (mm.found) {
          console.log(`    + ${mm.expected.metricType}: "${mm.matchedValue}" [${mm.matchedAsset || '-'}]`);
        } else {
          console.log(`    - ${mm.expected.metricType}: ${mm.reason}`);
        }
      }

      if (score.forbiddenFound.length > 0) {
        console.log(`    ! FORBIDDEN: ${score.forbiddenFound.join(', ')}`);
      }
    } catch (err) {
      console.log(`  [ERROR] ${err.message}`);
      allResults.push({ caseId: gc.id, caseName: gc.name, query: gc.query, grade: 'error', passed: false, error: err.message });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SUMMARY');
  console.log('='.repeat(70));

  const passed = allResults.filter(r => r.passed).length;
  const partial = allResults.filter(r => hasGrade(r, 'partial')).length;
  const weak = allResults.filter(r => hasGrade(r, 'weak')).length;
  const rejectedCorrectly = allResults.filter(r => hasGrade(r, 'rejected-correctly')).length;
  const handledSafely = allResults.filter(r => hasGrade(r, 'handled-safely')).length;
  const rejectedIncorrectly = allResults.filter(r => hasGrade(r, 'rejected-incorrectly')).length;
  const failed = allResults.filter(r => hasGrade(r, 'fail', 'error')).length;
  const totalElapsedSec = allResults.reduce((sum, r) => sum + (r.elapsedSec || 0), 0);
  const avgElapsedSec = allResults.length > 0 ? totalElapsedSec / allResults.length : 0;
  const avgCost = allResults.length > 0 ? totalCost / allResults.length : 0;

  console.log(`  PASS: ${passed}  |  PARTIAL: ${partial}  |  WEAK: ${weak}  |  REJ-OK: ${rejectedCorrectly}  |  SAFE: ${handledSafely}  |  REJ-BAD: ${rejectedIncorrectly}  |  FAIL: ${failed}  /  ${allResults.length} total`);
  console.log(`  Total cost: $${totalCost.toFixed(4)}  |  Avg/case: $${avgCost.toFixed(4)}  |  Avg latency: ${avgElapsedSec.toFixed(1)}s`);
  console.log();

  for (const r of allResults) {
    const icon =
      hasGrade(r, 'pass') ? 'PASS'
        : hasGrade(r, 'partial') ? 'PART'
          : hasGrade(r, 'weak') ? 'WEAK'
            : hasGrade(r, 'rejected-correctly') ? 'REJ-OK'
              : hasGrade(r, 'handled-safely') ? 'SAFE'
                : hasGrade(r, 'rejected-incorrectly') ? 'REJ-BAD'
                  : 'FAIL';
    console.log(`  [${icon}]  ${r.caseId}: ${r.caseName}`);
  }

  // Load previous run for delta comparison
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const previousRuns = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  let prevRun = null;
  if (previousRuns.length > 0) {
    try {
      prevRun = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, previousRuns[0]), 'utf-8'));
    } catch { /* ignore */ }
  }

  // Delta comparison
  if (prevRun) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  DELTA vs PREVIOUS RUN');
    console.log(`  Previous: ${prevRun.timestamp}`);
    console.log('─'.repeat(60));

    const prevResults = Array.isArray(prevRun.results) ? prevRun.results : [];
    const prevPassed = prevResults.length > 0
      ? prevResults.filter(r => r.passed === true || hasGrade(r, 'pass', 'rejected-correctly', 'handled-safely')).length
      : (prevRun.passed ?? 0);
    const prevPartial = prevResults.length > 0
      ? prevResults.filter(r => !String(r.caseId).startsWith('N') && hasGrade(r, 'partial')).length
      : (prevRun.partial ?? 0);
    const prevWeak = prevResults.length > 0
      ? prevResults.filter(r => !String(r.caseId).startsWith('N') && hasGrade(r, 'weak')).length
      : (prevRun.weak ?? 0);
    const prevRejectedCorrectly = prevResults.length > 0
      ? prevResults.filter(r => hasGrade(r, 'rejected-correctly')).length
      : (prevRun.rejectedCorrectly ?? 0);
    const prevHandledSafely = prevResults.length > 0
      ? prevResults.filter(r => hasGrade(r, 'handled-safely')).length
      : (prevRun.handledSafely ?? 0);
    const prevRejectedIncorrectly = prevResults.length > 0
      ? prevResults.filter(r => hasGrade(r, 'rejected-incorrectly')).length
      : (prevRun.rejectedIncorrectly ?? 0);
    const prevCost = prevRun.totalCostUsd ?? prevRun.totalCost ?? 0;
    const prevCases = prevRun.casesRun ?? 0;
    const prevAvgCost = prevCases > 0 ? prevCost / prevCases : 0;
    const prevElapsed = prevRun.totalElapsedSec ?? prevResults.reduce((sum, r) => sum + (r.elapsedSec || 0), 0);
    const prevAvgElapsed = prevCases > 0 ? prevElapsed / prevCases : 0;
    const currAvgCost = allResults.length > 0 ? totalCost / allResults.length : 0;

    const delta = (curr, prev, unit = '') => {
      const diff = curr - prev;
      if (diff === 0) return `  (unchanged)`;
      const arrow = diff > 0 ? '+' : '';
      return `  (${arrow}${diff.toFixed(unit === '$' ? 4 : 0)}${unit})`;
    };

    console.log(`  Overall passing: ${passed}/${allResults.length}  vs  ${prevPassed}/${prevCases}${delta(passed, prevPassed)}`);
    console.log(`  Positive quality: PASS ${allResults.filter(r => !String(r.caseId).startsWith('N') && hasGrade(r, 'pass')).length} vs ${prevResults.filter(r => !String(r.caseId).startsWith('N') && hasGrade(r, 'pass')).length}  |  PARTIAL ${partial} vs ${prevPartial}${delta(partial, prevPartial)}  |  WEAK ${weak} vs ${prevWeak}${delta(weak, prevWeak)}`);
    console.log(`  Negative controls: REJ-OK ${rejectedCorrectly} vs ${prevRejectedCorrectly}${delta(rejectedCorrectly, prevRejectedCorrectly)}  |  SAFE ${handledSafely} vs ${prevHandledSafely}${delta(handledSafely, prevHandledSafely)}  |  REJ-BAD ${rejectedIncorrectly} vs ${prevRejectedIncorrectly}${delta(rejectedIncorrectly, prevRejectedIncorrectly)}`);
    console.log(`  Total cost: $${totalCost.toFixed(4)}  vs  $${prevCost.toFixed(4)}${delta(totalCost, prevCost, '$')}`);
    console.log(`  Avg/case:   $${currAvgCost.toFixed(4)}  vs  $${prevAvgCost.toFixed(4)}${delta(currAvgCost, prevAvgCost, '$')}`);
    console.log(`  Avg time:   ${avgElapsedSec.toFixed(1)}s  vs  ${prevAvgElapsed.toFixed(1)}s${delta(avgElapsedSec, prevAvgElapsed)}`);

    // Per-case changes
    const prevResultMap = {};
    for (const r of (prevRun.results || [])) {
      prevResultMap[r.caseId] = r;
    }
    const changes = [];
    for (const r of allResults) {
      const prev = prevResultMap[r.caseId];
      if (!prev) { changes.push(`  NEW   ${r.caseId}: ${r.grade}`); continue; }
      if (String(prev.grade || '').toLowerCase() !== String(r.grade || '').toLowerCase()) {
        changes.push(`  ${r.caseId}: ${prev.grade} → ${r.grade}`);
      }
    }
    if (changes.length > 0) {
      console.log('  Changes:');
      for (const c of changes) console.log(`    ${c}`);
    } else {
      console.log('  No grade changes from previous run.');
    }
  }

  // Save results
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(RESULTS_DIR, `${ts}-gold-eval.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    casesRun: allResults.length,
    positiveCases: allResults.filter(r => !String(r.caseId).startsWith('N')).length,
    negativeCases: allResults.filter(r => String(r.caseId).startsWith('N')).length,
    runId: 'gold-eval',
    passed, partial, weak, rejectedCorrectly, handledSafely, rejectedIncorrectly, failed,
    totalCost,
    totalCostUsd: totalCost,
    averageCostUsd: avgCost,
    totalElapsedSec,
    averageElapsedSec: avgElapsedSec,
    results: allResults,
    scores: allResults,
  }, null, 2));
  console.log(`\n  Results saved to: ${outFile}`);
  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
