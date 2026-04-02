import type { Metric } from '../data/types';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function exportToCSV(metrics: Metric[], filename: string): void {
  const headers = [
    'Date',
    'LP',
    'Fund',
    'GP/Manager',
    'Metric',
    'Value',
    'Asset Class',
    'Source',
    'Page',
    'Confidence',
  ];

  const rows = metrics.map((m) =>
    [
      m.date,
      m.lp,
      m.fund,
      m.gp,
      m.metric,
      m.value,
      m.asset_class,
      m.source,
      String(m.page),
      m.confidence,
    ]
      .map(escapeCSVField)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportToJSON(metrics: Metric[], filename: string): void {
  const data = metrics.map((m) => ({
    date: m.date,
    lp: m.lp,
    fund: m.fund,
    gp_manager: m.gp,
    metric: m.metric,
    value: m.value,
    asset_class: m.asset_class,
    source: m.source,
    page: m.page,
    confidence: m.confidence,
  }));

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}
