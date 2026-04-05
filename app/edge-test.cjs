const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
const BASE_URL = 'http://localhost:5174';

(async () => {
  const consoleMessages = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const overflowIssues = [];
  const findings = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture all console messages
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
    if (msg.type() === 'error') consoleErrors.push(text);
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  try {
    // Navigate to app
    console.log('=== Navigating to app ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    // -------------------------------------------------------
    // TEST 1: Empty search submission
    // -------------------------------------------------------
    console.log('\n=== TEST 1: Empty search submission ===');
    // Look for search input
    const searchInput = await page.$('input[type="text"], input[type="search"], textarea');
    if (searchInput) {
      // Clear the input first
      await searchInput.fill('');
      // Try to submit by pressing Enter
      await searchInput.press('Enter');
      await page.waitForTimeout(800);

      // Check if there's any error message or if the app silently ignores it
      const bodyText = await page.textContent('body');
      if (bodyText.includes('required') || bodyText.includes('empty') || bodyText.includes('enter a')) {
        findings.push('TEST 1: App shows error message for empty search - GOOD');
      } else {
        findings.push('TEST 1: No visible error/validation message for empty search submission');
      }
    } else {
      findings.push('TEST 1: No search input found on initial page');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-01-empty-search.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 2: Very long string (200+ chars)
    // -------------------------------------------------------
    console.log('\n=== TEST 2: Very long input string ===');
    const longString = 'A'.repeat(250) + ' pension fund IRR TVPI DPI NAV performance metrics quarterly report analysis';
    const searchInput2 = await page.$('input[type="text"], input[type="search"], textarea');
    if (searchInput2) {
      await searchInput2.fill('');
      await searchInput2.fill(longString);
      await page.waitForTimeout(500);
      const inputValue = await searchInput2.inputValue();
      findings.push(`TEST 2: Input accepted ${inputValue.length} chars (sent ${longString.length}). ${inputValue.length === longString.length ? 'No truncation.' : 'TRUNCATED!'}`);

      // Check for visual overflow
      const inputBox = await searchInput2.boundingBox();
      if (inputBox) {
        findings.push(`TEST 2: Input dimensions: ${Math.round(inputBox.width)}x${Math.round(inputBox.height)}`);
      }
    } else {
      findings.push('TEST 2: No search input found');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-02-long-input.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 3: Special characters / XSS attempt
    // -------------------------------------------------------
    console.log('\n=== TEST 3: XSS / special characters ===');
    const xssString = "<script>alert('xss')</script>";
    const searchInput3 = await page.$('input[type="text"], input[type="search"], textarea');
    if (searchInput3) {
      await searchInput3.fill('');
      await searchInput3.fill(xssString);
      await page.waitForTimeout(500);

      // Check if script tag appears as rendered HTML (bad) vs escaped text (good)
      const pageContent = await page.content();
      if (pageContent.includes("<script>alert('xss')</script>") && !pageContent.includes("&lt;script&gt;")) {
        // Check if it's just in an input value attribute (that's fine in React)
        const inInputOnly = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script');
          for (const s of scripts) {
            if (s.textContent.includes("alert('xss')")) return false;
          }
          return true;
        });
        if (inInputOnly) {
          findings.push('TEST 3: XSS string in input value only (React handles this safely) - OK');
        } else {
          findings.push('TEST 3: WARNING - XSS script tag may be rendered in DOM!');
        }
      } else {
        findings.push('TEST 3: XSS string properly handled/escaped - GOOD');
      }

      // Try submitting the XSS string
      await searchInput3.press('Enter');
      await page.waitForTimeout(800);

      // Check for any dialog/alert
      let alertFired = false;
      page.on('dialog', async (dialog) => {
        alertFired = true;
        await dialog.dismiss();
      });
      await page.waitForTimeout(500);
      findings.push(`TEST 3: Alert dialog fired: ${alertFired}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-03-special-chars.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 4: Rapid navigation clicks
    // -------------------------------------------------------
    console.log('\n=== TEST 4: Rapid navigation clicks ===');
    // Find sidebar nav buttons
    const navButtons = await page.$$('nav button');
    findings.push(`TEST 4: Found ${navButtons.length} nav buttons`);

    if (navButtons.length >= 2) {
      const errorsBefore = consoleErrors.length;
      for (let i = 0; i < 5; i++) {
        await navButtons[0].click();
        await page.waitForTimeout(50);
        await navButtons[Math.min(2, navButtons.length - 1)].click();
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);
      const errorsAfter = consoleErrors.length;
      if (errorsAfter > errorsBefore) {
        findings.push(`TEST 4: ${errorsAfter - errorsBefore} new console errors during rapid nav`);
      } else {
        findings.push('TEST 4: No console errors during rapid navigation - GOOD');
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-04-rapid-nav.png'), fullPage: true });

    // Navigate back to search for remaining tests
    if (navButtons.length > 0) {
      await navButtons[0].click();
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------
    // TEST 5: Settings / gear icon interaction
    // -------------------------------------------------------
    console.log('\n=== TEST 5: Settings modal ===');
    // Look for settings button (gear icon)
    const settingsBtn = await page.$('button:has(svg), [aria-label*="settings" i], [aria-label*="Settings" i]');
    // Try broader: look for any gear-like button in the header area
    const allButtons = await page.$$('button');
    let settingsClicked = false;
    for (const btn of allButtons) {
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      if ((text && text.toLowerCase().includes('setting')) ||
          (ariaLabel && ariaLabel.toLowerCase().includes('setting')) ||
          (title && title.toLowerCase().includes('setting'))) {
        await btn.click();
        settingsClicked = true;
        await page.waitForTimeout(800);
        findings.push('TEST 5: Found and clicked settings button');
        break;
      }
    }

    if (!settingsClicked) {
      // Try Cmd+K or Ctrl+K for command palette
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(600);
      const palette = await page.$('[role="dialog"], [class*="command"], [class*="palette"], [class*="modal"]');
      if (palette) {
        findings.push('TEST 5: Command palette opened with Ctrl+K');
      } else {
        // Try Ctrl+, for settings
        await page.keyboard.press('Control+,');
        await page.waitForTimeout(600);
        findings.push('TEST 5: Tried Ctrl+K and Ctrl+, - checking for modals');
      }
    }

    // Check for any visible modal/dialog
    const modals = await page.$$('[role="dialog"], [class*="modal"], [class*="overlay"]');
    findings.push(`TEST 5: Found ${modals.length} modal/dialog elements visible`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-05-settings.png'), fullPage: true });

    // Close any open modals by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------
    // TEST 6: Mobile viewport (375x667)
    // -------------------------------------------------------
    console.log('\n=== TEST 6: Mobile viewport ===');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(800);

    // Check for horizontal overflow
    const mobileOverflow = await page.evaluate(() => {
      const issues = [];
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 5 && rect.width > 0) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className ? (typeof el.className === 'string' ? el.className.substring(0, 60) : '') : '';
          issues.push(`${tag}.${cls} overflows: right=${Math.round(rect.right)} > viewport=${window.innerWidth}`);
        }
      }
      return issues.slice(0, 10); // Limit to 10
    });

    if (mobileOverflow.length > 0) {
      findings.push(`TEST 6: MOBILE OVERFLOW ISSUES (${mobileOverflow.length}):`);
      mobileOverflow.forEach(i => findings.push(`  - ${i}`));
      overflowIssues.push(...mobileOverflow.map(i => `[mobile] ${i}`));
    } else {
      findings.push('TEST 6: No horizontal overflow at mobile size - GOOD');
    }

    // Check if sidebar is visible (it probably shouldn't be at mobile)
    const sidebar = await page.$('.w-60, [class*="sidebar"]');
    if (sidebar) {
      const sidebarBox = await sidebar.boundingBox();
      if (sidebarBox && sidebarBox.x >= 0 && sidebarBox.width > 0) {
        findings.push(`TEST 6: Sidebar is visible at mobile size (${Math.round(sidebarBox.width)}px wide) - may need responsive hiding`);
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-06-mobile.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 7: Tablet viewport (768x1024)
    // -------------------------------------------------------
    console.log('\n=== TEST 7: Tablet viewport ===');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(800);

    const tabletOverflow = await page.evaluate(() => {
      const issues = [];
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 5 && rect.width > 0) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className ? (typeof el.className === 'string' ? el.className.substring(0, 60) : '') : '';
          issues.push(`${tag}.${cls} overflows: right=${Math.round(rect.right)} > viewport=${window.innerWidth}`);
        }
      }
      return issues.slice(0, 10);
    });

    if (tabletOverflow.length > 0) {
      findings.push(`TEST 7: TABLET OVERFLOW ISSUES (${tabletOverflow.length}):`);
      tabletOverflow.forEach(i => findings.push(`  - ${i}`));
      overflowIssues.push(...tabletOverflow.map(i => `[tablet] ${i}`));
    } else {
      findings.push('TEST 7: No horizontal overflow at tablet size - GOOD');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-07-tablet.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 8: Click on cards/results
    // -------------------------------------------------------
    console.log('\n=== TEST 8: Card clicks ===');
    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // Navigate to Results page
    const navBtns2 = await page.$$('nav button');
    for (const btn of navBtns2) {
      const text = await btn.textContent();
      if (text && text.includes('Results')) {
        await btn.click();
        await page.waitForTimeout(800);
        break;
      }
    }

    // Look for any clickable cards
    const cards = await page.$$('[class*="card"], [class*="Card"], [role="button"], [class*="metric"], [class*="result"]');
    findings.push(`TEST 8: Found ${cards.length} card-like elements on Results page`);

    if (cards.length > 0) {
      const errorsBefore = consoleErrors.length;
      await cards[0].click();
      await page.waitForTimeout(500);
      if (consoleErrors.length > errorsBefore) {
        findings.push('TEST 8: Console error after clicking card');
      } else {
        findings.push('TEST 8: Card click handled without errors');
      }
    }

    // Also try Dashboard
    for (const btn of navBtns2) {
      const text = await btn.textContent();
      if (text && text.includes('Dashboard')) {
        await btn.click();
        await page.waitForTimeout(800);
        break;
      }
    }

    const dashCards = await page.$$('[class*="card"], [class*="Card"], [class*="rounded-xl"], [class*="rounded-lg"]');
    findings.push(`TEST 8: Found ${dashCards.length} card-like elements on Dashboard`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-08-card-click.png'), fullPage: true });

    // -------------------------------------------------------
    // TEST 9: Overflow check at default viewport
    // -------------------------------------------------------
    console.log('\n=== TEST 9: Desktop overflow check ===');
    const desktopOverflow = await page.evaluate(() => {
      const issues = [];
      const docWidth = document.documentElement.scrollWidth;
      const vpWidth = window.innerWidth;
      if (docWidth > vpWidth) {
        issues.push(`Document scrollWidth (${docWidth}) > viewport (${vpWidth})`);
      }
      const docHeight = document.documentElement.scrollHeight;
      issues.push(`Page height: ${docHeight}px`);
      return issues;
    });
    desktopOverflow.forEach(i => findings.push(`TEST 9: ${i}`));

    // -------------------------------------------------------
    // TEST 10: Console errors/warnings summary
    // -------------------------------------------------------
    console.log('\n=== TEST 10: Console errors/warnings summary ===');
    findings.push(`TEST 10: Total console errors: ${consoleErrors.length}`);
    findings.push(`TEST 10: Total console warnings: ${consoleWarnings.length}`);

    if (consoleErrors.length > 0) {
      findings.push('TEST 10: Console errors:');
      // Deduplicate
      const unique = [...new Set(consoleErrors)];
      unique.forEach(e => findings.push(`  ERROR: ${e.substring(0, 200)}`));
    }
    if (consoleWarnings.length > 0) {
      findings.push('TEST 10: Console warnings:');
      const unique = [...new Set(consoleWarnings)];
      unique.slice(0, 10).forEach(w => findings.push(`  WARN: ${w.substring(0, 200)}`));
    }

  } catch (err) {
    console.error('Test script error:', err.message);
    findings.push(`SCRIPT ERROR: ${err.message}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'edge-error.png'), fullPage: true }).catch(() => {});
  }

  await browser.close();

  // Print all findings
  console.log('\n\n========================================');
  console.log('       EDGE CASE TEST RESULTS');
  console.log('========================================\n');
  findings.forEach(f => console.log(f));
  console.log('\n========================================');
  console.log(`Total overflow issues found: ${overflowIssues.length}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('========================================');
})();
