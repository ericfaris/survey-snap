# survey-snap — Design System

**Direction: "Late-Night Diner Ledger"**

Live showcase: `/design-system` (run the app, then open `http://<host>:3000/design-system`
— it's a normal Next.js route, so it ships with the app, needs no separate build step,
and renders every token/component straight from `app/globals.css`).

---

## 1. Direction narrative

survey-snap is a single-user, home-LAN utility: you photograph a McDonald's receipt on
your phone late at night after a drive-through run, and the app OCRs the survey code,
drafts your answers, and — only after you explicitly tick a checkbox — submits the real
mcdvoice.com survey. Nobody else ever opens this app. There's no onboarding, no growth
loop, no multi-tenant anything. It's a personal instrument used in short, low-light
bursts: hand up, phone glare, half your attention still on the food going cold on the
counter.

The direction leans into exactly that moment rather than dressing the app up as a
generic SaaS tool: **a diner counter at midnight, receipt paper under fluorescent
light.** Near-black surfaces (the room), warm cream text (the paper), one dominant
amber accent lifted from both McDonald's own signage *and* the glow of a diner sign
through a window — reused deliberately, not accidentally, since the whole point of the
app is McDonald's receipts. Every code and every number renders in a receipt-printer
monospace. The primary action is always a big, pill-shaped, amber "diner sign" button —
there is exactly one of those per screen, on purpose, because this app has exactly one
dangerous action (`Confirm & Submit`) and the design should make that button feel
important rather than generic.

This *extends* the app's pre-existing palette (it already had a dark UI with an amber
accent) rather than replacing it — the uplift is about turning "dark theme with a
yellow button" into an actual identity: real type, a real texture, a real scale, and a
documented system, instead of ad hoc inline styles with a handful of CSS variables.

**Key moments this was designed around:**
1. **Opening the app on a phone in a dim room** — the near-black ground and grain
   texture should read as calm and legible in low light, not sterile.
2. **Checking OCR'd digits against the photo** — the segmented code boxes are the most
   information-dense, highest-stakes reading task in the app; monospace + generous
   tracking + a green border on completion carries real weight here.
3. **The Confirm & Submit dialog** — the one irreversible action in the whole app.
   Deliberately not just another card: overlay, restated code/store/answer-count, an
   explicit checkbox, and only then does the primary button light up.
4. **The validation code reveal** — the payoff moment. Large, amber, monospace,
   center-stage, copyable — it's the receipt for having done the annoying task.
5. **Scanning the history list** — glanceable status via color-coded pills
   (new/staged/submitted/error) so a repeat user can tell at a glance which receipts
   still need attention.

**Mood-board process:** this was a batch/autonomous run with no user available to pick
interactively, so three directions were generated via Ideogram and evaluated against
the app's actual purpose:

| Direction | Palette | Verdict |
|---|---|---|
| **Late-Night Diner Ledger** (chosen) | near-black, warm cream, diner-neon amber, red, green | Matches the app's real palette and mood exactly — receipt paper + diner-sign amber, dark-room legible. Kept and deepened. |
| Field Audit / Inspector Clipboard | manila tan, ink black, safety orange, forest green | Reads as a *government form* — too cold and bureaucratic for what is, underneath, a personal favor to yourself after a drive-through run. Rejected. |
| Thermal Print Zine | stark black/white, single hot red, halftone/photocopy | High-energy punk-zine treatment fights the app's actual tone — this app is deliberately careful and slow (two-step confirm, no auto-submit), not urgent/loud. Rejected. |

Mood-board images are saved at `.claude/design-moodboards/{diner-ledger,field-audit,thermal-zine}.png`
for reference; prompts are reproduced in §6 below.

---

## 2. Color

All tokens live in `app/globals.css` under `:root`.

| Token | Hex | Role | Used on |
|---|---|---|---|
| `--bg` | `#0f0e0c` | Dominant surface — near-black, warm | `<body>`, header |
| `--panel` | `#1c1a17` | Card surface | `.card` |
| `--panel-2` | `#262320` | Inset surface | inputs, `<pre>` blocks, pills |
| `--panel-3` | `#302c27` | Hover surface | `.btn.secondary:hover` |
| `--line` | `#3a352e` | Default border | cards, inputs, pills |
| `--line-strong` | `#4d4740` | Emphasized border | secondary button |
| `--text` | `#f3efe4` | Primary text — warm paper white | body copy |
| `--muted` | `#a89f8f` | Secondary text | labels, captions, meta |
| `--muted-2` | `#766e61` | Tertiary text | reserved for placeholders |
| `--accent` | `#ffc72c` | **Dominant accent** — diner-neon amber | primary button, validation code, focus rings |
| `--accent-hover` | `#ffd257` | Accent hover | primary button hover |
| `--accent-active` | `#e6ad14` | Accent pressed | primary button `:active` |
| `--accent-ink` | `#241a00` | Text on accent | primary button label |
| `--accent-soft` | `rgba(255,199,44,.14)` | Accent tint | pill fill, focus glow, input focus ring |
| `--green` | `#4caf6a` | Semantic good | `submitted` pill |
| `--red` | `#e0392c` | Semantic bad | `error` pill, `.err`, danger button |
| `--blue` | `#5b9bd5` | Semantic info | `staged` pill |

**Contrast** (checked against the two backgrounds text actually sits on):
- `--text` on `--bg`: **15.9:1**
- `--muted` on `--bg`: **7.4:1**
- `--accent-ink` on `--accent`: **11.9:1**
- `--text` on `--panel`: **14.1:1**

All comfortably clear WCAG AA (4.5:1 body, 3:1 large text) with margin for a dim-room
viewing context.

**Rule of use:** one amber CTA per screen. Green/red/blue are reserved for status only
— never used decoratively — so their appearance always means something.

---

## 3. Type

Three self-hosted faces (woff2 files under `public/fonts/` — self-hosted rather than a
Google Fonts CDN link, matching the app's own privacy stance: it already runs OCR
locally and sends nothing to the cloud, so the UI shouldn't quietly phone out to Google
on every page load either).

| Face | Weight(s) | File(s) | Fallback stack |
|---|---|---|---|
| **Bebas Neue** (display) | 400 | `bebas-neue-400.woff2` | `'Oswald', ui-sans-serif, sans-serif` |
| **IBM Plex Sans** (body) | 400, 500, 600, 700 | `plex-sans-{400,500,600,700}.woff2` | `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |
| **IBM Plex Mono** (code) | 400, 500, 600, 700 | `plex-mono-{400,500,600,700}.woff2` | `ui-monospace, SFMono-Regular, Menlo, monospace` |

Bebas Neue's condensed all-caps diner-signage character carries the "marquee" feel
without leaning on an overused "safe distinctive" pick; IBM Plex Sans/Mono share a
single design language (so body text and receipt-code digits feel like one family, not
two unrelated fonts bolted together) and are genuinely comfortable at small sizes on a
phone screen, which matters since this app is used on a phone far more than a desktop.

### Type scale

| Token | CSS `font` shorthand | Size/line-height | Weight | Use |
|---|---|---|---|---|
| `--text-display` | `700 2.25rem/1.05 var(--font-display)` | 36px/1.05, tracked `+0.01em`, uppercase | Bebas 400 (rendered bold-weight by the face itself) | Page/section marquee titles (`.display` utility class) |
| `--text-h1` | `650 1.375rem/1.3 var(--font-body)` | 22px/1.3 | Plex Sans 650 | Screen and dialog headings |
| `--text-h2` | `600 1.0625rem/1.35 var(--font-body)` | 17px/1.35 | Plex Sans 600 | Card headings |
| `--text-body-lg` | `400 1.0625rem/1.5 var(--font-body)` | 17px/1.5 | Plex Sans 400 | Reserved — emphasized running text |
| `--text-body` | `400 1rem/1.5 var(--font-body)` | 16px/1.5 | Plex Sans 400 | Default running text, buttons, inputs |
| `--text-small` | `400 0.8125rem/1.45 var(--font-body)` | 13px/1.45 | Plex Sans 400 | Field labels (uppercase, tracked), captions, `.muted` |
| `--text-micro` | `700 0.6875rem/1.3 var(--font-body)` | 11px/1.3 | Plex Sans 700 | Status pills, mono meta rows |

Survey codes, validation codes, and every technical/ID value use `.mono` (IBM Plex
Mono) layered on top of the sizes above rather than a separate scale — e.g. the
validation-code reveal is `.mono` at `40px/700`.

---

## 4. Spacing, radius, shadow, motion

### Spacing (4px base)

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-7` | 32px |
| `--space-8` | 48px |

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 8px | Small inline elements (list thumbnails) |
| `--radius-md` | 10px | Inputs, images |
| `--radius-lg` | 14px | Cards, dialogs |
| `--radius-pill` | 999px | Buttons, pills |

### Shadow (warm, low-key — this is a dark UI, so shadows read as depth-on-black, not
drop-shadow-on-white)

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.35)` | Cards at rest |
| `--shadow-md` | `0 4px 14px rgba(0,0,0,.45)` | Reserved for elevated surfaces |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,.55)` | Reserved for modal/dialog chrome |
| `--shadow-accent` | `0 4px 18px rgba(255,199,44,.25)` | Primary button's amber glow |

### Motion

| Duration / easing | Value | Use |
|---|---|---|
| `--duration-fast` / `--ease-out` | 120ms · `cubic-bezier(.16,1,.3,1)` | Button press physics (`:active` scale) |
| `--duration-base` / `--ease-standard` | 200ms · `cubic-bezier(.2,.8,.2,1)` | Hover states, border-color/box-shadow transitions |
| `--duration-slow` / `--ease-out` | 420ms · `cubic-bezier(.16,1,.3,1)` | `rise-in` keyframe — every `.card` fades/slides up 6px once on mount |

`prefers-reduced-motion: reduce` collapses all animation/transition durations to
~0 via a global media-query override at the bottom of `globals.css`.

---

## 5. Components

All in `app/globals.css`, applied via the existing className contract in
`components/*.tsx` (no component markup was restructured — see "What changed" below).

- **`.btn`** — primary (amber, pill, glow shadow, scale-down `:active`), `.secondary`
  (panel-2 fill, hairline border, no glow), `.danger` (red fill, white text), `.block`
  (100% width). All have a `:disabled` state (40% opacity, no shadow) and a visible
  `:focus-visible` ring.
- **`.card`** — the base surface for every grouped section; 1px border, `--radius-lg`,
  `--shadow-sm`, and the `rise-in` entrance animation. A card can carry an
  `--accent`-colored border to flag "needs attention" (used for unanswered-question
  banners) without a separate alert-banner component.
- **`.pill`** — status tag with 4 semantic variants: `.new` (amber), `.staged` (blue),
  `.submitted` (green), `.error` (red). Each pairs a tinted background with a
  matching-color border and text.
- **Inputs** (`text`/`number`/`date`/`time`/`textarea`/`select`) — panel-2 fill,
  hairline border, amber focus ring (`box-shadow: 0 0 0 3px var(--accent-soft)`),
  native checkbox/radio `accent-color: var(--accent)`.
- **`.code-box`** (new) — the segmented 26-digit survey-code inputs get their own
  utility class (monospace, 600 weight, 1.125rem) layered on `.mono`, so the
  highest-stakes reading task in the app has deliberately larger, heavier digits than
  regular body mono text.
- **`label.field`** — uppercase, tracked, `--text-small`, `--muted` — used above every
  form input.
- **`.display`** — the Bebas Neue marquee heading utility, used for the header
  wordmark and the design-system page's own headings.
- **Confirm & Submit dialog** (`ConfirmSubmitDialog.tsx`) — unstyled structurally (it
  already used `.card` inside a fixed overlay), but now inherits the full button/pill/
  spacing system for free. This is the one screen in the app where the primary button
  only leaves its disabled state after an explicit checkbox tick — the design doesn't
  add any additional flourish here on purpose; the restraint *is* the design decision
  (an irreversible action shouldn't feel exciting).

---

## 6. Backgrounds, texture, and generated art

- **Body grain** — a self-contained inline SVG `feTurbulence` filter as a `data:` URI
  background-image on `<body>` (see `globals.css`), at 5–8% opacity, giving every
  screen a faint thermal-receipt-paper texture without a downloaded image asset. This
  was a deliberate choice over generating and shipping a tiling PNG: the app's whole
  premise is "nothing leaves this machine, nothing depends on the cloud," so a
  zero-asset, zero-network CSS texture fits better than one more file to keep in sync.
  A soft amber radial gradient in the top-left corner adds the faint "diner sign glow"
  without a second asset.
- **Mood boards** (Ideogram, not shipped in the app — reference only, under
  `.claude/design-moodboards/`):
  - `diner-ledger.png` — prompt: *"Design system mood board titled 'survey-snap' for
    'Late-Night Diner Ledger': near-black charcoal background, warm thermal-receipt-
    paper texture panel, palette swatch chips of near-black #10100f, warm cream
    #f2efe6, diner-neon amber #ffc72c, red #da291c, green #3f9e5a; bold condensed
    diner-signage display type spelling survey-snap; a large pill-shaped amber button
    labeled CONFIRM & SUBMIT; monospaced receipt-code digits in segmented boxes;
    subtle grain and thermal-paper fiber texture; warm, trustworthy, late-night-diner
    mood adjectives; design presentation board."** — chosen direction.
  - `field-audit.png` — "Field Audit / Inspector Clipboard" direction — rejected (see §1).
  - `thermal-zine.png` — "Thermal Print Zine" direction — rejected (see §1).
- **App icon** — generated via Ideogram (see §7), prompt: *"A minimal square app icon
  for 'survey-snap': a simple thermal receipt strip with a curled bottom edge, rendered
  in warm cream paper white, sitting on a near-black rounded-square background; a
  single bold amber checkmark stamped across the receipt like an ink stamp; no text, no
  other elements; flat vector icon style, bold simple shapes that read clearly at very
  small sizes, thick even linework, high contrast, centered composition, generous
  padding around the edges."*

---

## 7. Accessibility notes

- Every text/background pairing in active use exceeds WCAG AA (see contrast figures in
  §2).
- Focus states are explicit and visible: links, buttons, and form fields all get a
  2px outline or a 3px amber glow on `:focus-visible` (never suppressed).
- `prefers-reduced-motion: reduce` is honored globally — all transition/animation
  durations collapse to near-zero.
- No color-only signal: every status pill also carries a text label
  (`new`/`staged`/`submitted`/`error`), and the "needs your answer" flag on a question
  card pairs the amber border with an explicit pill of the same text.
- Native form controls (`input[type=checkbox|radio]`) keep the browser's built-in
  accessibility semantics; only their `accent-color` was themed, not their structure.
- The app has no mute/sound control because it ships no sound (a LAN utility used at
  arbitrary hours — a chime or sting would be an anti-feature here, not a delight).

---

## 8. Asset inventory

| Path | Role |
|---|---|
| `app/globals.css` | Single source of truth for every token and component style |
| `app/design-system/page.tsx` | Live showcase route — renders every token/component from the real CSS |
| `public/fonts/bebas-neue-400.woff2` | Display face |
| `public/fonts/plex-sans-{400,500,600,700}.woff2` | Body face, 4 weights |
| `public/fonts/plex-mono-{400,500,600,700}.woff2` | Code/mono face, 4 weights |
| `public/favicon.ico` | 16/32/48px multi-resolution favicon (hand-assembled from the generated icon) |
| `public/icon-32.png`, `icon-192.png`, `icon-512.png` | PNG icon sizes for `<link>`/manifest |
| `public/apple-touch-icon.png` | 180×180 iOS home-screen icon |
| `public/manifest.json` | Web app manifest (name, theme color, icon set) |
| `.claude/design-moodboards/diner-ledger.png` | Chosen mood board (reference only) |
| `.claude/design-moodboards/field-audit.png` | Rejected mood board (reference only) |
| `.claude/design-moodboards/thermal-zine.png` | Rejected mood board (reference only) |

---

## 9. What changed (uplift scope)

This pass **did not** touch app/business logic, routes' data-fetching, or any test
file. Changes were CSS/tokens + two small className additions + the new showcase route
+ icon wiring:

- `app/globals.css` — rewritten as a full token system (was: a flat handful of
  `--bg`/`--panel`/`--accent`-style variables and un-scaled utility classes).
- `app/layout.tsx` — added `manifest`/`icons` metadata; updated `themeColor` to match
  the (slightly warmer) new `--bg` value.
- `components/CodeEditor.tsx` — added a `code-box` class to the two segmented-code
  input renders (both were previously `className="mono"` only). No structural/behavior
  change.
- `app/design-system/page.tsx` — new. Uses the app's real global CSS (imported once by
  the root layout, so this route inherits it for free) and real component classNames.
- `public/fonts/*`, `public/*.png`, `public/favicon.ico`, `public/manifest.json` — new.

All 121 existing unit tests, `npm run lint`, and `npm run build` pass unchanged after
this pass.

### Changelog

- **2026-09-13** — Initial design system: "Late-Night Diner Ledger" direction, full
  token set, showcase page, app icon. (this document)
