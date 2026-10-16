import snapshot from './swarm-snapshot.json'

/** One enrolled seat of the IMD swarm: a token in the collection operated by one agent. */
export interface SeatRecord {
  tokenId: number
  /** The real IMD agent ID number shown on the map. */
  agentId: number
  attempts: number
  accepted: number
  rejected: number
  failed: number
  pending: number
  /** ISO timestamp of the agent's last activity on the network. */
  last: string
  working: boolean
  queued: number
  /** Ethereum address of the wallet that owns the seat. */
  owner: string | null
}

export interface SwarmHealth {
  agentsOnline: number
  workingNow: number
  acceptedLastDay: number
  jobsDoneLastDay: number
  seatsEnrolled: number
}

export interface SwarmData {
  seats: SeatRecord[]
  health: SwarmHealth
  chain: { chainId: number; collection: string }
  /** When this data was produced by the network. */
  at: string
  /** 'snapshot' is bundled with the site; 'live' was fetched from the network at page load. */
  mode: 'snapshot' | 'live'
}

export const SWARM_API = 'https://api.imd.fun/swarm'

type Row = [number, number, number, number, number, number, number, string, number, number, string]

function rowToSeat(r: Row): SeatRecord {
  return {
    tokenId: r[0],
    agentId: r[1],
    attempts: r[2],
    accepted: r[3],
    rejected: r[4],
    failed: r[5],
    pending: r[6],
    last: r[7],
    working: r[8] === 1,
    queued: r[9],
    owner: r[10] || null,
  }
}

export function loadSnapshot(): SwarmData {
  const rows = snapshot.seats as Row[]
  return {
    seats: rows.map(rowToSeat),
    health: snapshot.health,
    chain: snapshot.chain,
    at: snapshot.snapshotAt,
    mode: 'snapshot',
  }
}

interface ApiSeat {
  tokenId: number
  agentId: string | number
  attempts: number
  accepted: number
  rejected: number
  failed: number
  pending: number
  last: string
  working: boolean
  queued: number
}

interface ApiResponse {
  at: number
  health: SwarmHealth
  seats: Record<string, ApiSeat>
  owners: (string | null)[]
  chain: { chainId: number; collection: string }
}

/** Fetch the current swarm state from the public network API. Resolves null on any failure. */
export async function fetchLive(timeoutMs = 8000): Promise<SwarmData | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(SWARM_API, { signal: ctrl.signal, mode: 'cors' })
    if (!res.ok) return null
    const json = (await res.json()) as ApiResponse
    if (!json || typeof json.seats !== 'object') return null
    const seats = Object.values(json.seats)
      .filter((s) => s && Number.isFinite(Number(s.agentId)))
      .map<SeatRecord>((s) => ({
        tokenId: s.tokenId,
        agentId: Number(s.agentId),
        attempts: s.attempts ?? 0,
        accepted: s.accepted ?? 0,
        rejected: s.rejected ?? 0,
        failed: s.failed ?? 0,
        pending: s.pending ?? 0,
        last: s.last ?? '',
        working: Boolean(s.working),
        queued: s.queued ?? 0,
        owner: (json.owners?.[s.tokenId] ?? null)?.toLowerCase() ?? null,
      }))
      .sort((a, b) => a.tokenId - b.tokenId)
    if (seats.length === 0) return null
    return {
      seats,
      health: json.health,
      chain: json.chain ?? snapshot.chain,
      at: new Date(json.at).toISOString(),
      mode: 'live',
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function acceptanceRate(s: SeatRecord): number | null {
  const settled = s.accepted + s.rejected + s.failed
  if (settled === 0) return null
  return s.accepted / settled
}

/** Days since the seat's last recorded activity, relative to the data timestamp. */
export function daysSinceActive(s: SeatRecord, nowIso: string): number {
  const last = Date.parse(s.last)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(last) || !Number.isFinite(now)) return Infinity
  return Math.max(0, (now - last) / 86_400_000)
}

export type ActivityClass = 'working' | 'active' | 'resting'

export function activityClass(s: SeatRecord, nowIso: string): ActivityClass {
  if (s.working) return 'working'
  return daysSinceActive(s, nowIso) <= 7 ? 'active' : 'resting'
}
