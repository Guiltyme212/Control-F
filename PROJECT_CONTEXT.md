# PROJECT_CONTEXT.md

Current durable project memory for Control F.

## Snapshot

Date: 2026-04-05

Current step:
- UI testing

Current goal:
- make the live search to scraping to extraction demo reliable enough to show live

Most important product area:
- the scraping and extraction flow

## What We Are Building

Control F is a polished demo app for pension-fund document intelligence.

The intended live story is:
1. Search a real pension-fund question.
2. Find the right approved source page.
3. Discover the best PDF candidates.
4. Extract targeted financial metrics.
5. Review evidence-rich results.

## Current Manual Test Flow

This is the flow currently being tested live:

1. Open Search and wait for the initial animations to settle.
2. Click the preset `PSERS private markets IRR, TVPI, DPI, and NAV`.
3. Click `Start Tracking` after the refine card loads.
4. Wait for the tracker to move into Dashboard.
5. Choose a source such as `Asset Allocation and Performance`.
6. Wait for PDF discovery and review the candidate list.
7. Select a PDF, then click `Extract PDF` or the extract action.
8. Wait through extraction. This can take 1 to 4 minutes.
9. Open `Review Results`.
10. Judge whether the results actually answer the query, not just whether extraction finished.

## Current Observed Result

The recent PSERS run is not a good final result.

Why:
- the run completed
- metrics were extracted
- but the result only matched `NAV`
- `IRR`, `TVPI`, and `DPI` were still missing

Current quality label:
- partial match

This means the app is working technically, but not yet answering the performance query well enough.

## What The Current Failure Probably Means

This looks like a source-ranking or PDF-ranking problem, not a full scraping outage.

Most likely interpretation:
- the app found a real PSERS document
- the chosen PDF was in the wrong family for a private-markets performance query
- it surfaced broad financial statement or allocation data instead of the requested performance multiples

In other words:
- extraction success does not equal answer quality

## Immediate Next Step

The next step is to improve reproduction and document-choice quality before broad UI changes.

Recommended sequence:
1. Reproduce the PSERS flow again with one focused run at a time.
2. Check `app/extraction.log` during and after the run.
3. Inspect which source and PDF were chosen.
4. Prefer private-markets performance reviews or combined portfolio reports over generic financial statements.
5. Re-run until the result is at least strong enough to review for `IRR`, `TVPI`, `DPI`, and `NAV`.

## Latest UI Fixes

As of 2026-04-05 later in the session:
- the tracker now keeps the winning source visible after auto-advance into the PDF step
- the PDF screen shows which source won and the source score
- for the recent PSERS flow, the current recommended source is `Asset Allocation and Performance`
- the current first recommended PDF is `psers portfolio quarterly public disclosure report q3-25.pdf`
- Anthropic key handling was repaired so Settings now pushes the saved key into shared app state
- local env now includes `VITE_ANTHROPIC_API_KEY` for the dev server

Current test URL:
- `http://127.0.0.1:5174`

## Important Interpretation For Future Sessions

Do not describe the current issue as "scraping is totally broken."

A more accurate statement is:
- the live pipeline works
- the current PSERS performance run is choosing or surfacing the wrong document
- the highest-value fix is better source and PDF selection for focused performance queries

## Automation Notes

Relevant reproduction files:
- `app/test-live-search-quality.cjs`
- `app/test-walkthrough.cjs`

Important note:
- `app/test-live-search-quality.cjs` currently clicks the first available PDF checkbox
- that is useful for reproducing the weak or partial result
- it is not yet a reliable golden-path quality test

## Key Files For The Current Problem

- `app/src/utils/api.ts`
- `app/src/utils/pdfFilter.ts`
- `app/src/utils/searchFocus.ts`
- `app/src/utils/liveResultAssessment.ts`
- `app/src/data/sourceRegistry.ts`
- `app/extraction.log`

## Product Rules To Preserve

- Keep the app feeling like one trustworthy product.
- Do not remove the demo dashboard shell unless explicitly asked.
- Do not break Upload while improving Search.
- Judge quality by query fit, not by whether numbers were extracted.
- Be careful with repeated extraction runs because cost matters.

## Current Working Verdict

Current verdict on the showcased PSERS run:
- good pipeline demo
- bad final answer quality

Current mission:
- get the live search demo from partial extraction success to trustworthy metric coverage
