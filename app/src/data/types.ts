export interface Metric {
  date: string;
  lp: string;
  fund: string;
  gp: string;
  metric: string;
  value: string;
  asset_class: string;
  source: string;
  page: number;
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface Signal {
  type: string;
  description: string;
}

export interface PdfLink {
  url: string;
  filename: string;
}

export interface PdfScorecard {
  url: string;
  filename: string;
  filenameScore: number;
  previewScore: number;
  previewMatchedMetrics: string[];
  previewNegativeSignals: string[];
  combinedScore: number;
  wasSelected: boolean;
}

export interface Tracker {
  name: string;
  status: 'active' | 'paused';
  sources: number;
  metrics: number;
  last_match: string;
  frequency: string;
  id?: string;
  query?: string;
  filters?: {
    metricType?: string;
    assetClass?: string;
  };
  latestFinding?: string;
  newAlerts?: number;
}

export interface ExtractedData {
  document_metadata: {
    source_organization: string;
    document_type: string;
    document_date: string;
    reporting_period: string;
  };
  extracted_metrics: ApiMetric[];
  cross_reference_signals: { signal_type: string; description: string }[];
}

export interface ApiMetric {
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
}

export type SearchIntent =
  | 'commitment'
  | 'performance'
  | 'board'
  | 'financial'
  | 'general';

export interface SourceRegistryEntry {
  id: string;
  pensionFund: string;
  label: string;
  url: string;
  documentType: 'meeting' | 'minutes' | 'performance' | 'financial' | 'investment' | 'general';
  intents: SearchIntent[];
  keywords: string[];
  notes?: string;
}

export interface SourceSearchCandidate {
  id: string;
  registryId: string;
  pensionFund: string;
  label: string;
  url: string;
  description: string;
  score: number;
  matchedKeywords: string[];
  documentType: SourceRegistryEntry['documentType'];
}

export type LiveTrackerStatus =
  | 'finding_sources'
  | 'choose_source'
  | 'scanning_pdfs'
  | 'selecting_pdfs'
  | 'extracting'
  | 'complete'
  | 'error';

export interface LiveTrackerLog {
  message: string;
  status: 'info' | 'done' | 'error';
  detail?: string;
}

export interface LiveTrackerProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface LiveSearchTracker {
  id: string;
  query: string;
  pensionFunds: string[];
  metrics: string[];
  assetClasses: string[];
  frequency: string;
  status: LiveTrackerStatus;
  message: string;
  sourceCandidates: SourceSearchCandidate[];
  selectedSource: SourceSearchCandidate | null;
  pdfLinks: PdfLink[];
  selectedPdfUrls: string[];
  attemptedPdfUrls: string[];
  extractionLogs: LiveTrackerLog[];
  progress: LiveTrackerProgress;
  foundMetrics: Metric[];
  foundSignals: Signal[];
  scorecards: PdfScorecard[];
  errorMessage: string;
  createdAt: string;
}

export type AlertMode = 'new-reports-or-values' | 'new-values-only' | 'new-documents-only';

export interface LiveSearchTrackerSeed {
  query: string;
  pensionFunds: string[];
  metrics: string[];
  assetClasses: string[];
  frequency: string;
  alertMode: AlertMode;
}

export type ResultsOrigin = 'live-search' | 'upload-file' | 'upload-scrape';

export interface ActiveResults {
  id: string;
  origin: ResultsOrigin;
  title: string;
  query: string;
  assetClassHints?: string[];
  metrics: Metric[];
  signals: Signal[];
  selectedSource: SourceSearchCandidate | null;
  sourceSummary: string;
  documentCount: number;
  reviewedDocuments?: ReviewedDocument[];
  totalCostUsd?: number;
  totalElapsedSec?: number;
  createdAt: string;
}

export interface ReviewedDocument {
  url: string;
  filename: string;
  sourceLabel: string;
  sourceUrl?: string;
  status: 'selected' | 'extracted' | 'rejected' | 'failed';
  selectionRole?: 'selected' | 'retried' | 'skipped';
  selectionReason?: string;
  previewScore?: number | null;
  previewMatchedMetrics?: string[];
  previewNegativeSignals?: string[];
  reviewedPages?: number[];
  pagesReviewed?: number;
  previewPagesScanned?: number;
  totalPages?: number;
  pageSubsetStrategy?: 'preview-only' | 'full-document' | 'first-chunk-fallback' | 'filtered-subset' | 'firecrawl-markdown';
  skipReason?: string;
  costUsd?: number;
  elapsedSec?: number;
}

export type Page = 'search' | 'results' | 'monitor' | 'trackers' | 'upload' | 'eval';

export type MetricFilter = string;
export type AssetClassFilter = string;
