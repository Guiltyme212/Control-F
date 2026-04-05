# AGENTS.md

Fast-start note for future collaborators on Control F.

## Read Order

Start here, then read:
- `PROJECT_CONTEXT.md`
- `CLAUDE.md`
- `CODEX.md`
- `1.md`
- `TARGET_CUSTOMERS.MD`

## Current Phase

As of 2026-04-05, the project is in UI testing and live-demo validation.

The highest-priority path is:
- Search
- source selection
- PDF discovery
- extraction
- Results

## Current Priority

The scraping and extraction experience is the most important part of the demo.

Current working conclusion:
- the live pipeline works end to end
- the current PSERS test run is not a good final answer yet
- the main issue is result quality and document choice, not a total pipeline outage

## What Not To Break

- Upload extraction
- Scrape URL extraction
- shared `activeResults` handoff
- live tracker animation flow
- approved-source search universe
- current dashboard/demo shell

## First Debugging Moves

When the live tracker looks wrong:
- check `app/extraction.log`
- compare the current run to `PROJECT_CONTEXT.md`
- use `app/test-live-search-quality.cjs` for focused reproduction
- use `app/test-walkthrough.cjs` for broader click-through coverage

## Important Current Finding

For the preset `PSERS private markets IRR, TVPI, DPI, and NAV`, a recent live run completed extraction but only matched `NAV`.

That means:
- `IRR`, `TVPI`, and `DPI` were still missing
- the answer quality was partial, not demo-ready
- performance-query source/PDF ranking still needs work

## Latest Working State

Current UI/debugging reality:
- use `http://127.0.0.1:5174`, not the preview port
- the tracker should now show the chosen source on the PDF screen instead of hiding it
- Settings save now propagates the Anthropic key into shared app state

## Agent Guidance

No sub-agents are currently active.

Spawn additional agents only if the work is split into clear, non-overlapping tasks. For most immediate debugging, one agent with the repo context is enough.
