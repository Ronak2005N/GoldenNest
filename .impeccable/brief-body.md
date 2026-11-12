# Surface: Golden Nest PG Manager — full app (Operate)

Scope: restyle every screen of the existing app (shell, shared components, nine pages). Product truth, content, copy, behaviour, accessibility floors and the marigold brand stay untouched; only the visual world changes.

## Direction contract

THESIS: Frosted-glass chrome floating over a static daylight canvas, with containers reduced to hairlines — refusing the incumbent's uniform 2px-bordered white-card soup that reads as generated. Controls stay firm and oversized for the elderly owner; only surfaces get quiet.

OWN-WORLD: Warm daylight ground `#F8FAFC` deepened slightly with three static radial washes (marigold 10%, slate-blue 7%, emerald 6%) painted once behind everything — no animation. Brand marigold `#B45309` (kept from PRODUCT.md), ink `#0F172A`. Glass panels = rgba(255,255,255,.72–.78) + `backdrop-filter: blur(16px) saturate(1.5)` with a white top-edge highlight, applied ONLY to the four fixed chrome layers (sticky header, sidebar, bottom nav, modal overlay) with a solid fallback under `@supports`. Content cards = translucent white gradient, hairline `rgba(15,23,42,.07)` border, inset top highlight, soft offset shadow, never a blur. Radius scale: 1rem cards / .75rem controls / 1.25rem modals. One shadow language (offset + soft blur), one hairline weight for containers, 1.5–2px only on interactive controls. Badges quieted to 1px hairlines, still colour + words.

STORY: The owner opens the app and the glass chrome tells him where he is while the content beneath reads like paper on a lit desk; every control still shouts its size, every label still explains itself in plain English.

FIRST VIEWPORT: Sticky frosted header (GN mark + wordmark, backup buttons, oversized branch-switcher pills on their own row) over the washed canvas; glass sidebar of nine labelled nav items on laptop; page h1 + hint; first glass cards already visible below the fold line. Phone: frosted header row + fixed frosted bottom nav with labelled icons.

FORM: chosen form — glassmorphism light-theme refinement of the incumbent Operate layout; `seed: none (pinned)`, pinned by the user's words: "the UI is very AI made look make it better and minimilistic use glassmorphisum", confirmed by answer "Light frosted glass" and "Visual minimalism, keep the words".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
