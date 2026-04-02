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
}

export type Page = 'search' | 'results' | 'dashboard' | 'trackers' | 'upload';

export type MetricFilter = string;
export type AssetClassFilter = string;
