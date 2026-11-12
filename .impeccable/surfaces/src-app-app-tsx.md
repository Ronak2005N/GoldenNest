---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: []
---

# Surface: Golden Nest PG Manager — full app (Operate)

Scope: restyle every screen of the existing app (shell, shared components, nine pages). Product truth, content, copy, behaviour, accessibility floors and the marigold brand stay untouched; only the visual world changes.

## Direction contract

THESIS: Frosted-glass chrome floating over a static daylight canvas, with containers reduced to hairlines — refusing the incumbent's uniform 2px-bordered white-card soup that reads as generated. Controls stay firm and oversized for the elderly owner; only surfaces get quiet.

OWN-WORLD: Warm daylight ground `#F8FAFC` deepened slightly with three static radial washes (marigold 10%, slate-blue 7%, emerald 6%) painted once behind everything — no animation. Brand marigold `#B45309` (kept from PRODUCT.md), ink `#0F172A`. Glass panels = rgba(255,255,255,.72–.78) + `backdrop-filter: blur(16px) saturate(1.5)` with a white top-edge highlight, applied ONLY to the four fixed chrome layers (sticky header, sidebar, bottom nav, modal overlay) with a solid fallback under `@supports`. Content cards = translucent white gradient, hairline `rgba(15,23,42,.07)` border, inset top highlight, soft offset shadow, never a blur. Radius scale: 1rem cards / .75rem controls / 1.25rem modals. One shadow language (offset + soft blur), one hairline weight for containers, 1.5–2px only on interactive controls. Badges quieted to 1px hairlines, still colour + words.

STORY: The owner opens the app and the glass chrome tells him where he is while the content beneath reads like paper on a lit desk; every control still shouts its size, every label still explains itself in plain English.

FIRST VIEWPORT: Sticky frosted header (GN mark + wordmark, backup buttons, oversized branch-switcher pills on their own row) over the washed canvas; glass sidebar of nine labelled nav items on laptop; page h1 + hint; first glass cards already visible below the fold line. Phone: frosted header row + fixed frosted bottom nav with labelled icons.

FORM: chosen form — glassmorphism light-theme refinement of the incumbent Operate layout; `seed: none (pinned)`, pinned by the user's words: "the UI is very AI made look make it better and minimilistic use glassmorphisum", confirmed by answer "Light frosted glass" and "Visual minimalism, keep the words".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Shipped (12 November 2026)

VERDICT: Shipped. The whole app now speaks one frosted-daylight voice — serif type at an 18px root, hairline containers, marigold used only where it means something, and blur reserved for the fixed chrome.

- Tokens: `src/index.css` rewritten — serif stack, remapped slate ramp, `.glass` / `.glass-strong` / `.glass-panel`, `.card`, `.well`, `.display` / `.headline` / `.title` / `.meta`, `sheet-in` motion.
- Shared UI: `src/shared/ui/index.tsx` — sentence-case buttons (primary / secondary / warn / success / danger / ghost), hairline badges, frosted modal sheet, tabular-numeral figures.
- Shell: floating glass sidebar and bottom nav, stronger glass on the header and the phone bar, edge fade showing the phone strip scrolls, active item kept in view (the old rAF scroll loop is gone).
- Pages: nine screens restyled — the bed grid is now quiet tiles instead of 60 repeated green buttons, the dashboard's two backup cards merged into one, charts recoloured to the world's palette, status badges shortened to words that fit.
- Verified: `npm run build` clean, `scripts/ui-smoke.ts` all checks pass, `scripts/shoot-review.ts` captures desktop + mobile with no JS errors and no horizontal overflow, `impeccable detect` reports 0 findings over the changed targets.
- Rasters: `.impeccable/review/*.png`, captured by `scripts/shoot-review.ts` against the production build.

## Round 2 — Inter, performance, bulk member entry (12 November 2026)

VERDICT: Shipped. The serif was the weak point, the forms were laggy, and 200+ members could not be entered by hand.

- Type: Georgia replaced by self-hosted Inter (variable woff2, latin + latin-ext, bundled in `src/assets/fonts/`) — no network at runtime. `DESIGN.md` typography rewritten around it.
- Performance: the modal sheet and its scrim lost their full-page `backdrop-filter` (the cause of the laggy, buffering scroll), the canvas went from two fixed layers to one, the header/nav blur was cut from 18–22px to 10–12px, room cards use `content-visibility: auto`, the room grid reads one pre-built occupancy map instead of rescanning members per room, and the Add Member form is split into memoised blocks. Measured with `scripts/perf-probe.mjs`: modal scroll 16.7 ms/frame (p95 18 ms) and 16 ms per keystroke, against 22 ms/frame with p95 67 ms before.
- Bulk member entry (`src/modules/members-bulk/`): "Add Many Members" on the Members page — paste rows straight from Excel, upload an .xlsx/.csv, or type a grid on screen; a live preview counts ready rows and names every skipped row with its reason; "Download Members (.xlsx)" exports the selected PG's list so the same file can be edited and brought back. Existing members are matched by mobile and updated instead of duplicated.
- Verified: `npm run build` clean, `scripts/ui-smoke.ts` all checks pass (including a new bulk-import section), `scripts/shoot-review.ts` clean, `impeccable detect` clean.
