/**
 * Control F Evaluation Harness
 *
 * Entry point for the gold-case benchmark suite.
 * Import from here for clean access to all eval functionality.
 */

// Types
export type {
  DocumentFamily,
  MvpPensionFund,
  ExpectedMetric,
  GoldCase,
  MetricMatch,
  CaseScore,
  EvalRunSummary,
  RunArtifact,
} from './types';
export { MVP_PENSION_FUNDS } from './types';

// Gold cases
export {
  allGoldCases,
  positiveGoldCases,
  negativeControlCases,
  representativeCases,
  REPRESENTATIVE_IDS,
  getGoldCase,
  getCasesByFamily,
  getCasesByPdf,
} from './goldCases';

// Scorer
export {
  detectDocumentFamily,
  scoreCase,
  buildRunSummary,
  formatReport,
} from './scorer';

// Runner
export {
  runCase,
  runCases,
  runAll,
  runByFamily,
  runNegativeControls,
  subsetPdf,
} from './runner';
export type { CaseResult, LogFn } from './runner';
