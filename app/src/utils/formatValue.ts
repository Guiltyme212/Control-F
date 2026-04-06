/**
 * Format large numeric values for display.
 * 16,074,528,765 → $16.07B
 * 1,816,577,145  → $1.82B
 * 26,019.9       → 26,019.9 (under 1M, keep as-is)
 * 13.3           → 13.3 (small number, keep as-is)
 * 10.0%          → 10.0% (percentage, keep as-is)
 * 1.5x           → 1.5x (multiple, keep as-is)
 */
export function formatDisplayValue(raw: string): string {
  // Don't touch percentages, multiples, or non-numeric values
  if (/[%x×]/i.test(raw)) return raw;

  // Extract the numeric part (strip $ and commas)
  const match = raw.match(/^(\$?)(-?[\d,]+(?:\.\d+)?)(.*)/);
  if (!match) return raw;

  const [, prefix, numStr, suffix] = match;
  const num = parseFloat(numStr.replace(/,/g, ''));
  if (isNaN(num)) return raw;

  if (num >= 1_000_000_000) {
    return `${prefix || '$'}${(num / 1_000_000_000).toFixed(2)}B${suffix}`;
  }
  if (num >= 1_000_000) {
    return `${prefix || '$'}${(num / 1_000_000).toFixed(1)}M${suffix}`;
  }

  return raw;
}
