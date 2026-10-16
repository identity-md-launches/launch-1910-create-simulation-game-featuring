// Node 22: node --experimental-strip-types scripts/check-labels.mjs
import assert from 'node:assert/strict'
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
