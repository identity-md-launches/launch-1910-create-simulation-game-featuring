# Validation record: IMD Swarm Map

Worker-side record. It is not an independent certification.

## Revision: 2026-10-16

Scope: reproduce and address the four reopened findings while preserving the accepted game,
data source, visual system, controls and dependency lockfile. All four findings reproduced in
Chromium against the original committed export before source changes. The following record
supersedes the original build record below for the revised behavior and current browser coverage.

### Findings, corrections and rechecks

| Finding | Reproduction before editing | Correction and observed result |
| --- | --- | --- |
| High, panel covers selected agent (`2d44b176…`) | Find 51364 at 390×844 put the face at (195,498); the sheet started at y=428.8125 and `elementFromPoint` returned a paragraph. At 320×700 the face was (160,426), below the sheet's y=371.203125 edge. | `src/game/GameCanvas.tsx:203` reads the actual panel bounds through its element ref. `src/game/render.ts:347` finds the remaining map rectangle with an 8px gutter. Every selection, Find result or layout change centres the camera there; the agent's world position/task remain untouched. Find now puts the face at (195,286.40625) at 390, (160,257.6015625) at 320, and (528,502) at 1440. Direct selection from the region subsequently covered by the panel also passes. Whole face and full ID were checked using measured bounds and hit testing. |
| High, overlapping agent IDs (`ced95c97…`) | At zoom 0.5 the original export had 26 overlapping pairs at 390px, 17 at 320px and 131 at 1440px (overlap greater than 4px on both axes). | `src/game/render.ts:175` separates connectors, bodies and labels into ordered passes. `src/game/labels.ts:95` places full measured IDs in CSS pixels, reserves sprite/antenna and UI-overlay bounds, and gives selection priority. Displaced labels have connectors. Final captured minimum-zoom counts: 161/161 visible IDs at 390, 113/113 at 320, 629/629 at 1440, and 160/160 at 390 DPR 2, with no collisions, omissions, clipping or overlaps with bodies/overlay text. Fifteen further pan positions and 180 crowded encounter frames passed. |
| Medium, Pause freezes gaze (`09947a9c…`) | Face stayed 0 after selecting while paused. After a running selection and Pause, release left face approximately 0.99998. | `src/game/sim.ts:175` adds `stepGaze`, called outside the world-pause branch at `src/game/GameCanvas.tsx:223`. While paused, selection reaches face >0.99 in 750ms and background release reaches <0.01 in 850ms; reduced motion sets 1/0 immediately. World time, every agent's position/heading/timer/cooldown, network state and the saved task were compared and stayed frozen. |
| Medium, abbreviated Owner (`fd1717f0…`) | The Owner link displayed 11 characters; only its hover title held all 42. | `src/ui/AgentPanel.tsx:98` renders `seat.owner` in full using the same destination and existing `overflow-wrap: anywhere`. Browser checks confirm all characters, full text selection for copying, wrapping and no horizontal overflow at 320/390/1440 and DPR 2. |

The complete finding IDs and dispositions are in `.imd-responses.json` for the review handoff.
No changes were made to the public snapshot, dependency versions, styles, fonts or shared images.

### Better Interface coverage in this revision

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked for changed flows | Find remains the keyboard route to selection; heading receives focus; Escape and background release work; all facts remain present; full addresses are selectable; reduced-motion gaze snaps directly. Browser checks use DOM and canvas instrumentation. No screen-reader or physical-device session. |
| Layout | Checked | First screen at 390 retains the map and action. Direct/Find selection, full face/ID bounds, panel scroll, seven resize cases (320×568, 844×390, 768×800, 895×700, 896×700, 1440×900, 390×844), four world-edge agents and a changed sheet height passed. No horizontal overflow. Native 200% zoom and RTL rendering were not checked. |
| Writing | Checked, source | Existing action labels, source/fallback notice and errors retained. Activity text is now consistent with the actual paused gaze. Unknown ID still produces a recoverable error; no new product copy or claims. |
| Typography | Checked | Existing five UI sizes and 11px canvas IDs retained. Measured ID bounds include the dark halo; all bodies render before IDs. Owner row grows naturally instead of abbreviating. Screenshots confirm readable separated IDs and a wrapped, selectable address. |
| Colors | Checked within scope | Palette and status cues unchanged. Final taste probe's measurable DOM text passes contrast thresholds. Canvas text and text over translucent canvas overlays are not instrument-measured; no claim of complete contrast certification. |
| UI | Checked | Selected body has priority among sprites; labels have priority-aware placement and connectors. Camera repositions only on selection/layout changes, so ordinary panning remains available. Pause freezes the world while direct selection feedback remains responsive. Help, Escape, Resume and the Find error path still pass. |

### Commands and results

```sh
npm ci --cache test/scratch/npm-cache --ignore-scripts
npm run typecheck
npm run build
PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node scripts/check-interactions.mjs /opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs
node --experimental-strip-types scripts/check-labels.mjs
IMD_PLAYWRIGHT=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline
git diff --check
```

- Build and typecheck: exit 0. Export: `dist/index.html` 1.33kB, JS 361.77kB (118.50kB gzip), CSS
  8.28kB, the existing favicon and OG image. Vite uses `base: './'`; local assets were exercised
  under `/preview/`. Dependencies were installed from the unchanged lockfile; no test or runtime
  dependency was added. The supplied dependency directory initially could not execute `tsc`;
  reinstalling from the lockfile resolved it.
- Interaction script: **224 assertions passed** in Chromium. The API was deliberately blocked
  so all checks used the bundled 1,096-agent snapshot. Viewports: 390×844, 320×700, 1440×900,
  and 390×844 at DPR 2, plus the resize cases above. Zero script/console/local-resource errors
  in the main viewport cases; the expected blocked API request is excluded from error counts.
- Label script: **180 crowded encounter frames passed**, with twelve agents converging on a
  node, the selected agent last in input, three widths and three zoom levels. Requires all full
  IDs, no text/body/antenna overlap, viewport containment and selected-first placement.
- taste@1: **16/16 checks passed** on the final export at 320, 390 and 1440. One intermediate
  probe overlapped a rebuild and recorded a transient root-document 404; it was discarded and
  rerun with a stable export. The probe measures DOM text; canvas readability is covered by the
  dedicated paint instrumentation and screenshots, not inferred from the probe.
- `git diff --check`: exit 0. `.gitignore` was preserved; dependency/cache files remain excluded
  at every nesting level. No packaging archives or submodules were added.
- Submission file budget: approximately **1.04 MB** across 33 source/export/documentation files,
  below 8 MiB; `dist/` is **569,224 bytes**. Every referenced local asset exists and uses a
  relative URL. The four-response handoff JSON is present separately for the worker to consume.

Evidence (temporary, regenerated by the delivered browser script):
`test/scratch/revision/results.json`, `390-1-first.png`, `390-1-find.png`, `320-1-find.png`,
`1440-1-direct.png`, `390-1-labels.png`, `1440-1-labels.png`, `390-1-owner.png`,
`320-1-owner.png`, and `1440-1-owner.png`, all under `test/scratch/revision/`.
Before-edit reproduction: `test/scratch/before/results.json` and the matching screenshots.
Probe evidence: `test/scratch/taste/taste.json` and `test/scratch/taste/shots/`.
Screenshots are validation scratch files, not production assets.

### Completion and limitations

Complete for the four-finding revision. The final source/export, persistent regression scripts,
README, design record and four JSON responses are provided. Chromium screenshots were viewed at
mobile and desktop widths. WebKit launch failed because its executable was unavailable; the
managed browser tool returned `Transport closed`, so direct Playwright Chromium supplied the
rendered checks. WebKit was **not** rerun for this revision. No screen-reader session, physical
touch-device test, native 200% zoom or exhaustive long-running/future-roster test was performed.
Live endpoint availability was not revalidated; the fallback remains explicitly labelled in the
site. Hosting is performed by the network after review.

---

## Original accepted build record (previous round)

The remaining sections record the original checks and limitations, not additional checks run
in this revision.

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
