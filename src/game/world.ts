import { makeRng } from './rng'

export const WORLD_W = 3600
export const WORLD_H = 2700

export type NodeKind = 'hub' | 'neuron' | 'relay'

/** A neuron of the background network. Agents visit nodes and charge them. */
export interface NetNode {
  id: number
  x: number
  y: number
  kind: NodeKind
  radius: number
  /** 0..1, raised by agents working at the node, decays over time. */
  charge: number
  /** Count of agent visits during this session. */
  visits: number
  edges: number[]
}

export interface Wire {
  id: number
  a: number
  b: number
  /** Control point for the curve. */
  cx: number
  cy: number
  length: number
}

export interface Pulse {
  wire: number
  /** 0..1 along the wire, from a to b when dir is 1. */
  t: number
  dir: 1 | -1
  speed: number
  hue: 'cyan' | 'violet'
}

export interface World {
  nodes: NetNode[]
  wires: Wire[]
  pulses: Pulse[]
}

export function buildWorld(seed = 1337): World {
  const rng = makeRng(seed)
  const nodes: NetNode[] = []
  const cols = 13
  const rows = 10
  const cellW = WORLD_W / cols
  const cellH = WORLD_H / rows
  let id = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Skip a few cells so the network has open regions, never the border cells.
      if (rng() < 0.12 && r > 0 && c > 0 && r < rows - 1 && c < cols - 1) continue
      const x = (c + 0.5) * cellW + (rng() - 0.5) * cellW * 0.7
      const y = (r + 0.5) * cellH + (rng() - 0.5) * cellH * 0.7
      const roll = rng()
      const kind: NodeKind = roll < 0.1 ? 'hub' : roll < 0.7 ? 'neuron' : 'relay'
      const radius = kind === 'hub' ? 22 : kind === 'neuron' ? 13 : 8
      nodes.push({
        id: id++,
        x: Math.min(WORLD_W - 80, Math.max(80, x)),
        y: Math.min(WORLD_H - 80, Math.max(80, y)),
        kind,
        radius,
        charge: rng() * 0.25,
        visits: 0,
        edges: [],
      })
    }
  }

  const wires: Wire[] = []
  const seen = new Set<string>()
  const link = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (a === b || seen.has(key)) return
    seen.add(key)
    const na = nodes[a]!
    const nb = nodes[b]!
    const mx = (na.x + nb.x) / 2
    const my = (na.y + nb.y) / 2
    const dx = nb.x - na.x
    const dy = nb.y - na.y
    const len = Math.hypot(dx, dy)
    const bow = (rng() - 0.5) * Math.min(160, len * 0.35)
    const w: Wire = {
      id: wires.length,
      a,
      b,
      cx: mx + (-dy / len) * bow,
      cy: my + (dx / len) * bow,
      length: len,
    }
    wires.push(w)
    na.edges.push(w.id)
    nb.edges.push(w.id)
  }

  for (const n of nodes) {
    const nearest = nodes
      .filter((m) => m.id !== n.id)
      .map((m) => ({ id: m.id, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .sort((p, q) => p.d - q.d)
    const k = n.kind === 'hub' ? 5 : n.kind === 'neuron' ? 3 : 2
    for (let i = 0; i < k && i < nearest.length; i++) link(n.id, nearest[i]!.id)
  }

  const pulses: Pulse[] = []
  for (let i = 0; i < 36; i++) {
    pulses.push({
      wire: Math.floor(rng() * wires.length),
      t: rng(),
      dir: rng() < 0.5 ? 1 : -1,
      speed: 0.12 + rng() * 0.18,
      hue: rng() < 0.6 ? 'cyan' : 'violet',
    })
  }

  return { nodes, wires, pulses }
}

/** Point on a quadratic wire at parameter t. */
export function wirePoint(world: World, w: Wire, t: number): { x: number; y: number } {
  const a = world.nodes[w.a]!
  const b = world.nodes[w.b]!
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * w.cx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * w.cy + t * t * b.y,
  }
}
