import { activityClass, type ActivityClass, type SeatRecord } from '../data/agents'
import { makeRng } from './rng'
import { WORLD_H, WORLD_W, wirePoint, type World } from './world'

export type AgentState = 'roam' | 'toNode' | 'work' | 'chat' | 'attention'

export interface Agent {
  index: number
  seat: SeatRecord
  cls: ActivityClass
  x: number
  y: number
  /** Direction of travel in radians. */
  heading: number
  speed: number
  state: AgentState
  tx: number
  ty: number
  /** Node being visited while in toNode/work. */
  node: number
  /** Seconds left in the current timed state. */
  timer: number
  /** Agent index of the current chat partner, or -1. */
  partner: number
  /** Seconds before this agent may chat again. */
  cooldown: number
  /** 0 = looking where it walks, 1 = looking straight at the player. */
  face: number
  /** Idle wobble phase. */
  phase: number
  /** State snapshot taken when the player interrupted the agent. */
  saved: null | { state: AgentState; tx: number; ty: number; node: number; timer: number; partner: number }
  /** Session counters shown in the info panel. */
  visits: number
  chats: number
}

export interface ChatLink {
  a: number
  b: number
}

export interface Sim {
  world: World
  agents: Agent[]
  byTokenId: Map<number, number>
  byAgentId: Map<number, number>
  rng: () => number
  time: number
  dataAt: string
  /** Agent currently held by the player's click, or -1. */
  held: number
  chatTick: number
}

const CHAT_RADIUS = 30
const ARRIVE = 5

export function createSim(world: World, seats: SeatRecord[], dataAt: string): Sim {
  const rng = makeRng(4242)
  const sim: Sim = {
    world,
    agents: [],
    byTokenId: new Map(),
    byAgentId: new Map(),
    rng,
    time: 0,
    dataAt,
    held: -1,
    chatTick: 0,
  }
  for (const seat of seats) addAgent(sim, seat)
  return sim
}

export function addAgent(sim: Sim, seat: SeatRecord): Agent {
  const { rng } = sim
  const a: Agent = {
    index: sim.agents.length,
    seat,
    cls: activityClass(seat, sim.dataAt),
    x: 60 + rng() * (WORLD_W - 120),
    y: 60 + rng() * (WORLD_H - 120),
    heading: rng() * Math.PI * 2,
    speed: 22 + rng() * 26,
    state: 'roam',
    tx: 0,
    ty: 0,
    node: -1,
    timer: 0,
    partner: -1,
    cooldown: rng() * 10,
    face: 0,
    phase: rng() * Math.PI * 2,
    saved: null,
    visits: 0,
    chats: 0,
  }
  pickNextTask(sim, a)
  sim.agents.push(a)
  sim.byTokenId.set(seat.tokenId, a.index)
  sim.byAgentId.set(seat.agentId, a.index)
  return a
}

/** Merge a fresh data set: update stats in place, add agents for seats the snapshot lacked. */
export function mergeSeats(sim: Sim, seats: SeatRecord[], dataAt: string): { added: number; updated: number } {
  sim.dataAt = dataAt
  let added = 0
  let updated = 0
  for (const s of seats) {
    const idx = sim.byTokenId.get(s.tokenId)
    if (idx === undefined) {
      addAgent(sim, s)
      added++
    } else {
      const a = sim.agents[idx]!
      if (a.seat.agentId !== s.agentId) {
        sim.byAgentId.delete(a.seat.agentId)
        sim.byAgentId.set(s.agentId, idx)
      }
      a.seat = s
      a.cls = activityClass(s, dataAt)
      updated++
    }
  }
  return { added, updated }
}

function pickNextTask(sim: Sim, a: Agent): void {
  const { rng, world } = sim
  if (rng() < 0.55 && world.nodes.length > 0) {
    // Visit a node: the closest of three random candidates, so travel stays local.
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < 3; i++) {
      const n = world.nodes[Math.floor(rng() * world.nodes.length)]!
      const d = Math.hypot(n.x - a.x, n.y - a.y)
      if (d < bestD) {
        bestD = d
        best = n.id
      }
    }
    const n = world.nodes[best]!
    const ang = rng() * Math.PI * 2
    const r = n.radius + 14 + rng() * 10
    a.state = 'toNode'
    a.node = best
    a.tx = n.x + Math.cos(ang) * r
    a.ty = n.y + Math.sin(ang) * r
  } else {
    const range = 220 + rng() * 420
    const ang = rng() * Math.PI * 2
    a.state = 'roam'
    a.node = -1
    a.tx = clamp(a.x + Math.cos(ang) * range, 40, WORLD_W - 40)
    a.ty = clamp(a.y + Math.sin(ang) * range, 40, WORLD_H - 40)
  }
  a.timer = 0
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function turnToward(a: Agent, target: number, dt: number, rate = 6): void {
  let diff = target - a.heading
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const step = Math.min(1, dt * rate)
  a.heading += diff * step
}

export function stepSim(sim: Sim, dt: number): void {
  const { world, agents, rng } = sim
  sim.time += dt

  // Ambient network: pulses glide along wires, node charge decays.
  for (const p of world.pulses) {
    const w = world.wires[p.wire]!
    p.t += (p.dir * p.speed * dt * 300) / Math.max(120, w.length)
    if (p.t > 1 || p.t < 0) {
      const endNode = p.t > 1 ? world.nodes[w.b]! : world.nodes[w.a]!
      const next = endNode.edges[Math.floor(rng() * endNode.edges.length)] ?? p.wire
      const nw = world.wires[next]!
      p.wire = next
      p.dir = nw.a === endNode.id ? 1 : -1
      p.t = p.dir === 1 ? 0 : 1
    }
  }
  for (const n of world.nodes) n.charge = Math.max(0, n.charge - dt * 0.03)
  if (world.pulses.length > 36) {
    // Agent-made pulses expire: keep the ambient set and the newest extras.
    world.pulses.splice(36, world.pulses.length - 56 > 0 ? world.pulses.length - 56 : 0)
  }

  for (const a of agents) {
    a.cooldown = Math.max(0, a.cooldown - dt)
    const faceTarget = a.state === 'attention' ? 1 : 0
    a.face += (faceTarget - a.face) * Math.min(1, dt * 8)

    switch (a.state) {
      case 'attention':
        break
      case 'work': {
        const n = world.nodes[a.node]
        if (n) n.charge = Math.min(1, n.charge + dt * 0.35)
        a.timer -= dt
        if (n) turnToward(a, Math.atan2(n.y - a.y, n.x - a.x), dt)
        if (a.timer <= 0) {
          if (n && n.edges.length > 0) {
            const wid = n.edges[Math.floor(rng() * n.edges.length)]!
            const w = world.wires[wid]!
            world.pulses.push({ wire: wid, t: w.a === n.id ? 0 : 1, dir: w.a === n.id ? 1 : -1, speed: 0.35, hue: 'cyan' })
          }
          pickNextTask(sim, a)
        }
        break
      }
      case 'chat': {
        a.timer -= dt
        const p = agents[a.partner]
        if (p) turnToward(a, Math.atan2(p.y - a.y, p.x - a.x), dt)
        if (a.timer <= 0 || !p || (p.state !== 'chat' && p.state !== 'attention')) {
          a.partner = -1
          a.cooldown = 10 + rng() * 10
          pickNextTask(sim, a)
        }
        break
      }
      case 'roam':
      case 'toNode': {
        const dx = a.tx - a.x
        const dy = a.ty - a.y
        const d = Math.hypot(dx, dy)
        if (d < ARRIVE) {
          if (a.state === 'toNode') {
            a.state = 'work'
            a.timer = 2 + rng() * 3.5
            a.visits++
            const n = world.nodes[a.node]
            if (n) n.visits++
          } else {
            pickNextTask(sim, a)
          }
          break
        }
        const want = Math.atan2(dy, dx) + Math.sin(sim.time * 1.7 + a.phase) * 0.25
        turnToward(a, want, dt, 4)
        const step = Math.min(d, a.speed * dt)
        a.x += Math.cos(a.heading) * step
        a.y += Math.sin(a.heading) * step
        break
      }
    }
  }

  // Agent-to-agent encounters, checked a few times per second on a coarse grid.
  sim.chatTick += dt
  if (sim.chatTick >= 0.3) {
    sim.chatTick = 0
    findEncounters(sim)
  }
}

function findEncounters(sim: Sim): void {
  const { agents, rng } = sim
  const cell = 64
  const grid = new Map<number, number[]>()
  for (const a of agents) {
    if ((a.state !== 'roam' && a.state !== 'toNode') || a.cooldown > 0) continue
    const key = Math.floor(a.x / cell) * 10007 + Math.floor(a.y / cell)
    const list = grid.get(key)
    if (list) list.push(a.index)
    else grid.set(key, [a.index])
  }
  const tryPair = (i: number, j: number) => {
    const a = agents[i]!
    const b = agents[j]!
    if (a.state === 'chat' || b.state === 'chat') return
    if (Math.hypot(a.x - b.x, a.y - b.y) > CHAT_RADIUS) return
    if (rng() > 0.6) return
    const dur = 2 + rng() * 3
    for (const [me, other] of [[a, b], [b, a]] as const) {
      me.state = 'chat'
      me.partner = other.index
      me.timer = dur
      me.chats++
    }
  }
  for (const [key, list] of grid) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) tryPair(list[i]!, list[j]!)
      // Neighbouring cell to the right and below, so pairs across a boundary still meet.
      for (const nk of [key + 10007, key + 1, key + 10008]) {
        const other = grid.get(nk)
        if (!other) continue
        for (const j of other) tryPair(list[i]!, j)
      }
    }
  }
}

/** The player clicked this agent: freeze it where it stands and have it face the screen. */
export function holdAgent(sim: Sim, index: number): void {
  if (sim.held === index) return
  releaseAgent(sim)
  const a = sim.agents[index]
  if (!a) return
  a.saved = { state: a.state, tx: a.tx, ty: a.ty, node: a.node, timer: a.timer, partner: a.partner }
  a.state = 'attention'
  sim.held = index
}

/** The player clicked away: the agent picks up exactly where it left off. */
export function releaseAgent(sim: Sim): void {
  const a = sim.agents[sim.held]
  sim.held = -1
  if (!a || !a.saved) return
  const s = a.saved
  a.saved = null
  const partner = sim.agents[s.partner]
  if (s.state === 'chat' && partner && partner.state === 'chat' && partner.partner === a.index) {
    a.state = 'chat'
    a.partner = s.partner
    a.timer = Math.max(0.8, s.timer)
  } else if (s.state === 'chat') {
    pickNextTask(sim, a)
  } else {
    a.state = s.state
    a.tx = s.tx
    a.ty = s.ty
    a.node = s.node
    a.timer = s.timer
    a.partner = -1
  }
}

/** Nearest agent within `radius` world units of a world point, or -1. */
export function agentAt(sim: Sim, x: number, y: number, radius: number): number {
  let best = -1
  let bestD = radius
  for (const a of sim.agents) {
    const d = Math.hypot(a.x - x, a.y - y)
    if (d < bestD) {
      bestD = d
      best = a.index
    }
  }
  return best
}

export function describeActivity(sim: Sim, a: Agent): string {
  const state = a.state === 'attention' && a.saved ? a.saved.state : a.state
  const nodeIdx = a.state === 'attention' && a.saved ? a.saved.node : a.node
  const partnerIdx = a.state === 'attention' && a.saved ? a.saved.partner : a.partner
  const node = sim.world.nodes[nodeIdx]
  const partner = sim.agents[partnerIdx]
  const prefix = a.state === 'attention' ? 'Paused while looking at you. It was ' : 'It is '
  switch (state) {
    case 'roam':
      return `${prefix}roaming the network.`
    case 'toNode':
      return `${prefix}walking to ${node ? nodeName(node.kind, node.id) : 'a node'}.`
    case 'work':
      return `${prefix}charging ${node ? nodeName(node.kind, node.id) : 'a node'}.`
    case 'chat':
      return `${prefix}talking with agent ${partner ? partner.seat.agentId : 'nearby'}.`
    default:
      return 'It is looking at you.'
  }
}

export function nodeName(kind: string, id: number): string {
  return `${kind} ${id}`
}

export { wirePoint }
