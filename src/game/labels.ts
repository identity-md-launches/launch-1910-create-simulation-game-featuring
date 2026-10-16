/** Canvas labels use CSS pixels, independently of the camera's zoom or DPR. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LabelAnchor {
  id: number
  text: string
  x: number
  y: number
  labelY: number
  width: number
  body: Rect
  antenna: Rect
  selected: boolean
}

export interface AgentLabel extends Rect {
  anchor: LabelAnchor
  moved: boolean
}

export const LABEL_HEIGHT = 15
const GAP = 1
const CELL = 48

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** A small spatial index keeps crowded, zoomed-out frames from testing every pair. */
class Occupancy {
  cells = new Map<string, Rect[]>()
  rects: Rect[] = []

  keys(r: Rect): string[] {
    const keys: string[] = []
    for (let y = Math.floor(r.y / CELL); y <= Math.floor((r.y + r.h) / CELL); y++) {
      for (let x = Math.floor(r.x / CELL); x <= Math.floor((r.x + r.w) / CELL); x++) keys.push(`${x}:${y}`)
    }
    return keys
  }

  add(rect: Rect): void {
    const r = { x: rect.x - GAP, y: rect.y - GAP, w: rect.w + GAP * 2, h: rect.h + GAP * 2 }
    this.rects.push(r)
    for (const key of this.keys(r)) {
      const cell = this.cells.get(key)
      if (cell) cell.push(r)
      else this.cells.set(key, [r])
    }
  }

  free(r: Rect): boolean {
    return this.keys(r).every(key => !this.cells.get(key)?.some(other => intersects(r, other)))
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Find a free gap even when all of the nearby candidate positions are occupied. */
function findGap(wanted: Rect, bounds: Rect, occupied: Occupancy): Rect | undefined {
  const bottom = bounds.y + bounds.h - wanted.h
  const right = bounds.x + bounds.w - wanted.w
  // Any free rectangular slot touches a viewport edge or an obstacle edge.
  const rows = new Set([clamp(wanted.y, bounds.y, bottom), bounds.y, bottom])
  for (const r of occupied.rects) {
    if (r.y + r.h >= bounds.y && r.y + r.h <= bottom) rows.add(r.y + r.h)
    if (r.y - wanted.h >= bounds.y && r.y - wanted.h <= bottom) rows.add(r.y - wanted.h)
  }
  for (const y of [...rows].sort((a, b) => Math.abs(a - wanted.y) - Math.abs(b - wanted.y))) {
    const spans = occupied.rects.filter(r => r.y < y + wanted.h && r.y + r.h > y).sort((a, b) => a.x - b.x)
    let start = bounds.x
    let best: Rect | undefined
    const gap = (end: number) => {
      if (end - start < wanted.w) return
      const x = clamp(wanted.x, start, Math.min(right, end - wanted.w))
      const r = { ...wanted, x, y }
      if (!best || Math.abs(x - wanted.x) < Math.abs(best.x - wanted.x)) best = r
    }
    for (const r of spans) {
      gap(Math.min(bounds.x + bounds.w, r.x))
      start = Math.max(start, r.x + r.w)
      if (start > right) break
    }
    gap(bounds.x + bounds.w)
    if (best) return best
  }
}

/** Place every visible full ID after reserving space for all visible sprites. */
export function layoutLabels(
  anchors: LabelAnchor[],
  area: Rect,
  offsets: Map<number, { x: number; y: number }>,
  occluders: Rect[],
): AgentLabel[] {
  const bounds = { x: area.x + 4, y: area.y + 4, w: area.w - 8, h: area.h - 8 }
  const occupied = new Occupancy()
  for (const r of occluders) occupied.add(r)
  for (const a of anchors) {
    occupied.add(a.body)
    occupied.add(a.antenna)
  }
  const labels: AgentLabel[] = []
  // Selection has first choice; the remaining order is stable between frames.
  const ordered = anchors.filter(a => a.selected).concat(anchors.filter(a => !a.selected))
  for (const a of ordered) {
    const wanted = { x: a.x - a.width / 2, y: a.labelY, w: a.width, h: LABEL_HEIGHT }
    if (bounds.w < wanted.w || bounds.h < wanted.h) continue
    const candidate = (x: number, y: number): Rect | undefined => {
      const r = {
        ...wanted,
        x: clamp(x, bounds.x, bounds.x + bounds.w - wanted.w),
        y: clamp(y, bounds.y, bounds.y + bounds.h - wanted.h),
      }
      return occupied.free(r) ? r : undefined
    }
    let placed = candidate(wanted.x, wanted.y)
    const previous = offsets.get(a.id)
    if (!placed && previous && Math.hypot(previous.x + a.width / 2, previous.y - (a.labelY - a.y)) <= 36) {
      placed = candidate(a.x + previous.x, a.y + previous.y)
    }
    // Search nearby slots before using a more distant row gap. The offsets are
    // retained while obstructed, so walking neighbours do not shuffle labels.
    for (let radius = 12; !placed && radius <= 120; radius += 12) {
      for (let d = -radius; !placed && d <= radius; d += 12) {
        for (const [dx, dy] of [[d, -radius], [d, radius], [-radius, d], [radius, d]]) {
          placed = candidate(wanted.x + dx!, wanted.y + dy!)
          if (placed) break
        }
      }
    }
    placed ??= findGap(wanted, bounds, occupied)
    if (!placed) continue // No physical slot in this viewport; never paint IDs over one another.
    occupied.add(placed)
    offsets.set(a.id, { x: placed.x - a.x, y: placed.y - a.y })
    labels.push({ ...placed, anchor: a, moved: Math.abs(placed.x - wanted.x) > 1 || Math.abs(placed.y - wanted.y) > 1 })
  }
  return labels
}
