import { useEffect, useRef } from 'react'
import { clampCamera, paintStaticLayer, render, screenToWorld, type Camera } from './render'
import { agentAt, stepSim, type Sim } from './sim'
import { WORLD_H, WORLD_W } from './world'

export interface GameCanvasProps {
  sim: Sim
  paused: boolean
  reducedMotion: boolean
  /** Agent index the player clicked, or null when they clicked the map. */
  onPick: (index: number | null) => void
  /** Camera requests from the UI (find an agent): centre on these world coordinates. */
  focusRef: React.RefObject<{ x: number; y: number } | null>
}

interface Pointer {
  id: number
  x: number
  y: number
  startX: number
  startY: number
  startTime: number
  moved: boolean
}

export function GameCanvas({ sim, paused, reducedMotion, onPick, focusRef }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<Camera>({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 })
  const hoverRef = useRef(-1)
  const pausedRef = useRef(paused)
  const reducedRef = useRef(reducedMotion)
  pausedRef.current = paused
  reducedRef.current = reducedMotion

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    const staticLayer = paintStaticLayer(sim.world)
    const vp = { w: 1, h: 1, dpr: 1 }
    const cam = camRef.current
    const pointers = new Map<number, Pointer>()
    let pinchDist = 0
    let frame = 0
    let last = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      vp.w = Math.max(1, rect.width)
      vp.h = Math.max(1, rect.height)
      vp.dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(vp.w * vp.dpr)
      canvas.height = Math.round(vp.h * vp.dpr)
      clampCamera(cam, vp)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const hitRadius = (touch: boolean) => (touch ? 22 : 16) / cam.zoom

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, {
        id: e.pointerId,
        x: e.offsetX,
        y: e.offsetY,
        startX: e.offsetX,
        startY: e.offsetY,
        startTime: performance.now(),
        moved: false,
      })
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()]
        pinchDist = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) {
        if (e.pointerType === 'mouse') {
          const w = screenToWorld(cam, vp, e.offsetX, e.offsetY)
          const hit = agentAt(sim, w.x, w.y, hitRadius(false))
          hoverRef.current = hit
          canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab'
        }
        return
      }
      const dx = e.offsetX - p.x
      const dy = e.offsetY - p.y
      p.x = e.offsetX
      p.y = e.offsetY
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > 6) p.moved = true
      if (pointers.size === 1) {
        cam.x -= dx / cam.zoom
        cam.y -= dy / cam.zoom
        clampCamera(cam, vp)
        if (p.moved) canvas.style.cursor = 'grabbing'
      } else if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()]
        const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
        if (pinchDist > 0) {
          const mx = (p1!.x + p2!.x) / 2
          const my = (p1!.y + p2!.y) / 2
          zoomAt(mx, my, d / pinchDist)
        }
        pinchDist = d
      }
    }
    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      canvas.style.cursor = 'grab'
      if (!p) return
      const quick = performance.now() - p.startTime < 500
      if (!p.moved && quick && pointers.size === 0) {
        const w = screenToWorld(cam, vp, p.x, p.y)
        const hit = agentAt(sim, w.x, w.y, hitRadius(e.pointerType !== 'mouse'))
        onPick(hit >= 0 ? hit : null)
      }
    }
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
    }
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = screenToWorld(cam, vp, sx, sy)
      cam.zoom *= factor
      clampCamera(cam, vp)
      const after = screenToWorld(cam, vp, sx, sy)
      cam.x += before.x - after.x
      cam.y += before.y - after.y
      clampCamera(cam, vp)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomAt(e.offsetX, e.offsetY, factor)
    }
    const onKey = (e: KeyboardEvent) => {
      const step = 80 / cam.zoom
      switch (e.key) {
        case 'ArrowLeft':
          cam.x -= step
          break
        case 'ArrowRight':
          cam.x += step
          break
        case 'ArrowUp':
          cam.y -= step
          break
        case 'ArrowDown':
          cam.y += step
          break
        case '+':
        case '=':
          zoomAt(vp.w / 2, vp.h / 2, 1.2)
          break
        case '-':
          zoomAt(vp.w / 2, vp.h / 2, 1 / 1.2)
          break
        default:
          return
      }
      e.preventDefault()
      clampCamera(cam, vp)
    }

    // Test hook: lets interaction checks read world/screen state without touching internals.
    const w = window as unknown as { __imdSwarm?: unknown }
    w.__imdSwarm = {
      sim,
      cam,
      vp,
      toScreen: (x: number, y: number) => ({
        x: (x - cam.x) * cam.zoom + vp.w / 2,
        y: (y - cam.y) * cam.zoom + vp.h / 2,
      }),
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('keydown', onKey)

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (focusRef.current) {
        cam.x = focusRef.current.x
        cam.y = focusRef.current.y
        if (cam.zoom < 1) cam.zoom = 1
        focusRef.current = null
        clampCamera(cam, vp)
      }
      if (!pausedRef.current) stepSim(sim, reducedRef.current ? dt * 0.6 : dt)
      render(g, staticLayer, sim, cam, vp, { hovered: hoverRef.current, reducedMotion: reducedRef.current })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKey)
    }
  }, [sim, onPick, focusRef])

  return (
    <canvas
      ref={canvasRef}
      className="map"
      tabIndex={0}
      role="img"
      aria-label={`Map of the IMD swarm: ${sim.agents.length} agents roaming a neural network. Drag to pan, scroll or pinch to zoom, arrow keys to pan with the keyboard. Use the Find agent form to pick an agent by ID.`}
      data-testid="map"
    />
  )
}
