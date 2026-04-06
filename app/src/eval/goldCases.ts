import type { GoldCase } from './types';

/**
 * Gold-case benchmark suite for Control F extraction pipeline.
 *
 * 12 positive cases across 4 document families + 2 negative controls.
 * Built from Giulio's evidence docs — these define "what correct looks like"
 * for the MVP pension-fund universe.
 *
 * Evidence PDF mapping:
 *   Evidence 12_NY State.pdf            → G1, G2, G3  (transaction report)
 *   Evidence 10_SDCERS.pdf              → G4, G12     (board agenda)
 *   Evidence 15_Santa Barbara .pdf      → G5, G6, G7, G8 (performance update)
 *   Evidence 14_New Jersey State...pdf  → G9, G10, G11 (investment memo)
 *   Evidence 11_Bridgepoint.pdf         → N1 (negative: corporate financials)
 *   Evidence 13_DCRB.pdf               → N2 (negative: noisy board minutes)
 */

const EVIDENCE_DIR = 'Reference Files';

/* ================================================================== */
/*  A. Event / Transaction / Board docs                                */
/* ================================================================== */

const G1: GoldCase = {
  id: 'G1',
  name: 'NY State CRF — T. Rowe Price termination',
  query: 'NY State CRF manager termination T. Rowe Price',
  documentFamily: 'transaction-report',
  pensionFund: null, // NY State CRF is not in our MVP 5, but it's a gold evidence doc
  evidencePdf: `${EVIDENCE_DIR}/Evidence 12_NY State.pdf`,
  expectedMetrics: [
    {
      metricType: 'Termination',
      gp: 'T. Rowe Price',
      assetClass: 'Public Equities',
      value: '2',
      valueIsPattern: true, // ~$2 billion, various formats
    },
  ],
  expectedAssetClasses: ['Public Equities'],
  partialAcceptable: false,
  failureConditions: [
    'Termination not identified as a termination metric type',
    'Wrong manager attributed',
    'Amount significantly off from ~$2 billion',
  ],
  notes: 'Tests extraction of manager termination events from monthly transaction reports.',
};

const G2: GoldCase = {
  id: 'G2',
  name: 'NY State CRF — infrastructure commitments November 2025',
  query: 'NY State CRF infrastructure commitments November 2025',
  documentFamily: 'transaction-report',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 12_NY State.pdf`,
  expectedMetrics: [
    {
      metricType: 'Commitment',
      assetClass: 'Infrastructure',
    },
    {
      metricType: 'Commitment',
      assetClass: 'Real Assets',
    },
  ],
  expectedAssetClasses: ['Infrastructure', 'Real Assets'],
  partialAcceptable: true, // Multiple rows expected, partial is OK
  failureConditions: [
    'No infrastructure/real assets commitments found at all',
    'Commitments from wrong time period extracted',
    'Performance metrics returned instead of commitments',
  ],
  notes: 'Tests multiple commitment row extraction. Stonepeak and DIF should be visible.',
};

const G3: GoldCase = {
  id: 'G3',
  name: 'NY State CRF — Kreos Capital VIII credit commitment',
  query: 'NY State CRF credit commitment Kreos Capital VIII',
  documentFamily: 'transaction-report',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 12_NY State.pdf`,
  expectedMetrics: [
    {
      metricType: 'Commitment',
      fund: 'Kreos Capital VIII',
      value: '200',
      valueIsPattern: true, // $200 million in various formats
    },
  ],
  expectedAssetClasses: ['Credit'],
  partialAcceptable: false,
  failureConditions: [
    'Fund name not matched to Kreos Capital VIII',
    'Amount not approximately $200 million',
    'Wrong asset class (not credit/lending)',
  ],
  notes: 'Tests specific fund + amount extraction from transaction report. Manager is BlackRock.',
};

const G4: GoldCase = {
  id: 'G4',
  name: 'SDCERS — Macquarie infrastructure commitment',
  query: 'SDCERS March 2026 Macquarie Global Infrastructure Fund commitment',
  documentFamily: 'board-agenda',
  pensionFund: 'SAMCERA', // SDCERS is close to SAMCERA in our registry, but actually a different fund
  evidencePdf: `${EVIDENCE_DIR}/Evidence 10_SDCERS.pdf`,
  expectedMetrics: [
    {
      metricType: 'Commitment',
      fund: 'Macquarie',
      valueIsPattern: true,
      value: '100',
      assetClass: 'Infrastructure',
    },
  ],
  expectedAssetClasses: ['Infrastructure'],
  partialAcceptable: false,
  failureConditions: [
    'Commitment not found or wrong fund name',
    'Amount not approximately $100 million',
    'Infrastructure not identified as asset class',
  ],
  notes: 'Tests board agenda commitment extraction. SDCERS is a 40MB PDF — stress tests page filtering.',
};

/* ================================================================== */
/*  B. Performance / Portfolio Update docs                             */
/* ================================================================== */

const G5: GoldCase = {
  id: 'G5',
  name: 'Santa Barbara PRR — one-year IRR',
  query: 'Santa Barbara PRR one year IRR June 30 2025',
  documentFamily: 'performance-update',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 15_Santa Barbara .pdf`,
  expectedMetrics: [
    {
      metricType: 'IRR',
      value: '8.40',
      valueIsPattern: true,
    },
  ],
  partialAcceptable: false,
  failureConditions: [
    'IRR value not 8.40% (one-year)',
    'Since-inception IRR (11.36%) returned instead of one-year',
    'Wrong reporting period',
  ],
  notes: 'Tests specific time-horizon IRR extraction. Since-inception IRR (11.36%) should also be available but one-year is the target.',
};

const G6: GoldCase = {
  id: 'G6',
  name: 'Santa Barbara PRR — market value and unfunded commitments',
  query: 'Santa Barbara PRR market value and unfunded commitments June 30 2025',
  documentFamily: 'performance-update',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 15_Santa Barbara .pdf`,
  expectedMetrics: [
    {
      metricType: 'NAV',
      value: '553',
      valueIsPattern: true, // $553.9M
    },
    {
      metricType: 'Commitment',
      value: '255',
      valueIsPattern: true, // $255.4M unfunded
    },
  ],
  partialAcceptable: true,
  failureConditions: [
    'Market value not approximately $553.9M',
    'Unfunded commitments not approximately $255.4M',
    'Total exposure ($809.3M) confused with market value',
  ],
  notes: 'Tests dual-metric extraction (NAV + unfunded). Total exposure $809.3M should also be derivable.',
};

const G7: GoldCase = {
  id: 'G7',
  name: 'Santa Barbara PRR — benchmark outperformance since inception',
  query: 'Santa Barbara PRR benchmark outperformance since inception',
  documentFamily: 'performance-update',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 15_Santa Barbara .pdf`,
  expectedMetrics: [
    {
      metricType: 'IRR',
      value: '11',
      valueIsPattern: true, // since inception IRR ~11.36%
    },
  ],
  partialAcceptable: true,
  failureConditions: [
    'No benchmark comparison surfaced at all',
    'CPI-U + 400 bps reference not found',
    'One-year IRR returned instead of since-inception',
  ],
  notes: 'Tests benchmark-relative performance extraction. Should surface outperformance vs CPI-U + 400 bps.',
};

const G8: GoldCase = {
  id: 'G8',
  name: 'Santa Barbara PRR — infrastructure/natural resources allocation',
  query: 'Santa Barbara PRR infrastructure natural resources allocation',
  documentFamily: 'performance-update',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 15_Santa Barbara .pdf`,
  expectedMetrics: [
    {
      metricType: 'Asset Allocation',
      assetClass: 'Infrastructure',
    },
    {
      metricType: 'Asset Allocation',
      assetClass: 'Natural Resources',
    },
  ],
  expectedAssetClasses: ['Infrastructure', 'Natural Resources'],
  partialAcceptable: true,
  failureConditions: [
    'No strategy-level allocation breakdown found',
    'Only total-level allocation returned without sub-strategy split',
  ],
  notes: 'Tests diversification / strategy mix extraction from performance update.',
};

/* ================================================================== */
/*  C. Investment Memo / Due Diligence docs                            */
/* ================================================================== */

const G9: GoldCase = {
  id: 'G9',
  name: 'NJ State — Ardian ASF IX target return and fund size',
  query: 'New Jersey Ardian ASF IX infrastructure target return and fund size',
  documentFamily: 'investment-memo',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 14_New Jersey State Investment Council.pdf`,
  expectedMetrics: [
    {
      metricType: 'Target Return',
      value: '12.*14',
      valueIsPattern: true, // 12-14% net IRR
    },
    {
      metricType: 'Target Fund Size',
      value: '7.5',
      valueIsPattern: true, // $7.5 billion
    },
  ],
  partialAcceptable: true,
  failureConditions: [
    'Target return not in 12-14% range',
    'Fund size not approximately $7.5 billion',
    'Net vs gross return confused',
  ],
  notes: 'Tests investment memo key terms extraction.',
};

const G10: GoldCase = {
  id: 'G10',
  name: 'NJ State — Ardian ASF prior fund IRR/TVPI/DPI',
  query: 'New Jersey Ardian ASF prior fund IRR TVPI DPI',
  documentFamily: 'investment-memo',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 14_New Jersey State Investment Council.pdf`,
  expectedMetrics: [
    { metricType: 'IRR' },
    { metricType: 'TVPI' },
    { metricType: 'DPI' },
  ],
  partialAcceptable: true,
  failureConditions: [
    'No prior vintage performance data found',
    'Only one of IRR/TVPI/DPI returned when all three should be available',
    'Current fund metrics confused with prior fund track record',
  ],
  notes: 'Tests prior-fund vintage performance extraction from IPC/due diligence report.',
};

const G11: GoldCase = {
  id: 'G11',
  name: 'NJ State — Ardian ASF management fee and carry',
  query: 'New Jersey Ardian ASF management fee and carry',
  documentFamily: 'investment-memo',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 14_New Jersey State Investment Council.pdf`,
  expectedMetrics: [
    { metricType: 'Management Fee' },
    { metricType: 'Carry' },
  ],
  partialAcceptable: true,
  failureConditions: [
    'Neither management fee nor carry terms found',
    'Fee terms from wrong fund extracted',
  ],
  notes: 'Tests fee structure extraction from investment memo.',
};

const G12: GoldCase = {
  id: 'G12',
  name: 'SDCERS — KKR Real Estate Credit target return',
  query: 'SDCERS KKR Opportunistic Real Estate Credit III target return',
  documentFamily: 'board-agenda',
  pensionFund: 'SAMCERA',
  evidencePdf: `${EVIDENCE_DIR}/Evidence 10_SDCERS.pdf`,
  expectedMetrics: [
    {
      metricType: 'Target Return',
      fund: 'KKR',
      valueIsPattern: true,
    },
  ],
  expectedAssetClasses: ['Real Estate', 'Credit'],
  partialAcceptable: true,
  failureConditions: [
    'No target return found for KKR Real Estate Credit',
    'Wrong fund matched',
    'Commitment amount returned but target return missing',
  ],
  notes: 'Tests target return extraction from board/consultant memo within a large packet. Fee, term, investment size may also appear.',
};

/* ================================================================== */
/*  Negative Controls                                                  */
/* ================================================================== */

const N1: GoldCase = {
  id: 'N1',
  name: 'Bridgepoint — corporate financials (should reject)',
  query: 'Bridgepoint private markets IRR TVPI DPI NAV',
  documentFamily: 'negative-control',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 11_Bridgepoint.pdf`,
  expectedMetrics: [], // Nothing should pass as a valid pension metric
  forbiddenMetrics: ['IRR', 'TVPI', 'DPI', 'NAV'],
  partialAcceptable: false,
  failureConditions: [
    'Bridgepoint corporate AUM/FRE/EBITDA presented as pension-fund performance',
    'System treats manager-level corporate financials as fund-level pension data',
    'High-confidence metrics returned from a corporate annual report',
  ],
  notes: 'Bridgepoint annual results have AUM, fee-paying AUM, PRE, EBITDA — lots of metrics but they are manager/company financials, NOT pension-fund metrics. System should reject or heavily down-rank.',
};

const N2: GoldCase = {
  id: 'N2',
  name: 'DCRB — noisy board minutes (should flag weak)',
  query: 'DCRB private markets IRR TVPI DPI',
  documentFamily: 'negative-control',
  pensionFund: null,
  evidencePdf: `${EVIDENCE_DIR}/Evidence 13_DCRB.pdf`,
  expectedMetrics: [], // Specific performance multiples should not be found
  forbiddenMetrics: ['IRR', 'TVPI', 'DPI'],
  partialAcceptable: false,
  failureConditions: [
    'System returns IRR/TVPI/DPI from governance text',
    'Total market value ($14.1B) presented as performance multiple answer',
    'Board meeting minutes treated as a performance report',
  ],
  notes: 'DCRB meeting minutes contain governance/admin text plus a few fund-level facts like total market value $14.1B. If asked for performance multiples, system should label this weak/off-target. If asked for total market value specifically, it could surface it carefully.',
};

/* ================================================================== */
/*  Export                                                             */
/* ================================================================== */

/** All 12 positive gold cases */
export const positiveGoldCases: GoldCase[] = [
  G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12,
];

/** 2 negative control cases */
export const negativeControlCases: GoldCase[] = [N1, N2];

/** Complete benchmark suite: 14 cases total */
export const allGoldCases: GoldCase[] = [...positiveGoldCases, ...negativeControlCases];

/**
 * The 5 official representative benchmark cases.
 * One from each doc family + both negative controls.
 * This is the set you show Giulio and run after every pipeline change.
 */
export const REPRESENTATIVE_IDS = ['G1', 'G5', 'G9', 'N1', 'N2'] as const;
export const representativeCases: GoldCase[] = allGoldCases.filter(
  (c) => (REPRESENTATIVE_IDS as readonly string[]).includes(c.id),
);

/** Lookup a case by ID */
export function getGoldCase(id: string): GoldCase | undefined {
  return allGoldCases.find((c) => c.id === id);
}

/** Get cases by document family */
export function getCasesByFamily(family: GoldCase['documentFamily']): GoldCase[] {
  return allGoldCases.filter((c) => c.documentFamily === family);
}

/** Get cases that use a specific evidence PDF */
export function getCasesByPdf(pdfFilename: string): GoldCase[] {
  return allGoldCases.filter((c) => c.evidencePdf.includes(pdfFilename));
}
