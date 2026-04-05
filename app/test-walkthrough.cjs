const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname, 'test-screenshots');
const BASE = 'http://localhost:5174';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // 1. Landing page
    console.log('1. Opening landing page...');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '01-landing.png'), fullPage: true });
    console.log('   Screenshot: 01-landing.png');

    // 2. Full page of landing/dashboard
    const bodyText = await page.textContent('body');
    console.log('   Page title area text (first 300 chars):', bodyText.substring(0, 300).replace(/\s+/g, ' '));
    await page.screenshot({ path: path.join(SCREENSHOTS, '02-landing-full.png'), fullPage: true });
    console.log('   Screenshot: 02-landing-full.png');

    // Log all visible nav items and buttons
    const navItems = await page.$$eval('nav a, nav button, [role="navigation"] a, [role="navigation"] button, header a, header button, aside a, aside button', els =>
      els.map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 50), classes: e.className.substring(0, 80) }))
    );
    console.log('   Nav/header elements:', JSON.stringify(navItems, null, 2));

    // Also look for any clickable elements with search-related text
    const allButtons = await page.$$eval('button, a, [role="button"]', els =>
      els.map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 60) })).filter(e => e.text.length > 0)
    );
    console.log('   All clickable elements with text:', JSON.stringify(allButtons.slice(0, 30), null, 2));

    // 3. Navigate to Search
    console.log('3. Looking for Search nav...');
    // Try multiple selectors for search navigation
    let searchClicked = false;
    const searchSelectors = [
      'text=Search',
      'text=search',
      'a:has-text("Search")',
      'button:has-text("Search")',
      '[data-page="search"]',
      'nav >> text=Search',
    ];
    for (const sel of searchSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          searchClicked = true;
          console.log(`   Clicked search via: ${sel}`);
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!searchClicked) {
      console.log('   Could not find Search nav, trying to find any search input...');
      const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search"]');
      if (searchInput) {
        await searchInput.click();
        console.log('   Clicked on search input directly');
      }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '03-search-page.png'), fullPage: true });
    console.log('   Screenshot: 03-search-page.png');

    // 4. Look for preset pills/buttons
    console.log('4. Looking for preset pills...');
    // Dump all visible buttons on this page
    const searchPageButtons = await page.$$eval('button, [role="button"]', els =>
      els.map(e => ({ text: e.textContent.trim().substring(0, 80), visible: e.offsetParent !== null })).filter(e => e.text.length > 0 && e.visible)
    );
    console.log('   Visible buttons on search page:', JSON.stringify(searchPageButtons.slice(0, 20), null, 2));

    let presetClicked = false;
    // Look for preset-like elements (pills, chips, quick-search items)
    const presetSelectors = [
      'button:has-text("commitment")',
      'button:has-text("Commitment")',
      'button:has-text("IRR")',
      'button:has-text("performance")',
      'button:has-text("PERA")',
      'button:has-text("pension")',
      'button:has-text("termination")',
      '.preset',
      '[class*="preset"]',
      '[class*="pill"]',
      '[class*="chip"]',
      '[class*="suggestion"]',
    ];
    for (const sel of presetSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const txt = await el.textContent();
          await el.click();
          presetClicked = true;
          console.log(`   Clicked preset: "${txt.trim().substring(0, 60)}" via ${sel}`);
          break;
        }
      } catch (e) { /* try next */ }
    }
    if (!presetClicked) {
      console.log('   No preset found, trying to type a query manually...');
      const input = await page.$('input, textarea');
      if (input) {
        await input.fill('NM PERA recent commitments');
        console.log('   Typed query manually');
      }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS, '04-preset-selected.png'), fullPage: true });
    console.log('   Screenshot: 04-preset-selected.png');

    // 5. Submit search
    console.log('5. Looking for search submit button...');
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Go")',
      'button:has-text("Search")',
      'button:has-text("search")',
      'button:has-text("Find")',
      'button:has-text("Submit")',
      'button:has-text("Run")',
      'form button',
      'button svg', // icon button near search
    ];
    let submitClicked = false;
    for (const sel of submitSelectors) {
      try {
        const els = await page.$$(sel);
        for (const el of els) {
          const visible = await el.isVisible();
          if (visible) {
            const txt = await el.textContent();
            await el.click();
            submitClicked = true;
            console.log(`   Clicked submit: "${txt.trim().substring(0, 40)}" via ${sel}`);
            break;
          }
        }
        if (submitClicked) break;
      } catch (e) { /* try next */ }
    }
    if (!submitClicked) {
      // Try pressing Enter in the input
      const input = await page.$('input, textarea');
      if (input) {
        await input.press('Enter');
        console.log('   Pressed Enter to submit');
        submitClicked = true;
      }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '05-search-submitted.png'), fullPage: true });
    console.log('   Screenshot: 05-search-submitted.png');

    // 6. Wait for animation
    console.log('6. Waiting 2s for animation...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '06-after-search.png'), fullPage: true });
    console.log('   Screenshot: 06-after-search.png');

    // 7. Navigate to Dashboard
    console.log('7. Navigating to Dashboard...');
    const dashSelectors = [
      'text=Dashboard',
      'text=dashboard',
      'a:has-text("Dashboard")',
      'button:has-text("Dashboard")',
      'nav >> text=Dashboard',
    ];
    let dashClicked = false;
    for (const sel of dashSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          dashClicked = true;
          console.log(`   Clicked Dashboard via: ${sel}`);
          break;
        }
      } catch (e) { /* try next */ }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '07-dashboard.png'), fullPage: true });
    console.log('   Screenshot: 07-dashboard.png');

    // 8. Navigate to Results
    console.log('8. Navigating to Results...');
    const resultsSelectors = [
      'text=Results',
      'text=results',
      'a:has-text("Results")',
      'button:has-text("Results")',
    ];
    let resultsClicked = false;
    for (const sel of resultsSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          resultsClicked = true;
          console.log(`   Clicked Results via: ${sel}`);
          break;
        }
      } catch (e) { /* try next */ }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '08-results.png'), fullPage: true });
    console.log('   Screenshot: 08-results.png');

    // 9. Navigate to Upload
    console.log('9. Navigating to Upload...');
    const uploadSelectors = [
      'text=Upload',
      'text=upload',
      'a:has-text("Upload")',
      'button:has-text("Upload")',
    ];
    let uploadClicked = false;
    for (const sel of uploadSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          uploadClicked = true;
          console.log(`   Clicked Upload via: ${sel}`);
          break;
        }
      } catch (e) { /* try next */ }
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '09-upload.png'), fullPage: true });
    console.log('   Screenshot: 09-upload.png');

    // 10. Final full-page screenshot
    console.log('10. Final screenshot...');
    await page.screenshot({ path: path.join(SCREENSHOTS, '10-final.png'), fullPage: true });
    console.log('   Screenshot: 10-final.png');

    // Summary
    console.log('\n=== CONSOLE ERRORS ===');
    if (consoleErrors.length === 0) {
      console.log('No console errors detected.');
    } else {
      consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }

    console.log('\n=== FINAL PAGE STATE ===');
    const finalText = await page.textContent('body');
    console.log('Final page text (first 500 chars):', finalText.substring(0, 500).replace(/\s+/g, ' '));

  } catch (err) {
    console.error('Test error:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS, 'error.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    console.log('\nDone. Screenshots saved to:', SCREENSHOTS);
  }
})();
