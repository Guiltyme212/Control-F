/**
 * End-to-end pipeline test — runs the full search flow from CLI.
 * No browser needed. Tests source discovery, PDF scraping, LLM selection.
 *
 * Usage:
 *   node test-pipeline-e2e.cjs
 *   node test-pipeline-e2e.cjs "SAMCERA private equity IRR and TVPI"
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^(\w+)=(.+)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const FIRECRAWL_KEY = process.env.VITE_FIRECRAWL_API_KEY;
const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_API_KEY;

if (!FIRECRAWL_KEY) { console.error('Missing VITE_FIRECRAWL_API_KEY in .env.local'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing VITE_ANTHROPIC_API_KEY in .env.local'); process.exit(1); }

const QUERY = process.argv[2] || 'PSERS private markets IRR, TVPI, DPI, and NAV';

// ── Inline source registry (just PSERS + SAMCERA + Minnesota for testing) ──

const TEST_SOURCES = [
  {
    id: 'psers-asset-allocation',
    pensionFund: 'PSERS',
    label: 'Asset Allocation and Performance',
    url: 'https://www.pa.gov/agencies/psers/transparency/investment-program/psers-asset-allocation-and-performance',
    documentType: 'performance',
    intents: ['performance'],
    keywords: ['asset allocation', 'performance', 'private equity', 'irr', 'tvpi', 'dpi'],
  },
  {
    id: 'psers-financial-reports',
    pensionFund: 'PSERS',
    label: 'Financial Reports',
    url: 'https://www.pa.gov/agencies/psers/transparency/financial-reports',
    documentType: 'financial',
    intents: ['financial', 'performance'],
    keywords: ['financial', 'performance', 'irr', 'quarterly'],
  },
  {
    id: 'samcera-investments',
    pensionFund: 'SAMCERA',
    label: 'Investments',
    url: 'https://www.samcera.org/investments',
    documentType: 'investment',
    intents: ['performance', 'commitment'],
    keywords: ['investments', 'performance', 'private equity', 'irr'],
  },
  {
    id: 'mnsbi-performance',
    pensionFund: 'Minnesota SBI',
    label: 'Performance & Analytics',
    url: 'https://mn.gov/sbi/performance-analytics/',
    documentType: 'performance',
    intents: ['performance'],
    keywords: ['performance', 'analytics', 'irr', 'private markets'],
  },
];

// ── Firecrawl helpers ──

async function firecrawlSearch(query, sourceUrl) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const searchQuery = `${query} site:${host}`;

  const response = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIRECRAWL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: searchQuery, limit: 3, timeout: 25000 }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.success ? (data.data || []) : [];
}

async function scrapeForPdfs(url) {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIRECRAWL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['links', 'rawHtml'] }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  if (!data.success) return [];

  const candidates = new Set();
  const allLinks = data.data?.links || [];
  for (const link of allLinks) {
    if (/\.pdf(\?|#|$)/i.test(link)) candidates.add(link);
  }
  const rawHtml = data.data?.rawHtml || '';
  if (rawHtml) {
    const htmlPdfUrls = rawHtml.match(/https?:\/\/[^\s"'<>]+\.pdf/gi) || [];
    for (const u of htmlPdfUrls) candidates.add(u);
  }

  const pdfs = [];
  const seen = new Set();
  for (const raw of candidates) {
    try {
      const cleaned = raw.replace(/&amp;/g, '&').split(/[#?]/)[0];
      const fullUrl = cleaned.startsWith('http') ? cleaned : new URL(cleaned, url).href;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      const filename = decodeURIComponent(new URL(fullUrl).pathname.split('/').pop() || 'document.pdf');
      pdfs.push({ url: fullUrl, filename });
    } catch { /* skip */ }
  }
  return pdfs;
}

// ── LLM PDF selector ──

async function selectBestPdfWithLLM(candidates, query) {
  if (candidates.length <= 1) return candidates;

  const numberedList = candidates
    .map((c, i) => `${i + 1}. ${c.filename} (from: ${c.sourceLabel})`)
    .join('\n');

  const prompt = `You are helping a pension fund analyst find specific financial metrics in PDF documents.

The analyst is looking for: ${query}

Here are PDF files found on pension fund websites:

${numberedList}

Which 1-2 files most likely contain the requested metrics?

Rules:
- Prefer disclosure reports, portfolio reports, performance reviews, combined portfolio reports
- Avoid financial statements, balance sheets, ACFR, agendas, minutes
- "Quarterly statement" is usually a balance sheet (bad). "Quarterly disclosure report" is usually performance data (good).
- More recent files are better

Return ONLY a JSON array of file numbers, e.g. [3] or [3, 7]. Nothing else.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.log(`   LLM selection failed (${response.status}), falling back to heuristic`);
    return candidates.slice(0, 2);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() || '';
  console.log(`   LLM raw response: ${text}`);
  console.log(`   Cost: ${data.usage?.input_tokens || 0} input + ${data.usage?.output_tokens || 0} output tokens`);

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return candidates.slice(0, 2);
    const selected = parsed
      .filter((n) => typeof n === 'number' && n >= 1 && n <= candidates.length)
      .map((n) => candidates[n - 1]);
    return selected.length > 0 ? selected : candidates.slice(0, 2);
  } catch {
    return candidates.slice(0, 2);
  }
}

// ── Filename scoring (same heuristics as the app) ──

function includesAny(text, phrases) {
  return phrases.some((p) => text.includes(p));
}

function scorePdfFilename(filename, url, query) {
  const normalized = `${filename} ${url}`.toLowerCase();
  let score = 0;
  const reasons = [];

  if (/\b2026\b/.test(normalized)) { score += 8; reasons.push('2026'); }
  else if (/\b2025\b/.test(normalized)) { score += 7; reasons.push('2025'); }
  else if (/\b2024\b/.test(normalized)) { score += 4; reasons.push('2024'); }

  if (includesAny(normalized, ['disclosure report', 'portfolio report', 'combined portfolio', 'portfolio quarterly'])) {
    score += 25; reasons.push('portfolio/disclosure report');
    if (normalized.includes('quarterly') && normalized.includes('disclosure')) { score += 8; reasons.push('quarterly disclosure'); }
  } else if (includesAny(normalized, ['performance review', 'performance report', 'private markets', 'private market'])) {
    score += 12; reasons.push('performance report');
  }

  if (includesAny(normalized, ['financial statement', 'quarterly statement', 'statement of', 'net position', 'fiduciary'])) {
    score -= 18; reasons.push('financial statement');
  }
  if (normalized.includes('quarterly') && normalized.includes('statement') && !includesAny(normalized, ['disclosure', 'portfolio', 'performance'])) {
    score -= 10; reasons.push('quarterly statement penalty');
  }

  if (includesAny(normalized, ['irr', 'tvpi', 'dpi'])) { score += 16; reasons.push('target metrics'); }
  if (includesAny(normalized, ['private equity', 'private credit', 'real assets', 'alternatives', 'private'])) { score += 8; reasons.push('private markets'); }
  if (includesAny(normalized, ['performance', 'private markets', 'combined', 'portfolio', 'quarterly'])) { score += 10; reasons.push('likely performance'); }
  if (includesAny(normalized, ['agenda', 'minutes', 'board'])) { score -= 6; reasons.push('board materials'); }

  return { score, reasons };
}

// ── Main pipeline ──

async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PIPELINE TEST: "${QUERY}"`);
  console.log(`${'='.repeat(60)}\n`);

  // Detect which pension fund
  const queryLower = QUERY.toLowerCase();
  const matchedSources = TEST_SOURCES.filter((s) =>
    queryLower.includes(s.pensionFund.toLowerCase())
  );
  const sources = matchedSources.length > 0 ? matchedSources : TEST_SOURCES.slice(0, 2);

  console.log(`Step 1: Source discovery`);
  console.log(`   Pension fund sources: ${sources.map((s) => s.label).join(', ')}`);

  // Step 2: Scrape all sources for PDFs in parallel
  console.log(`\nStep 2: Scraping ${sources.length} sources for PDFs in parallel...`);
  const scrapeStart = Date.now();

  const scrapeResults = await Promise.all(
    sources.map(async (source) => {
      try {
        const pdfs = await scrapeForPdfs(source.url);
        console.log(`   ${source.label}: ${pdfs.length} PDFs found`);
        return { source, pdfs };
      } catch (err) {
        console.log(`   ${source.label}: FAILED (${err.message})`);
        return { source, pdfs: [] };
      }
    }),
  );

  const allPdfs = [];
  for (const { source, pdfs } of scrapeResults) {
    for (const pdf of pdfs) {
      allPdfs.push({ ...pdf, sourceLabel: source.label });
    }
  }

  const scrapeTime = ((Date.now() - scrapeStart) / 1000).toFixed(1);
  console.log(`   Total: ${allPdfs.length} PDFs across ${sources.length} sources (${scrapeTime}s)`);

  if (allPdfs.length === 0) {
    console.log('\n   FAILED: No PDFs found on any source page.');
    process.exit(1);
  }

  // Step 3: Show all PDFs ranked by heuristic
  console.log(`\nStep 3: Heuristic ranking of all PDFs`);
  const ranked = allPdfs
    .map((pdf) => ({ ...pdf, ...scorePdfFilename(pdf.filename, pdf.url, QUERY) }))
    .sort((a, b) => b.score - a.score);

  for (const pdf of ranked.slice(0, 15)) {
    console.log(`   [${pdf.score >= 0 ? '+' : ''}${pdf.score}] ${pdf.filename}`);
    console.log(`         Source: ${pdf.sourceLabel} | Reasons: ${pdf.reasons.join(', ')}`);
  }
  if (ranked.length > 15) {
    console.log(`   ... and ${ranked.length - 15} more`);
  }

  // Step 4: LLM PDF selection
  console.log(`\nStep 4: LLM PDF selection (Haiku)...`);
  const llmStart = Date.now();
  const llmPicks = await selectBestPdfWithLLM(allPdfs, QUERY);
  const llmTime = ((Date.now() - llmStart) / 1000).toFixed(1);

  console.log(`   LLM picked (${llmTime}s):`);
  for (const pick of llmPicks) {
    const heuristicScore = scorePdfFilename(pick.filename, pick.url, QUERY).score;
    console.log(`   >> ${pick.filename} (heuristic score: ${heuristicScore})`);
    console.log(`      Source: ${pick.sourceLabel}`);
  }

  // Step 5: Compare LLM pick vs heuristic top pick
  console.log(`\nStep 5: Comparison`);
  const heuristicTop = ranked[0];
  const llmTop = llmPicks[0];
  const llmTopHeuristicScore = scorePdfFilename(llmTop.filename, llmTop.url, QUERY).score;

  if (heuristicTop.filename === llmTop.filename) {
    console.log(`   MATCH: Both heuristic and LLM picked "${llmTop.filename}"`);
  } else {
    console.log(`   DIFFERENT PICKS:`);
    console.log(`   Heuristic top: "${heuristicTop.filename}" (score: ${heuristicTop.score})`);
    console.log(`   LLM top:       "${llmTop.filename}" (heuristic score: ${llmTopHeuristicScore})`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PIPELINE COMPLETE in ${totalTime}s`);
  console.log(`Best PDF to extract: ${llmTop.filename}`);
  console.log(`${'='.repeat(60)}\n`);
}

runPipeline().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
