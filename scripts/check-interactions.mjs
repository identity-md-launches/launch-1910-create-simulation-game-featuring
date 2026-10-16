// Run against the production export. Optional argument: an installed Playwright module path.
// Screenshots and measurements are disposable and always stay in test/scratch/.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
const { chromium } = await import(process.argv[2] || 'playwright')
const output = 'test/scratch/revision'
const root = resolve('dist')
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
let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks++ }
const same = (a, b, message) => { assert.deepEqual(a, b, message); checks++ }

async function installPaintProbe(page) {
  await page.addInitScript(() => {
    window.__paint = { labels: [], bodiesAfterLabels: 0, frames: [] }
    const p = CanvasRenderingContext2D.prototype
    const fillRect = p.fillRect, fillText = p.fillText, fill = p.fill
    p.fillRect = function(...args) {
      if (this.canvas.classList.contains('map') && args[0] === 0 && args[1] === 0) {
        window.__paint.labels = []
        window.__paint.bodiesAfterLabels = 0
      }
      return fillRect.apply(this, args)
    }
    p.fill = function(...args) {
      if (this.canvas.classList.contains('map') && window.__paint.labels.length) window.__paint.bodiesAfterLabels++
      return fill.apply(this, args)
    }
    p.fillText = function(text, x, y, ...args) {
      if (this.canvas.classList.contains('map') && /^\d+$/.test(text)) {
        const m = this.getTransform(), dpr = window.__imdSwarm.vp.dpr
        const width = this.measureText(text).width * m.a / dpr
        window.__paint.labels.push({
          id: Number(text), x: (x * m.a + m.e) / dpr - width / 2 - 1.5,
          y: (y * m.d + m.f) / dpr - 1.5, w: width + 3, h: 14,
        })
      }
      return fillText.call(this, text, x, y, ...args)
    }
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = callback => raf(time => {
      const start = performance.now()
      callback(time)
      window.__paint.frames.push(performance.now() - start)
      if (window.__paint.frames.length > 120) window.__paint.frames.shift()
    })
  })
}

async function labelMetrics(page) {
  return page.evaluate(() => {
    const s = window.__imdSwarm, paint = window.__paint
    const labels = paint.labels
    const overlaps = []
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j]
      if (Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)) overlaps.push([a.id, b.id])
    }
    const visibleIds = s.sim.agents.filter(a => {
      const bob = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(s.sim.time * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4)
      const p = s.toScreen(a.x, a.y + bob)
      return p.x >= 0 && p.x <= s.vp.w && p.y >= 0 && p.y <= s.vp.h
    }).map(a => a.seat.agentId)
    const bodies = s.sim.agents.map(a => {
      const bob = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(s.sim.time * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4)
      const p = s.toScreen(a.x, a.y + bob), z = s.cam.zoom
      return { x: p.x - 9 * z, y: p.y - 9 * z, w: 18 * z, h: 18 * z }
    })
    const bodyOverlaps = labels.filter(a => bodies.some(b => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)))
    const frames = [...paint.frames].sort((a, b) => a - b)
    const canvas = document.querySelector('canvas.map').getBoundingClientRect()
    const overlays = [...document.querySelectorAll('.hint, .data-note')].map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x - canvas.x, y: r.y - canvas.y, w: r.width, h: r.height }
    })
    const overlayOverlaps = labels.filter(a => overlays.some(b => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)).map(l => l.id)
    return {
      zoom: s.cam.zoom, labels: labels.length, visible: visibleIds.length, overlaps,
      missing: visibleIds.filter(id => !labels.some(l => l.id === id)), bodyOverlaps: bodyOverlaps.map(l => l.id),
      missingPositions: s.sim.agents.filter(a => visibleIds.includes(a.seat.agentId) && !labels.some(l => l.id === a.seat.agentId)).map(a => ({ id: a.seat.agentId, ...s.toScreen(a.x, a.y) })),
      clipped: labels.filter(l => l.x < 0 || l.y < 0 || l.x + l.w > s.vp.w || l.y + l.h > s.vp.h).map(l => l.id),
      bodiesAfterLabels: paint.bodiesAfterLabels, frameMedianMs: frames[Math.floor(frames.length / 2)], frameP95Ms: frames[Math.floor(frames.length * 0.95)],
      overlayOverlaps,
    }
  })
}

async function selectionMetrics(page) {
  return page.evaluate(() => {
    const s = window.__imdSwarm, a = s.sim.agents[s.sim.held]
    const c = document.querySelector('canvas.map').getBoundingClientRect(), p = document.querySelector('.panel').getBoundingClientRect()
    const pt = s.toScreen(a.x, a.y), x = pt.x + c.x, y = pt.y + c.y
    const r = 24 * s.cam.zoom
    const label = window.__paint.labels.find(l => l.id === a.seat.agentId)
    const labelVisible = label && [
      [label.x, label.y], [label.x + label.w, label.y], [label.x, label.y + label.h], [label.x + label.w, label.y + label.h],
    ].every(([lx, ly]) => document.elementFromPoint(c.x + lx, c.y + ly)?.tagName === 'CANVAS')
    return {
      id: a.seat.agentId, face: a.face, x, y, worldX: a.x, worldY: a.y, state: a.state, saved: a.saved,
      time: s.sim.time, visible: document.elementFromPoint(x, y)?.tagName === 'CANVAS',
      wholeFaceVisible: x - r >= c.left && x + r <= c.right && y - r >= c.top && y + r <= c.bottom &&
        (x + r < p.left || x - r > p.right || y + r < p.top || y - r > p.bottom),
      labelVisible: Boolean(labelVisible), panelTop: p.top, panelLeft: p.left,
      focused: document.activeElement.id,
    }
  })
}

async function backgroundClick(page) {
  const point = await page.evaluate(() => {
    const s = window.__imdSwarm, c = document.querySelector('canvas.map').getBoundingClientRect()
    for (let y = c.top + 40; y < c.bottom - 20; y += 35) for (let x = c.left + 30; x < c.right - 20; x += 35) {
      if (document.elementFromPoint(x, y)?.tagName !== 'CANVAS') continue
      if (s.sim.agents.every(a => { const p = s.toScreen(a.x, a.y); return Math.hypot(x - c.x - p.x, y - c.y - p.y) > 28 })) return { x, y }
    }
  })
  assert.ok(point, 'a free background point exists')
  await page.mouse.click(point.x, point.y)
}

async function find(page, id) {
  if (!(await page.locator('#find-row').isVisible())) await page.getByRole('button', { name: /^Find/ }).click()
  await page.getByLabel('Agent ID', { exact: true }).fill(String(id))
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(750)
}

try {
  for (const [width, height, dpr] of [[390, 844, 1], [320, 700, 1], [1440, 900, 1], [390, 844, 2]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: width < 600 })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', e => { if (e.type() === 'error' && !e.text().includes('net::ERR_FAILED')) errors.push(e.text()) })
    page.on('response', r => { if (r.url().startsWith(url) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`) })
    await page.route('https://api.imd.fun/swarm', r => r.abort())
    await installPaintProbe(page)
    await page.goto(url)
    await page.waitForFunction(() => window.__imdSwarm)
    const count = await page.evaluate(() => window.__imdSwarm.sim.agents.length)
    same(count, 1096, 'bundled swarm is complete')
    check((await page.title()).includes('IMD Swarm Map'), 'title present')
    check(await page.getByTestId('hint').isVisible(), 'main instruction on first screen')
    same(await page.evaluate(() => document.documentElement.scrollWidth), width, 'no horizontal overflow')
    await page.waitForTimeout(2000)
    const initial = await labelMetrics(page)
    same(initial.overlaps, [], 'default zoom: no ID collisions')
    same(initial.missing, [], 'default zoom: every visible agent has its full ID')
    same(initial.bodiesAfterLabels, 0, 'labels are drawn after all bodies')
    await page.screenshot({ path: `${output}/${width}-${dpr}-first.png` })
    await page.mouse.move(width / 2, Math.min(350, height / 2))
    await page.mouse.wheel(0, 1800)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.waitForTimeout(120)
    const zoomed = await labelMetrics(page)
    await page.screenshot({ path: `${output}/${width}-${dpr}-labels.png` })
    await writeFile(`${output}/${width}-${dpr}-labels.json`, JSON.stringify(zoomed, null, 2))
    same(zoomed.zoom, 0.5, 'supported minimum zoom reached')
    same(zoomed.overlaps, [], 'minimum zoom: no ID collisions, including halos')
    same(zoomed.missing, [], 'minimum zoom: every visible agent has its full ID')
    same(zoomed.clipped, [], 'minimum zoom: all ID text fits on canvas')
    same(zoomed.bodyOverlaps, [], 'minimum zoom: IDs do not cover agent bodies')
    same(zoomed.overlayOverlaps, [], 'minimum zoom: IDs stay clear of the map hint and data note')

    const before = await page.evaluate(() => {
      const s = window.__imdSwarm.sim, a = s.agents[s.byAgentId.get(51364)]
      return { x: a.x, y: a.y, state: a.state, tx: a.tx, ty: a.ty, node: a.node, timer: a.timer, partner: a.partner, time: s.time }
    })
    await find(page, 51364)
    const selected = await selectionMetrics(page)
    check(selected.visible && selected.wholeFaceVisible && selected.labelVisible, 'Find leaves the whole face and full ID outside the panel')
    check(selected.face > 0.99, 'selecting while paused still turns the face')
    same(selected.time, before.time, 'gaze does not advance simulation time')
    same([selected.worldX, selected.worldY], [before.x, before.y], 'camera does not move the agent in the world')
    const { x, y, time, ...saved } = before
    same(selected.saved, saved, 'selection preserves the exact interrupted task')
    same(selected.focused, 'agent-heading', 'selection focuses panel heading')
    same(await page.locator('.fact').count(), 13, 'all fact rows remain available')
    await page.screenshot({ path: `${output}/${width}-${dpr}-find.png` })

    const ownerLink = page.locator('.fact').filter({ has: page.locator('dt', { hasText: /^Owner$/ }) }).locator('a')
    await ownerLink.scrollIntoViewIfNeeded()
    const owner = await ownerLink.evaluate(el => {
      const s = window.__imdSwarm.sim, owner = s.agents[s.held].seat.owner
      const row = el.closest('.fact').getBoundingClientRect(), panel = el.closest('.panel')
      const range = document.createRange(); range.selectNodeContents(el)
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      return { text: el.textContent, owner, href: el.href, copy: window.getSelection().toString(), wraps: el.getClientRects().length > 1,
        fits: [...el.getClientRects()].every(r => r.left >= row.left && r.right <= row.right + 0.5), overflow: panel.scrollWidth > panel.clientWidth }
    })
    same(owner.text, owner.owner, 'Owner shows every address character')
    same(owner.copy, owner.owner, 'full address can be selected for copying')
    same(owner.href, `https://etherscan.io/address/${owner.owner}`, 'owner destination unchanged')
    check(owner.fits && !owner.overflow, 'address wraps without horizontal overflow')
    await page.screenshot({ path: `${output}/${width}-${dpr}-owner.png` })
    await backgroundClick(page)
    await page.waitForTimeout(850)
    check(!(await page.getByTestId('agent-panel').count()), 'background click closes panel')
    const released = await page.evaluate(() => {
      const s = window.__imdSwarm.sim, a = s.agents[s.byAgentId.get(51364)]
      return { x: a.x, y: a.y, face: a.face, time: s.time, state: a.state, tx: a.tx, ty: a.ty, node: a.node, timer: a.timer, partner: a.partner }
    })
    check(released.face < 0.01, 'background click breaks gaze while paused')
    const { face, ...releasedTask } = released
    same(releasedTask, before, 'release restores the task with world movement and timers still paused')

    // Select a real agent in the part of the map the sheet/column will cover.
    const click = await page.evaluate(() => {
      const s = window.__imdSwarm, c = document.querySelector('canvas.map').getBoundingClientRect()
      const matches = s.sim.agents.filter(a => {
        const p = s.toScreen(a.x, a.y)
        return p.x > 25 && p.x < c.width - 25 && p.y > 30 && p.y < c.height - 35 &&
          (innerWidth >= 896 ? p.x > c.width - 340 : p.y > c.height * 0.6)
      })
      const a = matches.find(a => s.sim.agents.every(b => a === b || Math.hypot(a.x - b.x, a.y - b.y) * s.cam.zoom > 32)) || matches[0]
      if (!a) return null
      const p = s.toScreen(a.x, a.y)
      return { id: a.seat.agentId, x: c.x + p.x, y: c.y + p.y, worldX: a.x, worldY: a.y }
    })
    check(Boolean(click), 'an agent exists in the would-be panel region')
    await page.mouse.click(click.x, click.y)
    await page.waitForTimeout(750)
    const direct = await selectionMetrics(page)
    same(direct.id, click.id, 'direct selection identifies clicked agent')
    check(direct.visible && direct.wholeFaceVisible && direct.labelVisible, 'direct selection reveals face and ID outside panel')
    same([direct.worldX, direct.worldY], [click.worldX, click.worldY], 'direct selection changes only camera')
    await page.screenshot({ path: `${output}/${width}-${dpr}-direct.png` })
    await page.getByRole('button', { name: /^Find/ }).first().click()
    await page.waitForTimeout(150)
    check((await selectionMetrics(page)).wholeFaceVisible, 'closing Find row keeps selected face visible')
    await page.keyboard.press('Escape')
    check(!(await page.getByTestId('agent-panel').count()), 'Escape closes details')
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await page.waitForTimeout(500)
    check(await page.evaluate(t => window.__imdSwarm.sim.time > t, before.time), 'Resume advances world again')
    await find(page, 1)
    check(await page.getByRole('alert').isVisible(), 'unknown ID remains recoverable')
    await page.getByRole('button', { name: 'Help', exact: true }).click()
    check(await page.locator('dialog').isVisible(), 'Help opens')
    await page.keyboard.press('Escape')
    check(!(await page.locator('dialog').isVisible()), 'Help closes with Escape')
    same(errors, [], 'no script, console or local resource errors')
    results.push({ width, height, dpr, initial, zoomed, selected, direct, owner })
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await page.route('https://api.imd.fun/swarm', r => r.abort())
  await installPaintProbe(page)
  await page.goto(url)
  await page.waitForFunction(() => window.__imdSwarm)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const frozen = await page.evaluate(() => {
    const s = window.__imdSwarm.sim
    return JSON.stringify({ time: s.time, world: s.world, agents: s.agents.map(a => [a.x, a.y, a.heading, a.timer, a.cooldown]) })
  })
  await find(page, 51364)
  same((await selectionMetrics(page)).face, 1, 'reduced-motion selection sets gaze without animation')
  const resizeResults = []
  for (const [width, height] of [[320, 568], [844, 390], [768, 800], [895, 700], [896, 700], [1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(120)
    const selected = await selectionMetrics(page)
    check(selected.wholeFaceVisible && selected.labelVisible, `selection survives resize to ${width}×${height}`)
    same(await page.evaluate(() => document.documentElement.scrollWidth), width, `no overflow at ${width}×${height}`)
    resizeResults.push({ width, height, selected })
  }
  // Change the sheet's measured bounds without changing the breakpoint.
  await page.locator('.panel').evaluate(el => { el.style.maxHeight = '35%' })
  await page.waitForTimeout(120)
  const resizedSheet = await selectionMetrics(page)
  const canvasBox = await page.locator('canvas.map').boundingBox()
  check(Math.abs(resizedSheet.y - (canvasBox.y + resizedSheet.panelTop - 8) / 2) < 1, 'camera uses actual panel bounds, not an assumed 60% sheet')
  await page.locator('.panel').evaluate(el => { el.style.maxHeight = '' })
  const edgeIds = await page.evaluate(() => {
    const a = window.__imdSwarm.sim.agents
    return ['x', 'y'].flatMap(key => [a.reduce((p, q) => p[key] < q[key] ? p : q).seat.agentId, a.reduce((p, q) => p[key] > q[key] ? p : q).seat.agentId])
  })
  const edgeResults = []
  for (const id of edgeIds) {
    await find(page, id)
    const selected = await selectionMetrics(page)
    check(selected.wholeFaceVisible && selected.labelVisible, `world-edge agent ${id} remains visible`)
    check(Math.abs(selected.x - 195) < 1, 'Find centres world-edge agents in the open map')
    edgeResults.push(selected)
  }
  await page.getByRole('button', { name: 'Meet a random agent', exact: true }).click()
  await page.waitForTimeout(120)
  const random = await selectionMetrics(page)
  check(random.wholeFaceVisible && random.labelVisible && random.face === 1, 'random selection follows the same visible-area and reduced-motion path')
  const oldId = random.id
  await backgroundClick(page)
  await page.waitForTimeout(120)
  same(await page.evaluate(id => { const s = window.__imdSwarm.sim; return s.agents[s.byAgentId.get(id)].face }, oldId), 0, 'reduced-motion release breaks gaze immediately')
  same(await page.evaluate(() => {
    const s = window.__imdSwarm.sim
    return JSON.stringify({ time: s.time, world: s.world, agents: s.agents.map(a => [a.x, a.y, a.heading, a.timer, a.cooldown]) })
  }), frozen, 'all agent coordinates, headings, timers, cooldowns and the whole network remain paused')
  await page.getByRole('button', { name: /^Find/ }).first().click()
  const pans = []
  for (const [width, height] of [[390, 844], [320, 700], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.locator('canvas.map').focus()
    for (let i = 0; i < 6; i++) await page.keyboard.press('-')
    for (const [direction, name] of [['ArrowLeft', 'left'], ['ArrowUp', 'top-left'], ['ArrowRight', 'top-right'], ['ArrowDown', 'bottom-right'], ['ArrowLeft', 'bottom-left']]) {
      for (let i = 0; i < 35; i++) await page.keyboard.press(direction)
      await page.waitForTimeout(120)
      const metrics = await labelMetrics(page)
      same(metrics.missing, [], `${width} ${name}: every visible full ID is retained`)
      same(metrics.overlaps, [], `${width} ${name}: IDs do not overlap`)
      same(metrics.overlayOverlaps, [], `${width} ${name}: IDs avoid overlay text`)
      pans.push({ width, name, ...metrics })
    }
  }
  await page.screenshot({ path: `${output}/1440-pan.png` })
  await page.close()
  const report = { checks, results, resizeResults, edgeResults, pans }
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checks, viewports: results.map(r => ({ width: r.width, dpr: r.dpr, defaultLabels: r.initial.labels, zoomedLabels: r.zoomed.labels, selection: [r.selected.x, r.selected.y] })), resizes: resizeResults.length, edgeSelections: edgeResults.length, panPositions: pans.length }, null, 2))
} finally {
  await browser.close()
  await new Promise(r => server.close(r))
}
