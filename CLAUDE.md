# Control F

React SPA for `controlf.ai` — pension-fund document intelligence. Real extraction pipeline inside a polished demo shell. Do not rip out demo surfaces unless asked.

## Current Status (update after major work sessions)

**Phase:** Core pipeline works end-to-end. Focus is quality refinement.
**Last completed:** Live search-to-extraction bridge, shared activeResults model, smart PDF page filtering, query-aware ranking, match quality assessment, flying tracker animation, Control F.ai branding.
**Next up:** Auto-retry on weak/partial match (Priority 1). See memory file `project_current_priorities.md` for the full ranked list.

## Core User

Sarah — fund-of-funds analyst. Every decision follows:
1. Don't make me check websites.
2. Show me what changed.
3. Let me verify instantly.
4. Don't get it wrong.

## What's Real vs Demo

**Real:** Search → Firecrawl PDF discovery → Claude extraction → Results (with page filtering for large PDFs, match quality assessment). Three entry paths: Live Search, Upload PDF, Scrape URL — all publish to shared `activeResults`.

**Demo shell:** Dashboard stats/charts, some tracker cards, search presets, sample intelligence copy.

## The Pipeline

```
Query → searchFocus.ts (metric types + keywords)
  → sourceRegistry.ts (match to approved fund URLs)
  → Firecrawl scrapes source page for PDFs
  → PDFs ranked and user selects
  → PDF proxied via Vite middleware
  → Small PDF: direct to Claude | Large PDF: page-scored, subsetted, then to Claude
  → Claude returns Metric[] JSON
  → liveResultAssessment.ts evaluates match quality
  → Results table with evidence panel
```

## Key Files

**Shell:** `App.tsx` (routing, flying tracker), `AppContext.tsx` (state: searchQuery, apiKey, liveTracker, activeResults), `types.ts`
**Pages:** `SearchPage` `DashboardPage` `ResultsPage` `TrackersPage` `UploadPage` — all in `app/src/pages/`
**Engine:** `api.ts` `pdfFilter.ts` `searchFocus.ts` `liveResultAssessment.ts` `sourceRegistry.ts` — in `app/src/utils/` and `app/src/data/`
**Live tracker:** `LiveSearchTrackerCard.tsx` (1400+ lines, full workflow)
**Infrastructure:** `vite.config.ts` (PDF proxy endpoints), `extraction.log` (check FIRST when debugging)

## Build & Run

From `app/`: `npm run dev` | `npm run build` | `npm run lint`
No test framework. No real backend — Vite middleware proxies PDFs in dev only.

## Environment

`app/.env.local`: `VITE_FIRECRAWL_API_KEY` (required), `VITE_ANTHROPIC_API_KEY` (optional, can enter in-app). Browser calls Anthropic API directly.

## Working Rules

- Shared types from `types.ts`, results through `activeResults`
- Additive fixes over big cleanup passes
- Preserve current visual language unless explicitly redesigning
- Don't break Upload while improving Search
- Extraction success != answering the query — check match quality
- Result copy must follow query intent (don't call a performance search a "commitment failure")
- Design: premium, calm, dark-only, evidence-first
- Never use system binaries — npm packages only
- Check `extraction.log` before debugging stalled trackers
- Keep token usage lean — don't over-research or spawn many agents

## Gotchas

- Build passing != UX works (no browser harness)
- Some dashboard cards are intentionally hardcoded
- Large PDFs can be expensive if wrong file gets extracted
- Working sites: PSERS, Minnesota SBI, SAMCERA. Broken: ISBI, NM PERA
- Root docs are git-tracked — careful creating files at repo root

## References

- `1.md` — product master spec
- `CODEX.md` — condensed guide for Codex agents
- Memory files — project status, priorities, pipeline architecture, applied learning
