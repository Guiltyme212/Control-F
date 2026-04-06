const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:5174';
const SHOTS = path.join(__dirname, 'test-screenshots');
const TARGET_METRICS = ['IRR', 'TVPI', 'DPI', 'NAV'];

(async () => {
  console.log('=== LIVE SEARCH QUALITY TEST ===');
  console.log('Launching browser (headed)...\n');
  const browser = await chromium.launch({
    headless: false,
    args: ['--force-color-profile=srgb'],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'dark',
  });
  page.setDefaultTimeout(120000); // 2 minutes default timeout

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // Collected at end for quality report
  let totalMetrics = 0;
  let matchedTargets = [];
  let missingTargets = [];
  let grade = 'UNKNOWN';

  try {
    // ── Step 1: Search page ──────────────────────────────────────────
    console.log('Step 1: Loading search page...');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500); // let animations settle

    // Make sure we're on Search
    const searchNav = await page.$('button:has-text("Search")');
    if (searchNav) await searchNav.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(SHOTS, 'quality-01-search.png'), fullPage: true });
    console.log('   Screenshot: quality-01-search.png');

    // Click the first preset
    console.log('   Clicking PSERS preset...');
    const presetBtn = await page.$('button:has-text("PSERS private markets")');
    if (!presetBtn) throw new Error('Could not find PSERS preset button');
    await presetBtn.click({ force: true });
    await page.waitForTimeout(3000); // Wait for the refine card to fully slide in

    // ── Step 2: Refine → Start Tracking ──────────────────────────────
    console.log('Step 2: Starting tracking...');
    await page.screenshot({ path: path.join(SHOTS, 'quality-02-refine.png'), fullPage: true });
    console.log('   Screenshot: quality-02-refine.png');

    const startBtnOptions = [
      'button:has-text("Start Tracking")',
      'button:has-text("Start")',
      'button:has-text("Submit")',
      'button'
    ];
    let startBtn;
    for (const sel of startBtnOptions) {
      const btns = await page.$$(sel);
      for (const b of btns) {
        const text = await b.textContent();
        if (text.includes('Start') || text.includes('Track') || text.includes('Search') || text.includes('Submit')) {
           startBtn = b; break;
        }
      }
      if (startBtn) break;
    }
    if (!startBtn) throw new Error('Could not find "Start Tracking" button');
    await startBtn.click({ force: true });
    await page.waitForTimeout(3000);

    // ── Step 3: Wait through animations → Dashboard ──────────────────
    console.log('Step 3: Waiting for animations + dashboard...');
    await page.waitForTimeout(800); // lifting
    await page.screenshot({ path: path.join(SHOTS, 'quality-03-lifting.png'), fullPage: true });

    // Wait for dashboard to appear (animations take ~7s, then page transitions)
    try {
      await page.waitForSelector('text=LIVE SEARCH TRACKER', { timeout: 20000 });
    } catch {
      console.log('   "LIVE SEARCH TRACKER" not found yet, waiting more...');
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000); // let dashboard settle
    await page.screenshot({ path: path.join(SHOTS, 'quality-04-dashboard.png'), fullPage: true });
    console.log('   Screenshot: quality-04-dashboard.png');

    // ── Step 4: Source selection ──────────────────────────────────────
    console.log('Step 4: Waiting for source candidates...');

    // Wait for either source buttons or checkboxes (auto-select case)
    await page.waitForFunction(() => {
      const sourceBtn = document.querySelector('button[class*="text-left"]');
      const checkbox = document.querySelector('input[type="checkbox"]');
      return sourceBtn || checkbox;
    }, { timeout: 90000 });

    // Check if source buttons are available to click
    const sourceBtn = await page.$('button:has-text("Asset Allocation and Performance")');
    if (sourceBtn) {
      console.log('   Found source: Asset Allocation and Performance');
      await sourceBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Check for any source button as fallback
      const anySource = await page.$('button[class*="text-left"]');
      if (anySource) {
        const sourceText = await anySource.textContent();
        console.log(`   Clicking available source: ${sourceText.substring(0, 60)}...`);
        await anySource.click();
        await page.waitForTimeout(1000);
      } else {
        console.log('   Source was auto-selected, skipping to PDF list');
      }
    }
    await page.screenshot({ path: path.join(SHOTS, 'quality-05-source.png'), fullPage: true });
    console.log('   Screenshot: quality-05-source.png');

    // ── Step 5: PDF selection + Extract ───────────────────────────────
    console.log('Step 5: Selecting PDF and extracting...');

    // Wait for PDF checkboxes
    await page.waitForSelector('input[type="checkbox"]', { timeout: 60000 });
    await page.waitForTimeout(1500); // let the full list render

    // Count available PDFs
    const pdfCheckboxes = await page.$$('input[type="checkbox"]');
    console.log(`   Found ${pdfCheckboxes.length} PDF(s) available`);

    await page.screenshot({ path: path.join(SHOTS, 'quality-06-pdf-list.png'), fullPage: true });
    console.log('   Screenshot: quality-06-pdf-list.png');

    // Click first checkbox
    if (pdfCheckboxes.length > 0) {
      await pdfCheckboxes[0].click();
      await page.waitForTimeout(500);
    } else {
      throw new Error('No PDF checkboxes found');
    }

    // Click Extract button
    const extractBtn = await page.$('button:has-text("Extract")');
    if (!extractBtn) throw new Error('Could not find Extract button');
    await extractBtn.click();
    console.log('   Extraction started...');

    await page.screenshot({ path: path.join(SHOTS, 'quality-07-extracting.png'), fullPage: true });
    console.log('   Screenshot: quality-07-extracting.png');

    // ── Step 6: Wait for extraction (up to 5 minutes) ────────────────
    console.log('Step 6: Waiting for extraction to complete (up to 5 min)...');

    const EXTRACTION_TIMEOUT = 300000; // 5 minutes
    const POLL_INTERVAL = 15000; // 15 seconds
    const start = Date.now();
    let completed = false;
    let pollCount = 0;

    while (Date.now() - start < EXTRACTION_TIMEOUT) {
      const completeEl = await page.$('text=Extraction complete');
      const errorEl = await page.$('text=Extraction failed');

      if (completeEl) {
        completed = true;
        console.log('   Extraction complete!');
        break;
      }
      if (errorEl) {
        console.log('   ERROR: Extraction failed');
        break;
      }

      // Log progress
      const elapsed = Math.round((Date.now() - start) / 1000);
      try {
        const logLines = await page.$$eval('[class*="font-mono"]', els =>
          els.map(el => el.textContent).join(' | ').substring(0, 150)
        );
        console.log(`   [${elapsed}s] ${logLines || 'waiting...'}`);
      } catch {
        console.log(`   [${elapsed}s] waiting...`);
      }

      // Screenshot every ~30s
      if (pollCount % 2 === 0) {
        await page.screenshot({
          path: path.join(SHOTS, `quality-08-progress-${pollCount}.png`),
          fullPage: true,
        });
      }

      pollCount++;
      await page.waitForTimeout(POLL_INTERVAL);
    }

    if (!completed && Date.now() - start >= EXTRACTION_TIMEOUT) {
      console.log('   WARNING: Extraction timed out after 5 minutes');
    }

    await page.screenshot({ path: path.join(SHOTS, 'quality-09-complete.png'), fullPage: true });
    console.log('   Screenshot: quality-09-complete.png');

    // ── Step 7: Click Review/View Results ─────────────────────────────
    console.log('Step 7: Navigating to results...');

    let reviewBtn = await page.$('button:has-text("Review Results")');
    if (!reviewBtn) reviewBtn = await page.$('button:has-text("View Results")');

    if (reviewBtn) {
      await reviewBtn.click();
      await page.waitForTimeout(2000); // let results page render
    } else {
      console.log('   WARNING: No Review/View Results button found, navigating manually');
      const resultsNav = await page.$('button:has-text("Results")');
      if (resultsNav) await resultsNav.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: path.join(SHOTS, 'quality-10-results.png'), fullPage: true });
    console.log('   Screenshot: quality-10-results.png');

    // ── Step 8: Quality assessment ────────────────────────────────────
    console.log('Step 8: Assessing result quality...\n');

    // Try to scrape the results table
    try {
      // Wait for table to be present
      await page.waitForSelector('table', { timeout: 10000 });

      const rows = await page.$$eval('table tbody tr', trs =>
        trs.map(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length < 6) return null; // skip expansion/detail rows
          return {
            date: cells[0]?.textContent?.trim() || '',
            lp: cells[1]?.textContent?.trim() || '',
            fund: cells[2]?.textContent?.trim() || '',
            gp: cells[3]?.textContent?.trim() || '',
            metric: cells[4]?.textContent?.trim() || '',
            value: cells[5]?.textContent?.trim() || '',
          };
        }).filter(Boolean)
      );

      totalMetrics = rows.length;
      const metricTypes = [...new Set(rows.map(r => r.metric))];
      matchedTargets = TARGET_METRICS.filter(t =>
        metricTypes.some(m => m.toUpperCase().includes(t))
      );
      missingTargets = TARGET_METRICS.filter(t => !matchedTargets.includes(t));

      if (matchedTargets.length === 4) grade = 'STRONG';
      else if (matchedTargets.length >= 2) grade = 'PARTIAL';
      else if (matchedTargets.length === 1) grade = 'WEAK';
      else grade = 'NO MATCH';

      // Count per target
      const targetCounts = {};
      for (const t of TARGET_METRICS) {
        targetCounts[t] = rows.filter(r =>
          r.metric.toUpperCase().includes(t)
        ).length;
      }

      // Print quality report
      console.log('╔══════════════════════════════════════════╗');
      console.log('║     LIVE SEARCH QUALITY REPORT           ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║  Total metrics extracted: ${String(totalMetrics).padEnd(15)}║`);
      console.log(`║  Grade: ${grade.padEnd(33)}║`);
      console.log('╠══════════════════════════════════════════╣');
      console.log('║  Target Metrics:                         ║');
      for (const t of TARGET_METRICS) {
        const found = matchedTargets.includes(t);
        const count = targetCounts[t];
        const mark = found ? '✓' : '✗';
        console.log(`║    ${mark} ${t.padEnd(6)} ${found ? count + ' values' : 'MISSING'}`.padEnd(44) + '║');
      }
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║  Matched: ${matchedTargets.join(', ') || 'none'} (${matchedTargets.length}/${TARGET_METRICS.length})`.padEnd(44) + '║');
      if (missingTargets.length > 0) {
        console.log(`║  Missing: ${missingTargets.join(', ')}`.padEnd(44) + '║');
      }
      console.log(`║  Console errors: ${errors.length}`.padEnd(44) + '║');
      console.log('╠══════════════════════════════════════════╣');
      console.log('║  Screenshots: ./test-screenshots/quality-*║');
      console.log('╚══════════════════════════════════════════╝');

      // Show sample rows
      if (rows.length > 0) {
        console.log('\nSample results (first 5):');
        rows.slice(0, 5).forEach((r, i) => {
          console.log(`  ${i + 1}. ${r.date} | ${r.lp} | ${r.fund} | ${r.metric} = ${r.value}`);
        });
      }

    } catch (tableErr) {
      console.log('   Could not scrape results table:', tableErr.message);
      grade = 'TABLE NOT FOUND';
    }

    // Error summary
    if (errors.length > 0) {
      console.log(`\nConsole errors (${errors.length}):`);
      errors.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 120)}`));
    }

    console.log('\nLive search quality test complete.');

  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    try {
      const body = await page.textContent('body');
      console.log('\n--- BODY CONTENT DUMP ---');
      console.log(body.substring(0, 1500).replace(/\s+/g, ' '));
      const html = await page.content();
      require('fs').writeFileSync('error_dump.html', html);
    } catch(e) {}
    await page.screenshot({ path: path.join(SHOTS, 'quality-ERROR.png'), fullPage: true });
    console.log('Error screenshot saved: quality-ERROR.png');
  } finally {
    await browser.close();
  }
})();
