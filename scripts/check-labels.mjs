// Node 22: node --experimental-strip-types scripts/check-labels.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { layoutLabels } from '../src/game/labels.ts'

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
let checks = 0
for (const width of [320, 390, 1440]) {
  for (const zoom of [0.5, 1, 2.5]) {
    const area = { x: 0, y: 0, w: width, h: 300 }
    const offsets = new Map()
    // Twelve agents converge on a node; selected last in input to exercise priority.
    for (let frame = 0; frame < 20; frame++) {
      const anchors = Array.from({ length: 12 }, (_, i) => {
        const x = width / 2 + Math.cos(i * 1.7) * (20 - frame)
        const y = 150 + Math.sin(i * 1.7) * (20 - frame)
        const r = (i === 11 ? 24 : 10) * zoom
        return { id: i, text: String(51000 + i), x, y, labelY: y + r + 3, width: 40,
          body: { x: x - r, y: y - r, w: r * 2, h: r * 2 },
          antenna: { x: x - 2 * zoom, y: y - 17 * zoom, w: 4 * zoom, h: 9 * zoom }, selected: i === 11 }
      })
      const labels = layoutLabels(anchors, area, offsets, [])
      assert.equal(labels.length, anchors.length, 'every encounter participant has a full label')
      assert.equal(labels[0].anchor.id, 11, 'selected ID gets first choice')
      assert.equal(new Set(labels.map(l => l.anchor.text)).size, anchors.length, 'IDs remain unique and unmodified')
      for (let i = 0; i < labels.length; i++) {
        const a = labels[i]
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= width && a.y + a.h <= area.h, 'full label fits')
        assert.ok(!anchors.some(b => overlap(a, b.body) || overlap(a, b.antenna)), 'labels avoid every sprite')
        for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(a, labels[j]), 'encounter IDs stay separate')
      }
      checks++
    }
  }
}
console.log(`${checks} crowded encounter frames passed at 320, 390, 1440px and zoom 0.5, 1, 2.5.`)

// Load the real simulation and bundled roster without a browser or a second
// build tool. These hooks only resolve the app's extensionless TS/JSON imports.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.(ts|json)$/.test(specifier)) specifier += '.ts'
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.json')) context = { ...context, importAttributes: { type: 'json' } }
    return next(url, context)
  },
})
const { loadSnapshot } = await import('../src/data/agents.ts')
const { buildWorld } = await import('../src/game/world.ts')
const { createSim, stepSim } = await import('../src/game/sim.ts')
const snapshot = loadSnapshot()
const sim = createSim(buildWorld(), snapshot.seats, snapshot.at)
assert.equal(sim.agents.length, 1096)
let swarmFrames = 0
let largest = 0

function validate(labels, anchors, area, occluders) {
  assert.equal(labels.length, anchors.length, 'every visible agent keeps its ID, including wide fallback fonts')
  assert.deepEqual(labels.map(l => l.anchor.id).sort((a, b) => a - b), anchors.map(a => a.id).sort((a, b) => a - b))
  if (anchors.some(a => a.selected)) assert.ok(labels[0].anchor.selected, 'selection retains first priority')
  for (const [i, l] of labels.entries()) {
    assert.equal(l.anchor.text, String(sim.agents[l.anchor.id].seat.agentId), 'full real ID, unchanged')
    assert.equal(l.w, l.anchor.width, 'measured width is neither truncated nor shrunk')
    assert.ok(l.x >= area.x + 4 && l.y >= area.y + 4 && l.x + l.w <= area.x + area.w - 4 && l.y + l.h <= area.y + area.h - 4, '4px edge inset')
    assert.ok(!occluders.some(r => overlap(l, r)), 'overlay clearance')
    assert.ok(!anchors.some(a => overlap(l, a.body) || overlap(l, a.antenna)), 'sprite and antenna clearance')
    assert.ok(!labels.slice(i + 1).some(r => overlap(l, r)), 'IDs never overlap')
    if (Math.abs(l.x - (l.anchor.x - l.w / 2)) > 1 || Math.abs(l.y - l.anchor.labelY) > 1) assert.ok(l.moved, 'displaced labels keep connectors')
  }
  largest = Math.max(largest, labels.length)
  swarmFrames++
}

for (const time of [0, 1, 2.8488, 4]) {
  while (sim.time < time - 1e-8) stepSim(sim, Math.min(1 / 60, time - sim.time))
  for (const [width, height] of [[320, 644], [390, 788], [1440, 844]]) {
    for (const labelWidth of [39, 44, 44.269, 45, 46]) {
      for (const [cx, cy] of [[1800, 1450], [1000, 1000], [2000, 2000]]) {
        const area = { x: 0, y: 0, w: width, h: height }
        // Measured production overlays, including the wrapped hint at 320px.
        const occluders = [
          { x: 16, y: width === 1440 ? 16 : 12, w: width === 320 ? 288 : 347.71875, h: width === 320 ? 50 : 29 },
          { x: 16, y: height - 39.5, w: 244.84375, h: 27.5 },
        ]
        const anchors = sim.agents.flatMap(a => {
          const x = (a.x - cx) * 0.5 + width / 2
          const y = (a.y + Math.sin(sim.time * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4) - cy) * 0.5 + height / 2
          if (x < 0 || x > width || y < 0 || y > height) return []
          const r = a.state === 'work' ? 7 : 5
          return [{ id: a.index, text: String(a.seat.agentId), x, y, labelY: y + r + 3, width: labelWidth,
            body: { x: x - r, y: y - r, w: 2 * r, h: 2 * r },
            antenna: { x: x - 1, y: y - 8.5, w: 2, h: 4.5 }, selected: false }]
        })
        const offsets = new Map()
        const first = layoutLabels(anchors, area, offsets, occluders)
        validate(first, anchors, area, occluders)
        const again = layoutLabels(anchors, area, offsets, occluders)
        validate(again, anchors, area, occluders)
        assert.ok(again.every((l, i) => l.anchor.id === first[i].anchor.id &&
          Math.abs(l.x - first[i].x) < 1e-7 && Math.abs(l.y - first[i].y) < 1e-7), 'a paused frame does not shuffle packed labels')
        // Selection invalidates cached priorities and reserves the larger halo.
        const last = anchors.at(-1)
        if (last) {
          const selected = { ...last, selected: true, labelY: last.y + 15,
            body: { x: last.x - 12, y: last.y - 12, w: 24, h: 24 } }
          const changed = [...anchors.slice(0, -1), selected]
          validate(layoutLabels(changed, area, offsets, occluders), changed, area, occluders)
        }
      }
    }
  }
}
console.log(`${swarmFrames} snapshot layouts passed: 39, 44, 44.269, 45, 46px widths; zoom 0.5; up to ${largest} IDs; selected/paused layouts, sprite/overlay clearance and connectors.`)

// Later frames can exceed a phone's label capacity. Exercise the renderer's
// capacity guard as well as packing: it must leave every final visible body
// labelled, keep the selected focal point, and never mutate the simulation.
const { render } = await import('../src/game/render.ts')
let densityCases = 0, maximumZoom = 0.5
for (const time of [10, 30, 60, 120, 300]) {
  while (sim.time < time - 1e-8) stepSim(sim, Math.min(1 / 60, time - sim.time))
  for (const [width, height] of [[320, 644], [390, 788]]) for (const labelWidth of [39, 44, 44.269, 45, 46]) {
    for (const panelOpen of [false, true]) {
      const cam = { x: 1800, y: 1450, zoom: 0.5 }
      const area = { x: 0, y: 0, w: width, h: panelOpen ? height * 0.4 : height }
      const occluders = [
        { x: 16, y: 12, w: width === 320 ? 288 : 347.71875, h: width === 320 ? 50 : 29 },
        { x: 16, y: height - 39.5, w: 244.84375, h: 27.5 },
      ]
      let painted = []
      // No raster assertions here: browser paint checks cover those separately.
      const context = new Proxy({
        measureText: () => ({ width: labelWidth - 6 }),
        fillRect: () => { painted = [] },
        fillText: (text, x, y) => painted.push({ text, x: x - labelWidth / 2, y: y - 2, w: labelWidth, h: 15 }),
      }, { get: (target, key) => target[key] ?? (() => {}) })
      const focusBefore = { x: cam.x, y: cam.y + (area.h / 2 - height / 2) / cam.zoom }
      const stateBefore = JSON.stringify(sim.agents)
      render(context, {}, sim, cam, { w: width, h: height, dpr: 2 }, { hovered: -1, reducedMotion: false, area, occluders, labelOffsets: new Map() })
      assert.equal(JSON.stringify(sim.agents), stateBefore, 'capacity guard does not change agent state')
      const focusAfter = { x: cam.x, y: cam.y + (area.h / 2 - height / 2) / cam.zoom }
      assert.ok(Math.abs(focusAfter.x - focusBefore.x) < 1e-7 && Math.abs(focusAfter.y - focusBefore.y) < 1e-7, 'camera keeps the open map focal point')
      const visible = sim.agents.filter(a => {
        const x = (a.x - cam.x) * cam.zoom + width / 2
        const y = (a.y + Math.sin(sim.time * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4) - cam.y) * cam.zoom + height / 2
        return x >= 0 && x <= area.w && y >= 0 && y <= area.h
      }).map(a => String(a.seat.agentId)).sort()
      assert.deepEqual(painted.map(l => l.text).sort(), visible, 'later dense frames still paint every visible full ID')
      for (const [i, l] of painted.entries()) {
        assert.ok(!painted.slice(i + 1).some(r => overlap(l, r)), 'dense frame: IDs remain separate')
        assert.ok(!occluders.some(r => overlap(l, r)), 'dense frame: overlays remain clear')
      }
      assert.ok(cam.zoom <= 2.5, 'camera stays within its supported range')
      maximumZoom = Math.max(maximumZoom, cam.zoom)
      densityCases++
    }
  }
}
console.log(`${densityCases} later dense render cases passed through 300 simulated seconds, with/without the panel. Maximum required zoom: ${maximumZoom.toFixed(3)}.`)
