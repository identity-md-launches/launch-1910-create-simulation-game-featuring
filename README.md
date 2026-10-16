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

- Tap or click an agent: it stops and looks at you, and its details open.
- Tap or click the map, press Escape, or use the close button: the panel closes and the agent resumes.
- Drag to pan, scroll or pinch to zoom. With the map focused, arrow keys pan and `+`/`-` zoom.
- Find agent: jump to an agent by its ID number, or meet a random one. This is also the keyboard
  path to the main action.
- Pause: stops the simulation. Under `prefers-reduced-motion` the ambient pulses are hidden and
  agents move at 60% speed.

## Validation

Commands run from the repository root on the final source, with their results:

| Command | Result |
| --- | --- |
| `npm run build` | passes: `tsc -b` then Vite wrote `dist/` (index.html, 1 JS chunk, 1 CSS file, favicon.svg, og.png) |
| `npm run typecheck` | passes with no errors (strict, `noUncheckedIndexedAccess`) |
| `node test/scratch/check.mjs dist` (Playwright, Chromium at 390, 1440 and 320 wide, WebKit at 390) | 80/80 checks passed |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 checks passed at 320, 390 and 1440 |
| `node test/scratch/a11y.mjs` (tab order, focus ring, reduced motion, contrast) | see `docs/validation.md` |

The interaction check serves `dist/` under a `/preview/` subpath and verifies: the page title; no
horizontal scroll; the hint and map on the first screen; 1,096 agents with unique IDs; agents move
on their own; clicking a free agent sets its state to attention, holds its position and turns its
face to the player; the panel opens with that agent's real ID and 13 fact rows and takes focus;
clicking the background closes the panel and restores the agent's previous state, after which it
moves again; Find agent by ID; Escape closes; an unknown ID shows a recoverable error; Pause stops
the clock; the help dialog opens; and no console, page or failed-resource errors.

Limitations, recorded honestly: emulated mobile viewports are not physical devices; no
screen-reader session was run (accessible names were read from the DOM only); browser-native 200%
zoom was not tested; and the live refresh depends on the public endpoint being reachable at page
load. Full coverage, findings and fixes are in `docs/validation.md` (also delivered as `artifacts/validation.md`).
