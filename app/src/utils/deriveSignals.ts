import type { Metric, Signal } from '../data/types';

/**
 * Generate rule-based intelligence signals from extracted metrics
 * when the LLM extraction didn't produce cross-reference signals.
 */
export function deriveSignalsFromMetrics(metrics: Metric[]): Signal[] {
  const signals: Signal[] = [];
  const meaningful = metrics.filter((m) => m.value.trim().toLowerCase() !== 'no activity');
  if (meaningful.length === 0) return signals;

  // --- Highest IRR by asset class ---
  const irrRows = meaningful.filter((m) => m.metric === 'IRR');
  if (irrRows.length > 1) {
    const best = irrRows.reduce((a, b) => parseFloat(a.value) > parseFloat(b.value) ? a : b);
    const val = parseFloat(best.value);
    if (!isNaN(val) && best.asset_class) {
      signals.push({
        type: 'Top Performer',
        description: `${best.asset_class} shows highest IRR at ${best.value}${best.value.includes('%') ? '' : '%'}`,
      });
    }
  }

  // --- NAV concentration ---
  const navRows = meaningful.filter((m) => m.metric === 'NAV');
  const totalNavRow = navRows.find((m) => (m.asset_class || '').toLowerCase().includes('total'));
  if (totalNavRow && navRows.length > 2) {
    const totalVal = parseFloat(totalNavRow.value.replace(/[^0-9.-]/g, ''));
    const nonTotal = navRows.filter((m) => m !== totalNavRow);
    if (!isNaN(totalVal) && totalVal > 0) {
      const largest = nonTotal.reduce((a, b) => {
        const aV = parseFloat(a.value.replace(/[^0-9.-]/g, ''));
        const bV = parseFloat(b.value.replace(/[^0-9.-]/g, ''));
        return aV > bV ? a : b;
      });
      const largestVal = parseFloat(largest.value.replace(/[^0-9.-]/g, ''));
      const pct = Math.round((largestVal / totalVal) * 100);
      if (pct >= 30 && pct < 100 && largest.asset_class) {
        signals.push({
          type: 'Concentration',
          description: `${largest.asset_class} represents ${pct}% of total private markets NAV`,
        });
      }
    }
  }

  // --- DPI maturity ---
  const dpiRows = meaningful.filter((m) => m.metric === 'DPI');
  const matureDpi = dpiRows.find((m) => {
    const v = parseFloat(m.value.replace(/[^0-9.-]/g, ''));
    return !isNaN(v) && v >= 1.0;
  });
  if (matureDpi && matureDpi.asset_class) {
    signals.push({
      type: 'Capital Return',
      description: `${matureDpi.asset_class} has returned ${matureDpi.value} invested capital (DPI)`,
    });
  }

  // --- Coverage breadth ---
  const assetClasses = new Set(meaningful.map((m) => m.asset_class).filter(Boolean));
  const metricTypes = new Set(meaningful.map((m) => m.metric).filter(Boolean));
  if (assetClasses.size >= 3 && metricTypes.size >= 2) {
    signals.push({
      type: 'Coverage',
      description: `${metricTypes.size} metric types found across ${assetClasses.size} asset classes`,
    });
  }

  return signals.slice(0, 4);
}
