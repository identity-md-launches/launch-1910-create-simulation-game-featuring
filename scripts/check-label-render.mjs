// Production paint regression. Optional argument: an installed Playwright module.
// Native font metrics plus the reviewer's wider CSS-pixel label measurements.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
const { chromium } = await import(process.argv[2] || 'playwright')
const root = resolve('dist'), output = 'test/scratch/label-render'
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, req.url.split('?')[0].replace(/^\/preview\//, '') || 'index.html')
    if (!path.startsWith(root + '/')) throw new Error('bad path')
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(path)] || 'application/octet-stream')
    res.end(await readFile(path))
  } catch { res.writeHead(404).end() }
})
await mkdir(output, { recursive: true })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}/preview/`
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const [width, height] of [[320, 700], [390, 844], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', r => { if (r.url().startsWith(url) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`) })
    await page.route('https://api.imd.fun/swarm', r => r.abort())
    await page.addInitScript(() => {
      window.__labelProbe = { width: null, labels: [], nativeWidth: 0, frames: [] }
      const p = CanvasRenderingContext2D.prototype
      const measure = p.measureText, fillText = p.fillText, fillRect = p.fillRect
      p.measureText = function(text) {
        const metrics = measure.call(this, text)
        if (this.canvas.classList.contains('map') && /^\d+$/.test(text)) {
          window.__labelProbe.nativeWidth = metrics.width + 6
          if (window.__labelProbe.width !== null) {
            return new Proxy(metrics, { get(target, key) {
              return key === 'width' ? window.__labelProbe.width - 6 : Reflect.get(target, key, target)
            } })
          }
        }
        return metrics
      }
      p.fillRect = function(...args) {
        if (this.canvas.classList.contains('map') && args[0] === 0 && args[1] === 0) window.__labelProbe.labels = []
        return fillRect.apply(this, args)
      }
      p.fillText = function(text, x, y, ...args) {
        if (this.canvas.classList.contains('map') && /^\d+$/.test(text)) {
          const w = this.measureText(text).width + 6
          window.__labelProbe.labels.push({ text, x: x - w / 2, y: y - 2, w, h: 15 })
        }
        return fillText.call(this, text, x, y, ...args)
      }
      const raf = window.requestAnimationFrame
      window.requestAnimationFrame = cb => raf(time => {
        const start = performance.now(); cb(time)
        window.__labelProbe.frames.push(performance.now() - start)
        if (window.__labelProbe.frames.length > 30) window.__labelProbe.frames.shift()
      })
    })
    await page.goto(url)
    await page.waitForFunction(() => window.__imdSwarm)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${output}/${width}-first.png` })
    await page.mouse.move(width / 2, 350)
    await page.mouse.wheel(0, 1800)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.waitForTimeout(100)
    const background = await page.evaluate(() => {
      const s = window.__imdSwarm, c = document.querySelector('canvas.map').getBoundingClientRect()
      for (let y = 50; y < s.vp.h - 40; y += 30) for (let x = 25; x < s.vp.w - 25; x += 30) {
        if (s.sim.agents.every(a => { const p = s.toScreen(a.x, a.y); return Math.hypot(p.x - x, p.y - y) > 30 })) return { x: c.x + x, y: c.y + y }
      }
    })
    assert.ok(background)
    await page.mouse.move(background.x, background.y)
    for (const forcedWidth of [null, 39, 44, 44.269, 45, 46]) {
      await page.evaluate(w => { window.__labelProbe.width = w; window.__labelProbe.frames = [] }, forcedWidth)
      await page.waitForFunction(() => window.__labelProbe.frames.length >= 8)
      const report = await page.evaluate(() => {
        const s = window.__imdSwarm, probe = window.__labelProbe, labels = probe.labels
        const overlap = (a, b) => a.x < b.x + b.w - 1e-7 && a.x + a.w > b.x + 1e-7 && a.y < b.y + b.h - 1e-7 && a.y + a.h > b.y + 1e-7
        const visible = s.sim.agents.flatMap(a => {
          const bob = Math.sin(s.sim.time * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4)
          const { x, y } = s.toScreen(a.x, a.y + bob), z = s.cam.zoom
          if (x < 0 || x > s.vp.w || y < 0 || y > s.vp.h) return []
          const r = (a.state === 'work' ? 14 : 10) * z
          return [{ text: String(a.seat.agentId), body: { x: x - r, y: y - r, w: 2 * r, h: 2 * r },
            antenna: { x: x - 2 * z, y: y - 17 * z, w: 4 * z, h: 9 * z } }]
        })
        const canvas = document.querySelector('canvas.map').getBoundingClientRect()
        const overlays = [...document.querySelectorAll('.hint, .data-note')].map(el => {
          const r = el.getBoundingClientRect(); return { x: r.x - canvas.x, y: r.y - canvas.y, w: r.width, h: r.height }
        })
        const durations = [...probe.frames].sort((a, b) => a - b)
        return {
          width: innerWidth, requestedWidth: probe.width, nativeWidth: probe.nativeWidth,
          zoom: s.cam.zoom, time: s.sim.time, visible: visible.length, painted: labels.length,
          missing: visible.filter(a => !labels.some(l => l.text === a.text)).map(a => a.text),
          duplicates: labels.filter((l, i) => labels.findIndex(b => b.text === l.text) !== i).map(l => l.text),
          overlaps: labels.filter((l, i) => labels.slice(i + 1).some(b => overlap(l, b))).map(l => l.text),
          spriteOverlaps: labels.filter(l => visible.some(a => overlap(l, a.body) || overlap(l, a.antenna))).map(l => l.text),
          overlayOverlaps: labels.filter(l => overlays.some(b => overlap(l, b))).map(l => l.text),
          clipped: labels.filter(l => l.x < 4 - 1e-7 || l.y < 4 - 1e-7 || l.x + l.w > s.vp.w - 4 + 1e-7 || l.y + l.h > s.vp.h - 4 + 1e-7).map(l => l.text),
          medianFrameMs: durations[Math.floor(durations.length / 2)],
        }
      })
      results.push(report)
      await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
      assert.equal(report.zoom, 0.5)
      for (const key of ['missing', 'duplicates', 'overlaps', 'spriteOverlaps', 'overlayOverlaps', 'clipped']) assert.deepEqual(report[key], [], `${width}px, width ${forcedWidth ?? 'native'}: ${key}`)
      assert.equal(report.painted, report.visible)
      if (forcedWidth === 44.269 || forcedWidth === 46) await page.screenshot({ path: `${output}/${width}-${forcedWidth}.png` })
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(JSON.stringify({ cases: results.length, results }, null, 2))
} finally {
  await browser.close()
  await new Promise(r => server.close(r))
}
