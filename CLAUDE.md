# Control F

React SPA for `controlf.ai` — pension-fund document intelligence. Real extraction pipeline inside a polished demo shell. Do not rip out demo surfaces unless asked.

## Current Status (update after major work sessions)

**Phase:** Any-fund pipeline + demo prep. Core pipeline works for any US pension fund, not just hardcoded ones.
**Last completed:** Haiku domain resolution for unknown funds, Firecrawl 403-fallback for bot-protected sites, streaming Claude extraction, auto-retry on 0 PDFs, generic fund name extraction, always-clickable search button.
**Next up:** Date-range-aware PDF selection, extraction speed optimization. See memory file `project_current_priorities.md` for the full ranked list.

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
Query → queryParser.ts (entity + metric + asset-class extraction)
  → Known fund? sourceRegistry.ts (curated URLs)
  → Unknown fund? Haiku resolves domain → Firecrawl site-scoped search
  → getDocumentFamilyPreferences() hard-routes by query type
  → discoverSourceCandidates() scores + promotes preferred families
  → Firecrawl scrapes top 3 source pages for PDFs
  → If 0 PDFs: auto-retry remaining sources (never ask user to choose)
  → Preview scoring: pages 1-3 of top 5 PDFs scored locally
  → selectBestPdfWithLLM() with enriched preview data (Haiku)
  → PDF proxied via Vite middleware
  → If proxy 403: Firecrawl scrape fallback (bypasses bot protection)
  → Small PDF: direct to Claude | Large PDF: page-window scored, subsetted
  → Claude Sonnet streaming extraction → Metric[] JSON
  → computeCoverageScore() checks requested vs found
  → If partial: auto-retry with next-best PDF, merge + deduplicate
  → liveResultAssessment.ts evaluates match quality + completeness label
  → Results with answer summary block + evidence panel
```

## Key Files

**Shell:** `App.tsx` (routing, flying tracker), `AppContext.tsx` (state: searchQuery, apiKey, liveTracker, activeResults), `types.ts`
**Pages:** `SearchPage` `DashboardPage` `ResultsPage` `TrackersPage` `UploadPage` — all in `app/src/pages/`
**Engine:** `api.ts` `pdfFilter.ts` `searchFocus.ts` `liveResultAssessment.ts` `sourceRegistry.ts` — in `app/src/utils/` and `app/src/data/`
**Live tracker:** `LiveSearchTrackerCard.tsx` (~2200 lines, full workflow with preview scoring + auto-retry)
**Infrastructure:** `vite.config.ts` (PDF proxy endpoints), `extraction.log` (check FIRST when debugging)
**Benchmark:** `benchmark.ts` (101 tests — run with `npx tsx benchmark.ts`)

## Build & Run

From `app/`: `npm run dev` | `npm run build` | `npm run lint`
No test framework beyond `benchmark.ts`. No real backend — Vite middleware proxies PDFs in dev only.

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
- Any US pension fund works via Haiku domain resolution + Firecrawl
- Known registry funds: PSERS, Minnesota SBI, SAMCERA, ISBI, NM PERA
- Bot-protected sites (403): auto-fallback to Firecrawl scrape
- Root docs are git-tracked — careful creating files at repo root

## References

- `1.md` — product master spec
- `CODEX.md` — condensed guide for Codex agents
- `TARGET_CUSTOMERS.MD` — target-customer context for product and messaging decisions
- Memory files — project status, priorities, pipeline architecture, applied learning
