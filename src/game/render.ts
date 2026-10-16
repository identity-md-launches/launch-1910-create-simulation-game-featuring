import type { Agent, Sim } from './sim'
import { WORLD_H, WORLD_W, wirePoint, type World } from './world'

export interface Camera {
  /** World coordinates at the viewport centre. */
  x: number
  y: number
  zoom: number
}

export const COLORS = {
  bg: '#070b16',
  wire: 'rgba(94, 230, 255, 0.22)',
  wireViolet: 'rgba(167, 139, 250, 0.22)',
  cyan: '#5ee6ff',
  violet: '#a78bfa',
  amber: '#ffb547',
  ink: '#070b16',
  label: '#e8edff',
  labelHalo: 'rgba(7, 11, 22, 0.9)',
} as const

/** Static layer: the glowing wires and resting nodes, drawn once in world space. */
export function paintStaticLayer(world: World): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = WORLD_W
  c.height = WORLD_H
  const g = c.getContext('2d')!

  g.fillStyle = COLORS.bg
  g.fillRect(0, 0, WORLD_W, WORLD_H)

  // Faint grid dots give the void some texture without competing with the wires.
  g.fillStyle = 'rgba(140, 170, 255, 0.07)'
  for (let y = 40; y < WORLD_H; y += 80) {
    for (let x = 40; x < WORLD_W; x += 80) {
      g.fillRect(x, y, 2, 2)
    }
  }

  g.lineCap = 'round'
  for (const w of world.wires) {
    const a = world.nodes[w.a]!
    const b = world.nodes[w.b]!
    const violet = (w.id * 7) % 5 === 0
    // Soft halo
    g.strokeStyle = violet ? 'rgba(167, 139, 250, 0.10)' : 'rgba(94, 230, 255, 0.10)'
    g.lineWidth = 9
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.quadraticCurveTo(w.cx, w.cy, b.x, b.y)
    g.stroke()
    // Core line
    g.strokeStyle = violet ? COLORS.wireViolet : COLORS.wire
    g.lineWidth = 2
    g.stroke()
  }

  for (const n of world.nodes) {
    const grad = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3)
    grad.addColorStop(0, n.kind === 'relay' ? 'rgba(167,139,250,0.28)' : 'rgba(94,230,255,0.28)')
    grad.addColorStop(1, 'rgba(94,230,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(n.x, n.y, n.radius * 3, 0, Math.PI * 2)
    g.fill()

    g.fillStyle = '#0f1629'
    g.strokeStyle = n.kind === 'relay' ? COLORS.violet : COLORS.cyan
    g.lineWidth = 2
    g.beginPath()
    g.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
  return c
}

interface Viewport {
  w: number
  h: number
  dpr: number
}

export interface RenderOptions {
  hovered: number
  reducedMotion: boolean
}

export function render(
  g: CanvasRenderingContext2D,
  staticLayer: HTMLCanvasElement,
  sim: Sim,
  cam: Camera,
  vp: Viewport,
  opts: RenderOptions,
): void {
  const { world, agents } = sim
  g.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0)
  g.fillStyle = COLORS.bg
  g.fillRect(0, 0, vp.w, vp.h)

  // World transform: screen = (world - cam) * zoom + centre
  const ox = vp.w / 2 - cam.x * cam.zoom
  const oy = vp.h / 2 - cam.y * cam.zoom
  g.setTransform(vp.dpr * cam.zoom, 0, 0, vp.dpr * cam.zoom, ox * vp.dpr, oy * vp.dpr)

  // Visible world rectangle for culling.
  const left = cam.x - vp.w / 2 / cam.zoom
  const top = cam.y - vp.h / 2 / cam.zoom
  const right = cam.x + vp.w / 2 / cam.zoom
  const bottom = cam.y + vp.h / 2 / cam.zoom

  g.drawImage(staticLayer, 0, 0)

  // Node charge glow, only for nodes with energy.
  for (const n of world.nodes) {
    if (n.charge < 0.02) continue
    if (n.x < left - 80 || n.x > right + 80 || n.y < top - 80 || n.y > bottom + 80) continue
    const r = n.radius + 6 + n.charge * 18
    g.globalAlpha = 0.25 + n.charge * 0.55
    g.strokeStyle = n.kind === 'relay' ? COLORS.violet : COLORS.cyan
    g.lineWidth = 2 + n.charge * 2
    g.beginPath()
    g.arc(n.x, n.y, r, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
    g.fillStyle = n.kind === 'relay' ? COLORS.violet : COLORS.cyan
    g.globalAlpha = n.charge * 0.9
    g.beginPath()
    g.arc(n.x, n.y, n.radius * 0.55, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }

  // Pulses travelling along wires.
  if (!opts.reducedMotion) {
    for (const p of world.pulses) {
      const w = world.wires[p.wire]
      if (!w) continue
      const pt = wirePoint(world, w, Math.max(0, Math.min(1, p.t)))
      if (pt.x < left - 20 || pt.x > right + 20 || pt.y < top - 20 || pt.y > bottom + 20) continue
      g.fillStyle = p.hue === 'cyan' ? COLORS.cyan : COLORS.violet
      g.globalAlpha = 0.35
      g.beginPath()
      g.arc(pt.x, pt.y, 7, 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = 1
      g.beginPath()
      g.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      g.fill()
    }
  }

  // Chat links between talking agents.
  g.lineWidth = 1.5
  for (const a of agents) {
    if (a.state !== 'chat' || a.partner < a.index) continue
    const b = agents[a.partner]
    if (!b) continue
    if (a.x < left - 40 || a.x > right + 40 || a.y < top - 40 || a.y > bottom + 40) continue
    g.strokeStyle = 'rgba(232, 237, 255, 0.55)'
    g.setLineDash([3, 4])
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
    g.setLineDash([])
  }

  // Agents, culled to the viewport. Labels are drawn at constant screen size.
  const labelPx = 11 / cam.zoom
  g.font = `600 ${labelPx}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
  g.textAlign = 'center'
  g.textBaseline = 'top'
  const margin = 40
  const t = sim.time
  for (const a of agents) {
    if (a.x < left - margin || a.x > right + margin || a.y < top - margin || a.y > bottom + margin) continue
    drawAgent(g, a, t, a.index === sim.held, a.index === opts.hovered, labelPx, opts.reducedMotion)
  }

  g.setTransform(1, 0, 0, 1, 0, 0)
}

function bodyColor(a: Agent): string {
  switch (a.cls) {
    case 'working':
      return COLORS.amber
    case 'active':
      return COLORS.cyan
    default:
      return COLORS.violet
  }
}

function drawAgent(
  g: CanvasRenderingContext2D,
  a: Agent,
  t: number,
  held: boolean,
  hovered: boolean,
  labelPx: number,
  reduced: boolean,
): void {
  const r = 9
  const bob = reduced ? 0 : Math.sin(t * 3 + a.phase) * (a.state === 'work' ? 1.2 : 0.4)
  const x = a.x
  const y = a.y + bob
  const color = bodyColor(a)

  if (held) {
    // Spotlight: the agent has the player's attention.
    g.globalAlpha = 0.25
    g.fillStyle = COLORS.label
    g.beginPath()
    g.arc(x, y, r + 14, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
    g.strokeStyle = COLORS.label
    g.lineWidth = 2
    g.beginPath()
    g.arc(x, y, r + 7, 0, Math.PI * 2)
    g.stroke()
  } else if (hovered) {
    g.strokeStyle = 'rgba(232, 237, 255, 0.8)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(x, y, r + 5, 0, Math.PI * 2)
    g.stroke()
  }

  if (a.state === 'work') {
    // Working ring: a rotating arc shows the agent is busy at the node.
    g.strokeStyle = color
    g.lineWidth = 2
    g.globalAlpha = 0.9
    g.beginPath()
    const start = reduced ? 0 : t * 4 + a.phase
    g.arc(x, y, r + 4, start, start + Math.PI * 1.2)
    g.stroke()
    g.globalAlpha = 1
  }

  // Antenna
  const hx = Math.cos(a.heading)
  const hy = Math.sin(a.heading)
  g.strokeStyle = color
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(x, y - r + 1)
  g.lineTo(x, y - r - 5)
  g.stroke()
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y - r - 6, 1.8, 0, Math.PI * 2)
  g.fill()

  // Body
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()

  // Visor: dark band that slides toward the heading, or faces front when watched.
  const f = a.face
  const vx = x + hx * 3 * (1 - f)
  const vy = y + hy * 2 * (1 - f) - f * 0.5
  g.fillStyle = COLORS.ink
  g.beginPath()
  g.ellipse(vx, vy, 6 + f * 1.5, 4 + f * 1, 0, 0, Math.PI * 2)
  g.fill()

  // Eyes: when travelling, both eyes drift toward the heading; when facing the
  // player they sit level and wide, looking straight out of the screen.
  const eyeSpread = 2.4 + f * 0.6
  const ex = vx + hx * 1.2 * (1 - f)
  const ey = vy + hy * 0.8 * (1 - f)
  const er = 1.2 + f * 0.9
  g.fillStyle = COLORS.label
  g.beginPath()
  g.arc(ex - eyeSpread, ey, er, 0, Math.PI * 2)
  g.arc(ex + eyeSpread, ey, er, 0, Math.PI * 2)
  g.fill()
  if (f > 0.5) {
    g.fillStyle = COLORS.ink
    g.beginPath()
    g.arc(ex - eyeSpread, ey, er * 0.45, 0, Math.PI * 2)
    g.arc(ex + eyeSpread, ey, er * 0.45, 0, Math.PI * 2)
    g.fill()
  }

  // ID label with a dark halo so it stays legible over bright wires.
  const label = String(a.seat.agentId)
  const ly = y + r + 3
  g.lineWidth = Math.max(2, labelPx * 0.28)
  g.strokeStyle = COLORS.labelHalo
  g.lineJoin = 'round'
  g.strokeText(label, x, ly)
  g.fillStyle = held ? COLORS.label : 'rgba(232, 237, 255, 0.92)'
  g.fillText(label, x, ly)
}

export function screenToWorld(cam: Camera, vp: { w: number; h: number }, sx: number, sy: number) {
  return {
    x: cam.x + (sx - vp.w / 2) / cam.zoom,
    y: cam.y + (sy - vp.h / 2) / cam.zoom,
  }
}

export function clampCamera(cam: Camera, vp: { w: number; h: number }): void {
  const minZoom = Math.max(0.5, vp.w / WORLD_W, vp.h / WORLD_H)
  cam.zoom = Math.min(2.5, Math.max(minZoom, cam.zoom))
  const halfW = vp.w / 2 / cam.zoom
  const halfH = vp.h / 2 / cam.zoom
  cam.x = Math.min(WORLD_W - halfW, Math.max(halfW, cam.x))
  cam.y = Math.min(WORLD_H - halfH, Math.max(halfH, cam.y))
}
