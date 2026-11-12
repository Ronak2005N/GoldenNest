---
name: Golden Nest PG Manager
description: Light frosted-glass minimalism for a PG management app
colors:
  primary: "#b45309"
  neutral-bg: "#e9eef5"
  ink: "#0f172a"
  line: "#dfe6ef"
  good: "#047857"
  bad: "#b91c1c"
  warn: "#b45309"
  info: "#1d4ed8"
---
# Design System: Golden Nest PG Manager

## Overview

**Creative North Star: "The Golden Desk"** The interface feels like plain work sitting on a well-lit desk — glass panels float above a static daylight canvas, never AI-generated gloss or neon. The owner (an elderly PG manager) should never feel confused by decorative noise; every control must shout its size in plain English, and the marigold accent must remain rare enough to mean something. Key Characteristics: static daylight background, marigold accent used sparingly, hairline borders, ≥52px touch targets, plain-English labels, glass only on fixed chrome.

## Colors

Primary (#b45309): marigold accent — used on interactive controls, branch pills, modal highlights, and subtle surface tints. Its rarity is the point.

Neutral-bg (#e9eef5): daylight canvas — the static ground behind everything. Three once-painted radial washes (marigold 16%, slate-blue 13%, emerald 12%) sit beneath the surface but never animate, plus a 3px paper grain that keeps the canvas from reading as flat plastic.

Ink (#0f172a): body text, form labels, nav labels. The primary contrast color.

Muted ink (#475569): every secondary line — card sub-labels, hints, helper text. It is a slate tinted toward the ink, never a neutral grey; the stock Tailwind slate ramp is remapped to this world so no utility escapes the palette.

Line (#dfe6ef): hairline rules and card borders at 1px. A second, stronger line (#c3cddb) marks focusable and active edges.

Good (#047857): success states, positive numbers, valid indicators.

Bad (#b91c1c): error states, deficit numbers, invalid indicators.

Warn (#b45309): same as primary — used sparingly for warnings; marigold is the warning color too.

Info (#1d4ed8): calm informative accent — used on the few inert hints that need a distinct voice (AC rooms, privacy note). It never appears as a long banner.

Named Rules:
**The One Voice Rule.** The primary accent (marigold #b45309) is used on ≤10% of any given screen. Its rarity is the point.

**The Hairline Rule.** Borders on content cards are `rgba(15,23,42,.07)` at 1px. No 2px borders, no faux-depth via thick lines.

**The Glass-Only-on-Chrome Rule.** `backdrop-filter: blur(12px)` + saturate(1.5) + white top highlight appears only on the fixed chrome: sticky header, sidebar, bottom nav. Content cards receive no blur. Two denser variants exist for chrome that floats over scrolling content — `.glass-strong` (header, bottom nav) and `.glass-panel` (modal sheet) — so text passing underneath never competes with labels.

**The Blur Budget Rule.** Blur is expensive: a full-viewport backdrop blur forces the browser to re-blur the whole page on every scroll frame, which reads as lag on an old laptop. So the modal sheet and the scrim behind it carry **no** backdrop-filter at all — the sheet is frosted-looking paper instead — and the chrome blur stays small (10–12px) over a small area. Glass is never decorative here: it is either fixed chrome or it is nothing.

## Typography

Display Font: Inter (self-hosted variable woff2, latin + latin-ext) — page titles, section titles, every name

Body Font: Inter — body text, form labels, tables, money columns

Label Font: Inter — form field labels, compact meta lines

Character: One voice for the whole app. Inter was chosen over the earlier serif pairing because the owner reads numbers all day: Inter keeps a tall x-height and open counters at 18px, its semibold (600) holds up at large sizes where the old serif's bold went blotchy, and its tabular figures line the money columns up. The files ship inside the app, so nothing is fetched from the internet at runtime. Font-size: 18px root (12pt equivalent) per product contract.

Hierarchy:
- Display ([weight 400], [clamp(1.6rem,3.4vw,2.35rem)], [line-height 1.15]): page titles, hero heads
- Headline ([weight 500], [1.3rem], [line-height 1.3]): card section titles
- Title ([weight 500], [1.05rem], [line-height 1.4]): names, field section titles
- Body ([weight 400], [1rem], [line-height 1.55]): form help text, subtext
- Meta ([weight 400], [0.95rem], [line-height 1.45]): card labels, hints, meta lines
- Badge ([weight 700], [0.875rem], [uppercase], [tracking wide]): status chips only

Named Rules:
**The One Size Rule.** Root font-size is 18px. All other sizes derive from this scale; no arbitrary pixel sizes.

**The Sentence-Case Rule.** Buttons, field labels, and navigation are written in sentence case with plain words; only short status badges are set in caps. Full caps slow reading for the owner, and caps are never used to shout.

## Layout

Spatial model: fixed chrome (header, sidebar, bottom nav) + scrollable content area. Container max-width: 1440px; center-aligned with horizontal padding.

Density: generous vertical rhythm (4× base unit = 4rem = 64px). Base unit: 0.25rem = 4px.

Responsive breakpoints: sm at 640px. Below sm: single-column stack, bottom nav becomes full-width fixed bar, sidebar hides.

Container behavior: page content lives inside `main` with `pb-32 lg:pb-12`; the shell provides the horizontal padding (`px-4`) and vertical rhythm (`py-6`). Glass sidebar on lg+; on mobile it hides and the labelled items stack in the floating frosted bottom bar.

Named Rules:
**The Fixed-Chrome Rule.** Header (sticky, glass-strong), sidebar (floating glass panel, 288px wide on lg, hidden below lg), and bottom nav (floating frosted bar, inset from the edges on phones) are always present and never scroll away.

## Elevation & Depth

This system uses tonal layering — depth is conveyed by surface opacity and shadow, not by competing textures. The shadow vocabulary is minimal: one offset shadow used consistently on interactive controls (buttons, pills), and an inset highlight on card tops. Content cards have no shadow at rest; shadow appears only on hover/focus state.

Named Rules:
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, focus, active). The only structural shadow is the soft offset on pressed controls: `shadow-[0_1px_2px_rgb(15_23_42/0.08)]`.

## Shapes

Form language: corners are gently curved. Corner radius scale: controls at .75rem (12px), cards at 1rem (16px), modals at 1.25rem (20px). No sharp corners on any surface. Input fields and buttons share the same corner radius as their container.

Named Rules:
**The One Radius Rule.** All interactive controls use `.75rem` radius. All content cards use `1rem` radius. All modals use `1.25rem` radius.

## Components

### Buttons

Shape: `.75rem` radius, firm padding, sentence case, semibold.

Primary: background marigold `#b45309`, text white (`#fff`), hover background slightly deeper `#92400e`, soft offset shadow on rest, lift on hover.

Secondary: background `rgba(255,255,255,.70)`, border 1px hairline, text ink `#0f172a`, hover background white, hairline strengthens to `#c3cddb`.

Warn / Success / Danger: never solid slabs. A tinted fill (`rgba(...)` at ~10%), the semantic colour as text, and a hairline border of the same colour — quiet, but still loud enough to find.

Ghost: no background, text ink, hover background `rgba(15,23,42,.05)`, border none.

Disabled: opacity 0.4, pointer-events none.

### Badges

Shape: fully rounded (`rounded-full`), compact min-height 32px, inline-flex padding 3px vertical / 3.5px horizontal, text uppercase tracking-wide, font-size small.

Good: bg `rgba(4,120,87,.12)` border `rgba(4,120,87,.3)`, text good `#047857`.

Warn: bg `rgba(180,83,9,.14)` border `rgba(180,83,9,.3)`, text warn `#b45309` (marigold).

Bad: bg `rgba(185,28,28,.12)` border `rgba(185,28,28,.3)`, text bad `#b91c1c`.

Info: bg `rgba(29,78,216,.12)` border `rgba(29,78,216,.3)`, text info `#1d4ed8`.

Neutral: bg `rgba(15,23,42,.05)` border `rgba(15,23,42,.15)`, text ink `#0f172a`.

One pixel hairline border only. No soft shadows on badges. A badge never carries more than three words; long facts are written out as text beside it.

### Cards / Containers

Corner Style: 1rem radius.

Background: translucent white gradient `linear-gradient(165deg, rgba(255,255,255,.92), rgba(255,255,255,.7))` with inset top highlight `inset 0 1px 0 rgba(255,255,255,0.9)`.

Border: 1px hairline `rgba(15,23,42,.07)` only. No bottom border, no drop shadow at rest.

Internal Padding: 1rem vertical / 1.5rem horizontal minimum.

### Inputs / Fields

Style: border 1px hairline, background `rgba(255,255,255,.80)`, padding 0.25rem 0.5rem, radius .75rem, text ink, min-height 54px.

Focus: border color marigold `#b45309`, background solid white, no box-shadow, subtle color shift only.

Error: border color bad `#b91c1c`, text color bad, small error message below in text-bad.

Disabled: opacity 0.4, border color inert.

### Navigation

Style: items are pills with soft shadow, active item has marigold soft fill + marigold text.

Active: `bg-brand-soft` + `text-brand-dark`, with `shadow-[0_1px_2px_rgb(15_23_42/0.08)]` and `border-brand/30`.

Inactive: `text-ink`, hover `bg-white/70`, no shadow.

Mobile bottom nav: a floating frosted bar inset 3 units from the edges, labelled icons in a scroll-x strip, active item filled marigold-soft, others `text-slate-700`.

### Charts

The dashboard's three charts use the same palette as the interface: ink for revenue, marigold for expenses and the leading donut slice, a warm amber-to-slate ramp for the remaining donut slices, and ink for the net-profit line. No saturated blue series — blue belongs to the interface's informational voice, not to the money.

### Motion

One authored moment only: the modal sheet lifts onto the page (`sheet-in`, 180ms, exponential ease-out from the resting state) with the scrim fading in behind it. Everything else is press feedback: a 1px lift on hover, a 0.98 scale on press, 120–150ms transitions. `prefers-reduced-motion` collapses all of it.

### Performance

The app runs on an old laptop and a mid-range phone, so smoothness is a design rule, not an afterthought:

- One fixed background layer (washes + grain in a single gradient stack), never two.
- Long card lists (48 rooms, 14 Wi-Fi links) use `content-visibility: auto` so off-screen cards are not painted.
- The room grid reads occupancy from one pre-built map instead of rescanning every member per room.
- Long forms are split into memoised blocks, so typing a name never re-renders the room picker or the advance fields.
- Measured: modal scrolling 16.7 ms/frame (60fps, p95 18 ms) and one keystroke 16 ms, in software rendering without a GPU.

## Do's and Don'ts

### Do:
- Use marigold `#b45309` on ≤10% of any screen surface area.
- Keep content card borders at 1px `rgba(15,23,42,.07)`.
- Apply `backdrop-filter: blur(18px)` + `saturate(1.6)` only on fixed chrome layers; use `.glass-strong` for chrome over scrolling content and `.glass-panel` for the modal sheet.
- Set root font-size to 18px; scale all other text from this root.
- Make every touch target ≥52px tall (min-h-[54px]).
- Write all labels in plain English; never abbreviate beyond common understanding.
- Use hairline (`1px`) borders everywhere; never 2px unless context demands.
- Preserve ≥18px text size never to shrink below accessibility floor.

### Don't:
- Use 2px or heavier borders on content cards — hairline only.
- Apply `backdrop-filter: blur` to scrolling content or cards — only fixed chrome.
- Add animated washes or moving backgrounds — three static radial washes plus a paper grain, painted once behind everything.
- Use rounded corners smaller than `.75rem` on controls or larger than `1.25rem` on modals.
- Let the primary accent dominate — marigold must stay rare and meaningful.
- Shrink body text below 18px root Equivalent; no `text-xs` on form labels or primary buttons.
- Use system display faces (e.g. `-apple-system`) without a serif fallback; keep the Georgia/Serif pairing.
- Set long labels in caps; caps are for short status badges only.
- Repeat the same instruction on every control in a grid (e.g. "Vacant — tap to admit" on 60 bed buttons); state it once, then keep the tiles quiet.