# Validation record: IMD Swarm Map

Worker-side record. It is not an independent certification.

## 1. Scope and assumptions

- One page, `index.html`, built to `dist/` with Vite (`base: './'`). Flows reviewed: first screen,
  pan/zoom, click an agent (stop, face the player, panel), click the map (resume), Find agent by
  ID, random agent, Pause, Help dialog, Escape.
- "All the IMD swarm AI agents" was read as every seat the public endpoint
  `https://api.imd.fun/swarm` lists (1,096 seats at snapshot time, each with its real `agentId`).
  The snapshot is bundled; a live refresh runs once at load (the endpoint sends
  `access-control-allow-origin: *`). No other data source exists in the brief.
- "All available information" is everything the endpoint publishes per seat: agent ID, token ID,
  attempts, accepted, rejected, failed, pending, queued, last activity, working flag and owner
  address, plus the session's simulated activity.
- Pan and zoom were kept as navigation of a "large map"; the only game mechanic is clicking an
  agent. The Find form and keyboard panning exist as the accessible path to the same action.
- Visual direction inferred from the brief: dark void, glowing cyan/violet wires, agents as the
  brightest things on screen. Dark theme only; no light variant.
- No wallet, no router, no backend.

## 2. Coverage (Better Interface, six domains)

| Domain | Status | Inspected / evidence |
| --- | --- | --- |
| Accessibility | Checked | Tab order read from the export: skip link, Find, Pause, Help, map. Focus ring `solid 2px #fff` seen on the Help button (`test/scratch/shots/focus-ring.png`). Panel heading receives focus on open (`activeElement.id === 'agent-heading'` at 390, 1440, 320 and in WebKit). Escape closes the panel; the native `<dialog>` traps focus for help. All icon-only buttons have `aria-label`; the input has a `<label for>`; the error is `role="alert"` and linked with `aria-describedby`. `prefers-reduced-motion` honoured (CSS transitions off, pulses hidden, agents slowed). Not performed: screen-reader session, native 200% zoom, forced-colors mode, physical touch device. |
| Layout | Checked | No horizontal scroll at 320, 390, 1440 (probe + own check). Header fits at 320 after fixes. Panel is a bottom sheet below 56rem and a side column above; screenshots `test/scratch/shots/chromium-390-panel.png`, `chromium-1440-panel.png`. Logical properties used throughout. Not performed: RTL mirror render, widths 600 to 1400. |
| Writing | Checked (source) | Verb-first buttons (Find, Pause/Resume, Help, Meet a random agent, Back to the map). Sentence case throughout. Error states how to fix ("Enter an agent ID, for example 51364." / "No agent with ID 1 is on the map."). Help copy says what the place is and what to do. No em dashes or emoji (probe: glyphs pass). |
| Typography | Checked | One sans family, mono for IDs only; weights 400/600; five-size scale (probe: 3 sizes at 390, 3 at 1440 including one-offs). Tabular numbers on all values. Input at 16px. Wrapping checked at 320 (hint wraps to two lines, nothing clipped). |
| Colors | Checked | Two-tier tokens in `src/index.css`. Measured in the export: panel text 15.41:1, secondary 8.25:1, link 12.20:1, primary button 11.33:1, header button 13.95:1, data note 9.01:1 (probe: all measured text passes 4.5:1). Not measured: text drawn inside the canvas (ID labels have a dark halo; probe reports canvas text as unmeasured). |
| UI | Checked | Transitions name their properties (`background-color, scale`), 120ms; press scale 0.96; panel uses shadow-as-hairline, no border+shadow (probe: chrome pass). No endless CSS animation (probe: motion pass). Hover gated by `(hover: hover)`. Not performed: motion replay at 10% speed in a DevTools panel. |

## 3. Findings and fixes

| # | Severity | Where | Evidence | Fix | Recheck |
| --- | --- | --- | --- | --- | --- |
| 1 | High | `src/index.css` `.app`/`.stage`/`.map` | First build at 390: canvas rendered 206px tall and the page was blank below (percentage height of the canvas did not resolve inside the grid row; map box `{y:67, h:206}`), and the header was 412px wide at a 390 viewport. | Shell changed to a flex column at `100dvh`; canvas absolutely fills `.stage`; `white-space: nowrap` and `flex: none` on the header. | Map box `{y:56, h:788}` at 390 and `{y:56, h:512}` at 320; scrollWidth equals viewport. |
| 2 | High | `src/App.tsx` header controls | At 320 the Help button was cut off by `overflow: hidden` (taste layout: "Help cut 58px", then 8px after the first fix). | Narrow screens: `Find` instead of `Find agent`, icon-only Pause with `aria-label`, title 14px, 8px button padding, 8px header inset; full labels return at 36rem. | taste layout passes at 320, 390, 1440. |
| 3 | Medium | `index.html` share | `og:image` pointed at a file that did not exist. | Rendered `public/og.png` (1200×630) from the built site with agent 51364 selected; copied by the build. | taste share passes; `dist/og.png` present (197 KB). |
| 4 | Low | `src/ui/AgentPanel.tsx` | Interaction check at 1440 initially could not click a free agent because agents moved between measuring and clicking. | Test-side only: the check re-reads the position right before clicking. No product change. | 80/80. |

No remaining blockers known.

## 4. Verification

Run from the repository root on the final source. Playwright was taken from the machine's global
install (`IMD_PLAYWRIGHT=/usr/local/lib/node_modules/playwright/index.mjs`); no test dependency
was added to the project.

| Command | Outcome |
| --- | --- |
| `npm run build` | exit 0; `tsc -b` then Vite: `dist/index.html` 1.34 kB, CSS 8.2 kB, JS 357.8 kB (116.9 kB gzip), `favicon.svg`, `og.png` |
| `npm run typecheck` (`tsc -b`) | exit 0, no errors |
| `node test/scratch/check.mjs dist` | exit 0, 80/80 checks passed: Chromium 390×844 (mobile emulation), 1440×900, 320×568, WebKit 390×844. Screenshots in `test/scratch/shots/` (`chromium-390-first.png`, `-panel.png`, `-help.png`, `chromium-1440-*`, `chromium-320-first.png`, `webkit-390-*`). |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | exit 0, 16/16 checks passed (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget 11 words at 390, chrome, motion, share). Screenshots `test/scratch/taste/shots/390.png`, `1440.png`. |
| `node test/scratch/a11y.mjs` | tab order and focus ring as listed above; reduced-motion media query honoured; contrast pairs as listed in Colors. |

Interactions exercised by `check.mjs` at every width: page title; no horizontal scroll; hint
visible on the first screen; map on the first screen; 1,096 agents, all IDs unique; agents move
within 1.2 s; click a free agent, state becomes `attention`, position unchanged over 0.7 s, face
value reaches 1.0; panel heading equals `Agent <id>`; 13 fact rows; focus on the heading; click
the background, panel gone, state equals the pre-click state, agent moves again with face back to
0; Find 51364 opens its panel; Escape closes it; Find 1 shows the error; Pause freezes `sim.time`;
Help dialog visible; zero console, page or failed-resource errors.

First screen at 390 (`test/scratch/taste/shots/390.png`): the map with agents and their IDs fills
the screen under a one-line header, with the direction "Tap an agent to meet it" at the top left.

## 5. Completion

Complete for the stated scope. Limitations: emulated viewports are not physical devices; no
screen-reader session; no native 200% zoom; canvas text contrast not instrument-measured; the live
refresh needs `api.imd.fun` reachable at load and otherwise the 2026-10-16 snapshot is shown, which
the page states in its data note.
