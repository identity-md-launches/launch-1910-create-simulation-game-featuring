# IMD Swarm Map: design system

Extracted from the final source (`src/index.css`, `src/game/render.ts`, `src/App.tsx`,
`src/ui/*.tsx`) and confirmed in the built export with Chromium at 320, 390 and 1440 wide,
including DPR 2 on the 390px viewport. The revision also checks resize behavior at 768, 844,
895 and 896px. WebKit was checked in the original build; its executable was unavailable for
this revision.

## Overview

The product is a single full-viewport game screen for people curious about the IMD swarm. The
visual idea is one thing: a dark void in which a neural network glows, and the agents are the
light. Everything else (header, hint, panel, dialog) is quiet dark chrome that sits over the scene
and never competes with it. Hierarchy comes from brightness and size on the canvas and from weight
(400 vs 600) and two neutral text colours in the UI. Density is compact: 14px controls, 4px spacing
steps, one accent colour reserved for the primary action and links.

System-wide rules: dark only, one accent, two weights, five type sizes, controls float over a
bleeding canvas. One-page arrangement, not a rule: the header holds exactly three controls and the
panel docks right on wide screens and bottom on narrow ones.

## Colors

All tokens are in `:root` in `src/index.css`. Components reference only the semantic tier.

| Role token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#070b16` (`--navy-950`) | page and canvas background |
| `--color-surface` | `#0f1629` (`--navy-900`) | buttons, inputs, agent panel, help dialog |
| `--color-surface-raised` | `#171f38` (`--navy-800`) | button hover and pressed state |
| `--color-border` | `rgba(140,170,255,0.18)` | control borders, fact-row dividers |
| `--color-text` | `#e8edff` | primary text |
| `--color-text-secondary` | `#a3afd3` | labels, notes, activity line |
| `--color-accent` | `#5ee6ff` (`--cyan-400`) | the one filled action per view (`.button-primary`), links, skip link |
| `--color-accent-ink` | `#062030` | text on the accent fill |
| `--color-error` | `#ffb4b4` | the Find form's inline error |
| `--color-focus` | `#ffffff` | 2px focus ring on every `:focus-visible` |
| `--color-status-working` / `-active` / `-resting` | amber `#ffb547`, cyan `#5ee6ff`, violet `#a78bfa` | legend swatches in the help dialog; the same hues colour agent bodies on the canvas |

Canvas colours are the `COLORS` constant in `src/game/render.ts` (same hex values; wires are the
cyan and violet at 0.22 alpha, node fill is `--navy-900`). Status hue is never the only cue: the
panel states the status in words.

Measured in the original export, with the palette unchanged in this revision (panel text on
`rgb(15,22,41)`): primary text 15.41:1, secondary text
8.25:1, link 12.20:1; primary button text on accent 11.33:1; header buttons 13.95:1; the data note
on the page background 9.01:1. Text drawn on the canvas (agent ID labels with a dark halo) was not
measured by the probe.

## Typography

Families: `--font-sans` (`system-ui` stack) for all UI text; `--font-mono` (`ui-monospace` stack)
for the Agent ID input and for the ID labels drawn on the canvas (data, not prose). No font files
are shipped. Weights used: 400 and 600 only.

Scale (five sizes, `src/index.css`):

| Token | Size | Role |
| --- | --- | --- |
| `--text-xs` | 13px | data note, panel note |
| `--text-sm` | 14px | buttons, labels, fact rows, hint, activity line, narrow-screen site title |
| `--text-md` | 16px | body, help dialog copy, Find input (16px avoids iOS zoom), site title at 36rem+ |
| `--text-lg` | 20px | panel and dialog titles (`.panel-title`) |
| `--text-xl` | 24px | site title (`.brand`) at 56rem+ |

Line height 1.5 on the body, 1.2 on titles and buttons. Letter-spacing is natural everywhere. The
panel title and all numbers use `font-variant-numeric: tabular-nums` (`.num`). Descriptions use
`text-wrap: pretty`; long values use `overflow-wrap: anywhere`. Canvas ID labels are drawn at a
constant 11px screen size regardless of zoom (`render.ts`, the screen-space font). Their full ID
strings are measured before placement; each label reserves its measured width plus 6px and 15px
height, with a 1px collision gutter and a 4px inset from the visible map edges (`labels.ts`).
Selected labels are placed first. Nearby positions and retained short offsets resolve collisions
with other labels, bodies, antennas and the map's text overlays. If that search exhausts the gaps,
the packing fallback repositions unselected labels into obstacle-free rows, holding the selected
label's placement. It assigns slots near their agents and retains valid packed positions while
agents move a short distance. Unchanged paused frames reuse their placements. Displaced labels use a 1px
connector in `rgba(232,237,255,0.55)` (primary label colour when selected). Connectors render below
sprites; labels and their 3px dark halos render after all sprites.

## Layout

`.app` is a flex column filling `100dvh` (fallback `100vh`) with `overflow: hidden`: header
(`.topbar`, min 3.25rem), the collapsible Find row, then `.stage` taking the rest. The canvas is
absolutely positioned to fill `.stage`, so the map bleeds edge to edge while controls float over it.

Spacing is a 4px scale, `--space-1` (4px) to `--space-6` (24px). Controls inset from the viewport
by `--space-2` on narrow screens and `--space-4` from 36rem, always at least the safe-area inset.
Alignment edges: the header's leading edge is the site title; its trailing edge is the control
group; the hint and data note share the leading inset; the panel's content aligns to its own
padding.

Breakpoints come from the content, in rem:

- Below 36rem: site title 14px, buttons `Find`, an icon-only Pause and `Help` with 8px inline
  padding, so three controls and the title fit 320px without clipping. The agent panel is a bottom
  sheet (`max-height: min(60%, 32rem)`, scrollable, top corners rounded).
- 36rem and up: full labels (`Find agent`, `Pause`), title 16px, 12px button padding.
- 56rem and up: title 24px; the panel docks as a 22.5rem column on the trailing side with 16px
  margins and full rounding.

Every selection, Find result and panel/viewport size change centres the selected face in the
largest rectangular part of the map left by the actual panel bounds, with an 8px gutter. The
camera moves; the agent's world coordinates and interrupted task do not. Focusing near a world
edge may reveal the surrounding void so the selected face still occupies the open area's centre.

The camera supports 0.5–2.5× zoom. If a dense view cannot fit all full-size IDs even after
repacking, `render.ts` increases zoom in 10% steps around the open map's centre before painting
agents. This preserves the selected focal point and all simulation state. The reported minimum
zoom replay remains at 0.5 at 320/390px for label widths from 39 to 46px; later crowded test frames
needed at most 0.805×. Labels retain their 11px type size throughout.

Observed: no horizontal scroll at 320, 390, 768, 844, 895, 896 or 1440; no DOM text overlap in the
probe; no canvas ID overlap or missing visible IDs in the recorded browser cases. Resizing an
open panel, crossing the 56rem breakpoint, and changing the sheet's height retain the selected
face and label on the visible map. Not checked: native 200% zoom, RTL mirroring (logical properties
are used throughout, but the mirror was not rendered), physical devices.

## Elevation & depth

Flat by default. One elevated treatment, `--shadow-panel` (`0 0 0 1px rgba(140,170,255,0.14), 0
16px 40px rgba(0,0,0,0.45)`), used only by the agent panel and the help dialog: the hairline is a
shadow, not a border, so no surface has both. Buttons and inputs use a 1px `--color-border` and no
shadow. The help dialog's `::backdrop` is `rgba(7,11,22,0.6)`. Overlays on the canvas (hint, data
note) use `rgba(7,11,22,0.78)` behind the text. Stacking: canvas, then overlays, then panel, then
the skip link (z-index 20), then the native dialog top layer.

## Shapes

`--radius-sm` 8px for buttons, inputs, overlay pills and icon buttons; `--radius-lg` 16px for the
panel and dialog (`--radius-md` 12px is defined and currently unused). Agents on the canvas are
circles (radius 9 world units) with an antenna and a dark visor; nodes are stroked circles whose
radius encodes kind (hub 22, neuron 13, relay 8).

## Components

- Button (`.button`, `src/index.css`; used in `src/App.tsx`, `src/ui/HelpDialog.tsx`): surface
  fill, 1px border, min-height 2.5rem, 600 weight, `white-space: nowrap`. Variant
  `.button-primary` (accent fill, used once per view: Find submit, Back to the map).
  `aria-pressed` styles the Pause toggle. Hover only under `(hover: hover)`; press scales to 0.96;
  transitions name `background-color, scale` at 120ms; both are removed under reduced motion.
- Icon button (`.icon-button`): 2.5rem square, transparent, needs an `aria-label`; the close
  controls in the panel and dialog.
- Find row (`.find-row`, `src/App.tsx`): a `<form>` toggled by the Find button
  (`aria-expanded`/`aria-controls`), a visible `<label for>`, a mono text input with
  `inputmode="numeric"`, the primary Find button, a secondary random button, and an inline
  `role="alert"` error linked by `aria-describedby` and `aria-invalid`.
- Agent panel (`.panel`, `src/ui/AgentPanel.tsx`): non-modal `role="dialog"` labelled by its
  heading, which receives focus on open; a `<dl>` of `.fact` rows (label leading, tabular value
  trailing, divider below); an external link to the seat on Etherscan; a data-source note. Closes
  on the close button, Escape, or a click on the map; focus returns to the canvas. The Owner link
  renders all 42 address characters; `overflow-wrap: anywhere` lets the existing fact row grow.
  Its element ref supplies actual panel bounds to the map camera and label layout.
- Help dialog (`.help`, `src/ui/HelpDialog.tsx`): native `<dialog>` via `showModal()`, so focus
  trapping, Escape and backdrop are the browser's. Click on the backdrop closes.
- Overlays (`.hint`, `.data-note`): `pointer-events: none` text pills over the canvas.
- Map (`.map`, `src/game/GameCanvas.tsx`): focusable canvas with `role="img"` and a descriptive
  label; `touch-action: none` and `user-select: none` because it is a drag surface. `stepGaze`
  (`sim.ts`) updates selection-facing separately from world simulation, including while paused;
  reduced motion sets the face directly. The selected body is drawn last among sprites so an
  encounter cannot paint another body over the face.
- Skip link (`.skip-link`): first focusable element, visible only on focus.

## Do's and don'ts

- Start a new surface from `--color-surface` on `--color-bg`; use `--shadow-panel` for elevation,
  never a border plus a shadow.
- One `.button-primary` per view. Everything else is `.button` or a text link in `--color-accent`.
- Pick sizes from the five `--text-*` tokens and the 4px `--space-*` steps; do not add a size.
- Keep status hue as decoration with a text equivalent beside it.
- Name transition properties; keep motion under 150ms for high-frequency controls and remove it
  under `prefers-reduced-motion`.
- Do not put chrome inside the canvas or pointer-blocking elements over it; overlays are
  `pointer-events: none`.

Recipe for another page: reuse `.app` + `.topbar` for the shell, put the content in a `.stage`
or a `.panel`-styled surface, use `.fact` rows for key/value data, `.button`/`.button-primary`
for actions, and add the page's copy at `--text-md` with `--color-text-secondary` for support text.
