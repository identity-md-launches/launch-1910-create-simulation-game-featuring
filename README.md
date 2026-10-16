# IMD Swarm Map

A simulation game. Every enrolled IMD swarm agent roams a large map drawn as a neural network of
glowing wires. Agents charge neurons, send pulses down the wires and stop to talk when they meet.
Click an agent and it freezes, turns to look straight at you and opens a panel with everything the
network publishes about it. Click the map and it goes back to what it was doing.

The agents are real. Their ID numbers, seat tokens, job counts, last activity and owner addresses
come from the public network endpoint `https://api.imd.fun/swarm`. A snapshot taken on
2026-10-16 (1,096 seats) is bundled in `src/data/swarm-snapshot.json` so the static export works
with no backend; on page load the site tries the live endpoint once and, if it answers, refreshes
the stats and adds any agents that joined since the snapshot.

## Install, preview, rebuild

```sh
npm install          # Node 20+ and npm; installs Vite, React and TypeScript
npm run dev          # local dev server with hot reload
npm run build        # typecheck (tsc -b) then write the static export to dist/
npm run preview      # serve the built dist/ locally
npm run typecheck    # tsc -b only
```

`dist/` is committed on purpose: the publisher serves that export as-is and does not rebuild.
After any source change run `npm run build` and commit the new `dist/`.

To refresh the bundled snapshot, fetch `https://api.imd.fun/swarm` and rewrite
`src/data/swarm-snapshot.json` in the same shape (see `fields` inside the file), then rebuild.

To regenerate the share image (`public/og.png`, 1200×630) screenshot the built site at that size
with an agent selected, then rebuild so it is copied into `dist/`.

## How it is built

- Vite 8, React 19, TypeScript 6. `vite.config.ts` sets `base: './'` so every asset URL in
  `dist/index.html` is relative and the export works from an IPFS gateway subpath or an ENS name.
- One page, no router, no backend, no wallet. The only network request is the optional live
  refresh of the public swarm endpoint, which has open CORS.
- The map is a `<canvas>` (`src/game/`): `world.ts` lays out the network from a fixed seed,
  `sim.ts` runs the agent state machine (roam, walk to a node, charge it, chat, attention),
  `render.ts` draws the static wire layer once and the moving parts every frame,
  `GameCanvas.tsx` handles pan, zoom, click and keyboard input.
- The UI around it (`src/App.tsx`, `src/ui/`) is plain React with a native `<dialog>` for help and
  a non-modal panel for agent details. Styles and tokens live in `src/index.css`; see `DESIGN.md`.

## Controls

- Tap or click an agent: it stops and looks at you, and its details open. The camera centres it
  above or beside the measured details panel without changing its position or saved task.
- Tap or click the map, press Escape, or use the close button: the panel closes and the agent resumes.
- Drag to pan, scroll or pinch to zoom. With the map focused, arrow keys pan and `+`/`-` zoom.
  Labels repack when crowded. If they still cannot all fit, the camera zooms in just enough
  to keep visible agents labelled, preserving the map's focal point.
- Find agent: jump to an agent by its ID number, or meet a random one. This is also the keyboard
  path to the main action.
- Pause: stops world movement and task timers; selecting or releasing an agent still updates its
  gaze. Under `prefers-reduced-motion` gaze changes immediately, ambient pulses are hidden and
  agents move at 60% speed.

## Validation

Revision checks run against the production export under `/preview/`, with the public API blocked
to exercise the bundled fallback. The original build record is preserved in `docs/validation.md`.

| Command | Result |
| --- | --- |
| `npm run build` | passes: `tsc -b` then Vite wrote `dist/` (index.html, 1 JS chunk, 1 CSS file, favicon.svg, og.png) |
| `npm run typecheck` | passes with no errors (strict, `noUncheckedIndexedAccess`) |
| `node scripts/check-interactions.mjs <playwright-module>` | 224 checks passed in Chromium; 320, 390, 1440px, DPR 1/2; seven resize cases, four world-edge selections, fifteen pan positions |
| `node --experimental-strip-types scripts/check-labels.mjs` | 180 encounter frames, 540 snapshot layouts at 39–46px label widths, and 100 dense render cases through 300 simulated seconds passed |
| `node scripts/check-label-render.mjs <playwright-module>` | 18 production paint cases passed at 320, 390 and 1440px, DPR 2; native metrics and 39, 44, 44.269, 45, 46px boxes, all at zoom 0.5 |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` | 16/16 checks passed at 320, 390 and 1440 |

The browser check reads actual canvas text draws, including halos, and requires every visible ID
to remain present without collisions, clipping, sprite overlap or overlap with the map's text
overlays. It also verifies direct selection and Find leave the entire face and ID outside the
panel; selection/release turn the gaze while paused; coordinates and task timers stay fixed;
the full Owner address wraps and can be selected; and Find, Escape, Help and Resume still work.
Label placement gives the selected agent first choice, keeps the full numbers, and adds a
connector when a label moves away from its agent. A packing fallback repositions earlier labels
when greedy placement runs out of gaps. Valid packed placements and unchanged paused frames
are reused. No font, ID, sprite, snapshot or dependency was changed. The label regression script
uses Node 22's type stripping and module hooks.

The browser script uses an existing Playwright installation (omit the argument when `playwright`
is locally resolvable). Set `PLAYWRIGHT_BROWSERS_PATH` if that installation uses a custom browser
directory. It manages its preview server and browser in one foreground run, writes evidence only
under ignored `test/scratch/`, and closes both on completion. Exact commands and evidence paths
are in `docs/validation.md`.

Limitations, recorded honestly: emulated mobile viewports are not physical devices; no
screen-reader session or browser-native 200% zoom was run. WebKit launch was attempted but its
browser executable was unavailable; this revision was rendered and inspected using direct
Playwright Chromium screenshots. The wide-font cases override measured label widths; they do
not install the reviewer's font or reproduce its glyph rasterization. Canvas
contrast was not instrument-measured. Live refresh still depends on the public endpoint being
reachable at page load. Full coverage, findings and fixes are in `docs/validation.md`.
