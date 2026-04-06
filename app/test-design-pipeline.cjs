const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS = path.join(__dirname, 'test-screenshots', 'pipeline');
if (!fs.existsSync(SCREENSHOTS)) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
}

const BASE = 'http://localhost:5174';

async function clickElementByTextContains(page, ...texts) {
  for (const text of texts) {
    const locators = [
      page.locator(`text="${text}"`),
      page.locator(`button:has-text("${text}")`),
      page.locator(`[role="button"]:has-text("${text}")`),
      page.locator(`.preset:has-text("${text}")`),
      page.locator(`text=${text}`)
    ];
    for (const locator of locators) {
      if (await locator.count() > 0 && await locator.first().isVisible()) {
        await locator.first().click();
        return true;
      }
    }
  }
  return false;
}

(async () => {
  // Using headless:true but forcing rendering arguments to help with animations/charts
  const browser = await chromium.launch({ 
    headless: true, 
    args: ['--use-angle=swiftshader', '--enable-webgl', '--font-render-hinting=none'] 
  });
  
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Handle console output
  page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.text()}`));
  page.on('pageerror', error => console.error(`BROWSER ERROR: ${error.message}`));

  try {
    console.log('1. Navigating to landing page...');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    // Wait for initial fade-in animations to settle (accounting for black screens/animations loading out)
    console.log('   Waiting for entry animations...');
    await page.waitForTimeout(3000); 
    
    await page.screenshot({ path: path.join(SCREENSHOTS, '01-home.png'), fullPage: true });
    console.log('   Screenshot taken: 01-home.png');

    console.log('2. Clicking preset...');
    // The specific preset query from the master spec
    const presetClicked = await clickElementByTextContains(page, 'PSERS private markets IRR, TVPI', 'PSERS');
    if (!presetClicked) {
      console.log('   Could not find PSERS preset, dumping all button texts to console...');
      const btns = await page.$$eval('button, [role="button"], a', els => els.map(e => e.textContent.trim()).filter(Boolean));
      console.log('   Available buttons:', btns.slice(0, 15).join(' | '));
      throw new Error('Preset not found on page');
    }
    
    // The refinement card animates in
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS, '02-preset-clicked.png'), fullPage: true });
    console.log('   Screenshot taken: 02-preset-clicked.png');

    console.log('3. Clicking Start Tracking...');
    const trackClicked = await clickElementByTextContains(page, 'Start Tracking', 'Start', 'Search');
    if (!trackClicked) {
        console.log('   Could not find Start tag, passing...');
    }
    
    // Wait for transition to Dashboard
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '03-tracking-started.png'), fullPage: true });
    console.log('   Screenshot taken: 03-tracking-started.png');

    console.log('4. Waiting for dashboard & source choice...');
    // We wait an extended period because the tracker finds sources via API
    await page.waitForTimeout(6000);
    
    // Optionally wait for chart elements or SVG rendering if present
    try {
        await page.waitForSelector('.recharts-surface, svg path', { timeout: 3000 });
        await page.waitForTimeout(1000); // paint buffer
    } catch(e) {
        // Safe to ignore if charts don't exist yet
    }
    
    await page.screenshot({ path: path.join(SCREENSHOTS, '04-dashboard-sources.png'), fullPage: true });
    console.log('   Screenshot taken: 04-dashboard-sources.png');

    console.log('5. Extracting UI State info...');
    const bodyText = await page.textContent('body');
    const pageTextHead = bodyText.replace(/\s+/g, ' ').substring(0, 300);
    console.log(`   Content signature on Dashboard: ${pageTextHead}...`);

    console.log('Test walkthrough complete ✅');
  } catch (e) {
    console.error('Test failed:', e);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
})();
