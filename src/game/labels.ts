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
const EPSILON = 1e-7
type Offsets = Map<number, { x: number; y: number }>
// Reuse unchanged frames and valid packed positions, avoiding repeated searches
// while paused and needless shuffling of readable IDs in dense moving frames.
const layouts = new WeakMap<Offsets, { labels: AgentLabel[]; packed: boolean }>()

function intersects(a: Rect, b: Rect): boolean {
  // Edge-aligned gaps can differ by rounding noise after an offset round trip.
  return a.x < b.x + b.w - EPSILON && a.x + a.w > b.x + EPSILON &&
    a.y < b.y + b.h - EPSILON && a.y + a.h > b.y + EPSILON
}

/** A small spatial index keeps crowded, zoomed-out frames from testing every pair. */
class Occupancy {
  cells = new Map<string, Rect[]>()
  rects: Rect[] = []

  constructor(rects: Rect[] = []) {
    for (const r of rects) this.insert(r)
  }

  keys(r: Rect): string[] {
    const keys: string[] = []
    for (let y = Math.floor(r.y / CELL); y <= Math.floor((r.y + r.h) / CELL); y++) {
      for (let x = Math.floor(r.x / CELL); x <= Math.floor((r.x + r.w) / CELL); x++) keys.push(`${x}:${y}`)
    }
    return keys
  }

  add(rect: Rect): void {
    const r = { x: rect.x - GAP, y: rect.y - GAP, w: rect.w + GAP * 2, h: rect.h + GAP * 2 }
    this.insert(r)
  }

  private insert(r: Rect): void {
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

/** Reclaim fragmented space by packing rows before assigning them to agents.
 * Greedy placement can fill every remaining gap even though a complete packing
 * exists. These rows depend only on sprites/overlays (and the selected label),
 * so earlier unselected labels can move instead of making later IDs disappear.
 */
function packLabels(anchors: LabelAnchor[], bounds: Rect, fixed: Rect[], selected?: AgentLabel): AgentLabel[] | undefined {
  const remaining = anchors.filter(a => a !== selected?.anchor)
  const width = Math.max(...remaining.map(a => a.width))
  const obstacles = selected
    ? [...fixed, { x: selected.x - GAP, y: selected.y - GAP, w: selected.w + GAP * 2, h: selected.h + GAP * 2 }]
    : fixed
  const left = bounds.x, right = left + bounds.w
  const top = Math.ceil(bounds.y), bottom = Math.floor(bounds.y + bounds.h - LABEL_HEIGHT)
  const stride = LABEL_HEIGHT + GAP
  const rows: Rect[][] = []
  const capacity: number[] = []
  const take: boolean[] = []
  // Evaluate each CSS-pixel row. Weighted interval scheduling chooses the most
  // slots without vertically overlapping rows; a fixed grid wastes edge gaps.
  for (let y = top; y <= bottom; y++) {
    const spans = obstacles.filter(r => r.y < y + LABEL_HEIGHT && r.y + r.h > y).sort((a, b) => a.x - b.x)
    const slots: Rect[] = []
    let x = left
    const fill = (end: number) => {
      for (; x + width <= end; x += width + GAP) slots.push({ x, y, w: width, h: LABEL_HEIGHT })
    }
    for (const r of spans) {
      fill(Math.min(right, r.x))
      x = Math.max(x, r.x + r.w)
      if (x + width > right) break
    }
    fill(right)
    const row = y - top
    const packed = slots.length + (capacity[row - stride] ?? 0)
    const skipped = capacity[row - 1] ?? 0
    rows.push(slots)
    take.push(packed > skipped)
    capacity.push(Math.max(packed, skipped))
  }
  const slots: Rect[] = []
  for (let row = rows.length - 1; row >= 0;) {
    if (take[row]) {
      slots.push(...rows[row]!)
      row -= stride
    } else row--
  }
  // Stagger extra slots through gaps between partially occupied rows.
  if (slots.length < remaining.length) {
    const occupied = new Occupancy(obstacles)
    for (const r of slots) occupied.add(r)
    while (slots.length < remaining.length) {
      const extra = findGap({ x: left, y: top, w: width, h: LABEL_HEIGHT }, bounds, occupied)
      if (!extra) return
      occupied.add(extra)
      slots.push(extra)
    }
  }
  const distance = (a: LabelAnchor, r: Rect) => (r.x + r.w / 2 - a.x) ** 2 + (r.y - a.labelY) ** 2
  // Give the closest agents their slots first; then improve pair assignments to
  // keep connector lengths short without changing the collision-free packing.
  const order = remaining.map(a => ({ a, distance: Math.min(...slots.map(r => distance(a, r))) }))
    .sort((a, b) => a.distance - b.distance || a.a.id - b.a.id)
  const placed = order.map(({ a }) => {
    let best = 0
    for (let i = 1; i < slots.length; i++) if (distance(a, slots[i]!) < distance(a, slots[best]!)) best = i
    return { a, r: slots.splice(best, 1)[0]! }
  })
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!, b = placed[j]!
      if (distance(a.a, b.r) + distance(b.a, a.r) < distance(a.a, a.r) + distance(b.a, b.r)) {
        [a.r, b.r] = [b.r, a.r]
      }
    }
  }
  const byId = new Map(placed.map(({ a, r }) => [a.id, {
    ...r, x: r.x + (r.w - a.width) / 2, w: a.width, anchor: a, moved: true,
  }]))
  if (selected) byId.set(selected.anchor.id, selected)
  return anchors.map(a => byId.get(a.id)!)
}

/** Reserve every sprite, then place full IDs. An incomplete result signals the
 * renderer to narrow an overfull view before it paints any bodies or labels. */
export function layoutLabels(
  anchors: LabelAnchor[],
  area: Rect,
  offsets: Offsets,
  occluders: Rect[],
): AgentLabel[] {
  const bounds = { x: area.x + 4, y: area.y + 4, w: area.w - 8, h: area.h - 8 }
  const occupied = new Occupancy()
  for (const r of occluders) occupied.add(r)
  for (const a of anchors) {
    occupied.add(a.body)
    occupied.add(a.antenna)
  }
  const fixed = [...occupied.rects]
  const cached = layouts.get(offsets)
  const byId = new Map(anchors.map(a => [a.id, a]))
  if (cached?.labels.length === anchors.length && cached.labels.every(l => {
    const a = byId.get(l.anchor.id)
    return a && a.width === l.w && a.selected === l.anchor.selected &&
      Math.hypot(a.x - l.anchor.x, a.y - l.anchor.y) <= (cached.packed ? 12 : EPSILON) &&
      l.x >= bounds.x - EPSILON && l.y >= bounds.y - EPSILON && l.x + l.w <= bounds.x + bounds.w + EPSILON &&
      l.y + l.h <= bounds.y + bounds.h + EPSILON && occupied.free(l)
  })) {
    return cached.labels.map(l => {
      const a = byId.get(l.anchor.id)!
      return { ...l, anchor: a, moved: Math.abs(l.x - (a.x - a.width / 2)) > 1 || Math.abs(l.y - a.labelY) > 1 }
    })
  }
  layouts.delete(offsets)
  const labels: AgentLabel[] = []
  // Selection has first choice; the remaining order is stable between frames.
  const ordered = anchors.filter(a => a.selected).concat(anchors.filter(a => !a.selected))
  for (const a of ordered) {
    const wanted = { x: a.x - a.width / 2, y: a.labelY, w: a.width, h: LABEL_HEIGHT }
    if (bounds.w < wanted.w || bounds.h < wanted.h) return labels
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
    if (!placed) {
      const packed = packLabels(ordered, bounds, fixed, labels.find(l => l.anchor.selected))
      if (packed) {
        layouts.set(offsets, { labels: packed, packed: true })
        for (const l of packed) offsets.set(l.anchor.id, { x: l.x - l.anchor.x, y: l.y - l.anchor.y })
        return packed
      }
      return labels // Capacity signal, never a silently skipped individual ID.
    }
    occupied.add(placed)
    offsets.set(a.id, { x: placed.x - a.x, y: placed.y - a.y })
    labels.push({ ...placed, anchor: a, moved: Math.abs(placed.x - wanted.x) > 1 || Math.abs(placed.y - wanted.y) > 1 })
  }
  layouts.set(offsets, { labels, packed: false })
  return labels
}
