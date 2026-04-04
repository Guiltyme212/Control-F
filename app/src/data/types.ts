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

export type Page = 'search' | 'results' | 'dashboard' | 'trackers' | 'upload';

export type MetricFilter = string;
export type AssetClassFilter = string;
