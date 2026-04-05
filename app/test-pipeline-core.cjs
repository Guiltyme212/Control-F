const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:5174';
const SHOTS = path.join(__dirname, 'test-screenshots');

(async () => {
  console.log('Launching browser (headed)...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--force-color-profile=srgb'],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'dark',
  });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  try {
    // 1. Search page idle
    console.log('1. Loading search page...');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000); // let animations settle
    await page.screenshot({ path: path.join(SHOTS, 'pipeline-01-search-idle.png'), fullPage: true });
    console.log('   Screenshot: pipeline-01-search-idle.png');

    // Navigate to Search if not already there
    const searchNav = await page.$('button:has-text("Search")');
    if (searchNav) await searchNav.click();
    await page.waitForTimeout(1000);

    // 2. Click first preset pill
    console.log('2. Clicking preset pill...');
    const presetBtn = await page.$('button:has-text("PSERS private markets")');
    if (presetBtn) {
      await presetBtn.click();
      await page.waitForTimeout(1500); // refine bubble animates in
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-02-refine.png'), fullPage: true });
      console.log('   Screenshot: pipeline-02-refine.png');
    } else {
      console.log('   WARNING: Could not find preset pill');
    }

    // 3. Verify refine state
    console.log('3. Checking refine state...');
    const adjustText = await page.$('text=Adjust before tracking');
    const startBtn = await page.$('button:has-text("Start Tracking")');
    console.log(`   "Adjust before tracking": ${adjustText ? 'FOUND' : 'MISSING'}`);
    console.log(`   "Start Tracking" button: ${startBtn ? 'FOUND' : 'MISSING'}`);
    await page.screenshot({ path: path.join(SHOTS, 'pipeline-03-refine-chips.png'), fullPage: true });
    console.log('   Screenshot: pipeline-03-refine-chips.png');

    // 4. Click Start Tracking
    if (startBtn) {
      console.log('4. Starting tracking...');
      await startBtn.click();
      await page.waitForTimeout(800); // lifting phase
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-04-lifting.png'), fullPage: true });
      console.log('   Screenshot: pipeline-04-lifting.png');

      // 5. Thinking phase
      console.log('5. Waiting for thinking phase...');
      await page.waitForTimeout(2500); // mid-thinking
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-05-thinking.png'), fullPage: true });
      console.log('   Screenshot: pipeline-05-thinking.png');

      // 6. Morphing phase
      console.log('6. Waiting for morphing...');
      try {
        await page.waitForSelector('text=Tracker created', { timeout: 8000 });
      } catch {
        console.log('   "Tracker created" text not found, waiting more...');
        await page.waitForTimeout(3000);
      }
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-06-morphing.png'), fullPage: true });
      console.log('   Screenshot: pipeline-06-morphing.png');

      // 7. Dashboard arrival (after flying card)
      console.log('7. Waiting for dashboard...');
      await page.waitForTimeout(3000); // flying card + page transition
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-07-dashboard.png'), fullPage: true });
      console.log('   Screenshot: pipeline-07-dashboard.png');

      // 8. Charts verification
      console.log('8. Checking charts...');
      await page.waitForTimeout(2000); // let charts animate
      const chartsFound = await page.$$('.recharts-surface');
      const svgPaths = await page.$$('.recharts-surface path');
      console.log(`   Recharts surfaces: ${chartsFound.length}`);
      console.log(`   SVG paths in charts: ${svgPaths.length}`);
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-08-dashboard-charts.png'), fullPage: true });
      console.log('   Screenshot: pipeline-08-dashboard-charts.png');
    }

    // 9. Navigate to Results
    console.log('9. Navigating to Results...');
    const resultsNav = await page.$('button:has-text("Results")');
    if (resultsNav) {
      await resultsNav.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-09-results.png'), fullPage: true });
      console.log('   Screenshot: pipeline-09-results.png');
    }

    // 10. Navigate to Upload
    console.log('10. Navigating to Upload...');
    const uploadNav = await page.$('button:has-text("Upload")');
    if (uploadNav) {
      await uploadNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SHOTS, 'pipeline-10-upload.png'), fullPage: true });
      console.log('   Screenshot: pipeline-10-upload.png');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Console errors: ${errors.length}`);
    errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 120)}`));
    console.log('Pipeline test complete.');

  } catch (err) {
    console.error('TEST FAILED:', err.message);
    await page.screenshot({ path: path.join(SHOTS, 'pipeline-ERROR.png'), fullPage: true });
  } finally {
    await browser.close();
  }
})();
