# Control F

React SPA demo for AI-powered pension fund document intelligence (controlf.ai). Built to show the founders (Giulio Comellini, Juan Agustin Tibaldo) that we can build the engine that feeds their product — not just a pretty UI.

## Product Vision

**The user is Sarah.** She works at a fund-of-funds in New York tracking infrastructure fund commitments across US pension funds. Today she opens 15 browser tabs, downloads PDFs, CTRL+F through them, and copies numbers into Excel. 45 minutes. She probably missed something because a fund name was redacted as "Fund AN."

**With Control F:** She opens the app. "3 new documents detected. 8 new metrics found." She sees the commitments, verifies each one against the source text in 2 seconds. Done in 2 minutes. She didn't miss Fund AN.

**What matters — every feature decision filters through these:**
1. **Don't make me check websites.** Check them for me.
2. **Show me what changed.** Not everything — just what's new since last time.
3. **Let me verify instantly.** Show the exact text from the document.
4. **Don't get it wrong.** One wrong number and I'll never trust you again.

**Design direction:**
- Evidence should feel like reading the actual document — clean typography, highlighted values, surrounding context. Not a code block or terminal dump.
- "What changed" is front and center. Alerts first, table second.
- The demo story is: "I built the engine that extracts accurately AND made the evidence look trustworthy."

## Build & Run

All commands run from the `app/` directory:

```bash
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build (type-check + bundle)
npm run lint      # ESLint (flat config, TS + React)
npm run preview   # Preview production build
```

No test framework is configured. Do not add one without being asked.

## Architecture

- **Entry:** `index.html` → `main.tsx` → `<StrictMode><AppProvider><App /></AppProvider></StrictMode>`
- **Routing:** No router library. `App.tsx` holds `useState<Page>` and renders pages conditionally. `Page = 'search' | 'results' | 'dashboard' | 'trackers' | 'upload'`
- **State:** React Context via `context/AppContext.tsx` (searchQuery, apiKey, hasSearched). No Redux.
- **Persistence:** `sessionStorage` only (`anthropic_key`, `saved_trackers`). Data lost on tab close — intentional for demo.
- **API:** `utils/api.ts` calls Anthropic Messages API directly from browser with `anthropic-dangerous-direct-browser-access` header.

### Directory Map (`app/src/`)

| Directory | Contents |
|-----------|----------|
| `components/` | Sidebar, CommandPalette, SettingsModal, Toast |
| `pages/` | SearchPage, ResultsPage, DashboardPage, TrackersPage, UploadPage |
| `context/` | AppContext (single provider) |
| `data/` | `types.ts` (all interfaces/types), `metrics.ts` (sample data + helper functions) |
| `hooks/` | useToast, useCountUp |
| `utils/` | api.ts (Claude PDF extraction), export.ts (CSV/JSON download) |

## Conventions

- **Named exports only.** `App.tsx` is the sole `export default` (Vite template).
- **File naming:** PascalCase for components/pages (`SearchPage.tsx`), camelCase for hooks/utils (`useToast.ts`).
- **Props:** Interfaces named `ComponentNameProps`, defined in the same file as the component.
- **Types:** Shared types centralized in `data/types.ts`. Interfaces for shapes, type aliases for unions.
- **Framer Motion:** `AnimatePresence mode="wait"` for page transitions, spring physics for interactions.
- **Tailwind:** Use semantic tokens (`bg-bg-card`, `text-text-secondary`, `border-border`). No raw hex in JSX.
- **Icons:** `lucide-react` only. Do not add other icon libraries.
- **Performance:** `useCallback` for prop callbacks, `useMemo` for derived data, immutable updates only.
- **Errors:** async/await + try-catch. Catch type is `unknown`, narrow with `instanceof Error`.
- **TypeScript:** Strict mode. `verbatimModuleSyntax` enabled — use `import type` for type-only imports.

## Design System

- **Dark theme only.** No light mode. No theme toggle.
- **Color tokens** defined in `app/src/index.css` via Tailwind `@theme`:
  - Backgrounds: `bg-primary` (#0a0b0f), `bg-secondary`, `bg-tertiary`, `bg-card` (#1a1b24), `bg-hover`
  - Text: `text-primary` (#f0f0f5), `text-secondary` (#9ca3af), `text-muted` (#6b7280)
  - Accent: `accent` (#6366f1), `accent-light` (#818cf8), `accent-glow`
  - Semantic: `green`, `yellow`, `red`, `blue`, `purple`, `orange`, `cyan`
  - Borders: `border` (#2a2b38), `border-light`
- **Font:** Inter (Google Fonts), weights 300-700.
- **Aesthetic:** Premium fintech, liquid-glass effects. Custom CSS animations in `index.css`: `shimmer`, `pulse-glow`, `scan-line`, `border-rotate`.
- **Animation timing:** Spring stiffness 350-400, damping 25-30. Enter/exit transitions 0.15-0.25s.

## Gotchas

- **No root `.gitignore`** — only `app/.gitignore` exists. Files created at repo root get tracked by git.
- **Vite proxy configured but unused** — `vite.config.ts` proxies `/api/anthropic`, but code calls Anthropic directly.
- **`verbatimModuleSyntax`** — bare import of a type (without `import type`) fails the build.
- **All sample data is hardcoded** in `data/metrics.ts`. This drives Results, Dashboard, and Trackers pages.
- **Keyboard shortcuts:** Cmd/Ctrl+K (command palette), Alt+1-5 (page nav), Escape (close modals).

## Applied Learning

When something fails repeatedly, when Dan has to re-explain, or when a workaround is found for a platform/tool limitation, add a one-line bullet here. Keep each bullet under 15 words. No explanations. Only add things that will save time in future sessions.

- _(No entries yet — add bullets as lessons emerge.)_

## Reference

- **`1.md`** — Master spec document. Source of truth for product requirements, data sources, page layouts, and design intent. Read this first for any feature work.
