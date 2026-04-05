# CODEX.md

Condensed guide for Codex-style agents. For full context see `CLAUDE.md`.

## Project

Control F — React SPA for pension-fund document intelligence. Real extraction pipeline inside a demo shell. Do not remove hardcoded demo surfaces unless asked.

## Commands

Run from `app/`:

```bash
npm run dev
npm run build
npm run lint
```

No test suite configured.

## Key Files

Shell: `App.tsx`, `AppContext.tsx`, `types.ts`
Pages: `SearchPage`, `DashboardPage`, `ResultsPage`, `TrackersPage`, `UploadPage` (all in `app/src/pages/`)
Engine: `sourceRegistry.ts`, `api.ts`, `pdfFilter.ts`, `searchFocus.ts`, `liveResultAssessment.ts` (in `app/src/utils/` and `app/src/data/`)
Infrastructure: `vite.config.ts`, `extraction.log`

## Environment

```
app/.env.local
VITE_FIRECRAWL_API_KEY
VITE_ANTHROPIC_API_KEY (optional)
```

## Guardrails

- Additive fixes over broad cleanup
- Preserve current design language
- Do not break Upload while improving Search
- Extraction success != answering the query — check match quality
- Result copy must follow query intent
- Check `extraction.log` before debugging

## References

- `CLAUDE.md` — full engineering guide
- `1.md` — product master spec
