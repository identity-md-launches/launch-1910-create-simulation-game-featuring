import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { fetchLive, loadSnapshot, type SwarmData } from './data/agents'
import { GameCanvas } from './game/GameCanvas'
import { createSim, holdAgent, mergeSeats, releaseAgent } from './game/sim'
import { buildWorld } from './game/world'
import { AgentPanel } from './ui/AgentPanel'
import { HelpDialog } from './ui/HelpDialog'

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export default function App() {
  const [data, setData] = useState<SwarmData>(() => loadSnapshot())
  const sim = useMemo(() => {
    const snapshot = loadSnapshot()
    return createSim(buildWorld(), snapshot.seats, snapshot.at)
  }, [])
  const [selected, setSelected] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [agentCount, setAgentCount] = useState(sim.agents.length)
  const focusRef = useRef<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // Refresh from the public network API once; the bundled snapshot is the fallback.
  useEffect(() => {
    let cancelled = false
    fetchLive().then((live) => {
      if (cancelled || !live) return
      const { added } = mergeSeats(sim, live.seats, live.at)
      setData(live)
      setAgentCount(sim.agents.length)
      setStatus(
        added > 0
          ? `Live data loaded. ${added} new agents joined the map.`
          : 'Live data loaded from the network.',
      )
    })
    return () => {
      cancelled = true
    }
  }, [sim])

  const pick = useCallback(
    (index: number | null) => {
      if (index === null) {
        releaseAgent(sim)
        setSelected(null)
        return
      }
      holdAgent(sim, index)
      setSelected(index)
      const a = sim.agents[index]
      if (a) setStatus(`Agent ${a.seat.agentId} stopped and is looking at you.`)
    },
    [sim],
  )

  const close = useCallback(() => {
    releaseAgent(sim)
    setSelected(null)
    document.querySelector<HTMLCanvasElement>('canvas.map')?.focus()
  }, [sim])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected !== null && !helpOpen) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, helpOpen, close])

  const onFind = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const raw = findInputRef.current?.value.trim() ?? ''
    const id = Number(raw.replace(/^#/, ''))
    const idx = sim.byAgentId.get(id)
    if (raw === '' || idx === undefined) {
      setFindError(raw === '' ? 'Enter an agent ID, for example 51364.' : `No agent with ID ${raw} is on the map.`)
      findInputRef.current?.focus()
      return
    }
    setFindError(null)
    const a = sim.agents[idx]!
    focusRef.current = { x: a.x, y: a.y }
    pick(idx)
  }

  const onRandom = () => {
    const idx = Math.floor(Math.random() * sim.agents.length)
    const a = sim.agents[idx]!
    setFindError(null)
    focusRef.current = { x: a.x, y: a.y }
    pick(idx)
  }

  const agent = selected !== null ? sim.agents[selected] : undefined

  return (
    <div className={`app${agent ? ' has-panel' : ''}`}>
      <a className="skip-link" href="#map-region">
        Skip to the map
      </a>
      <header className="topbar">
        <h1 className="brand">IMD Swarm Map</h1>
        <nav className="controls" aria-label="Map controls">
          <button
            type="button"
            className="button"
            aria-expanded={findOpen}
            aria-controls="find-row"
            onClick={() => {
              setFindOpen((v) => !v)
              if (!findOpen) window.setTimeout(() => findInputRef.current?.focus(), 0)
            }}
          >
            Find<span className="label-wide"> agent</span>
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={paused}
            onClick={() => {
              setPaused((p) => !p)
              setStatus(paused ? 'Simulation resumed.' : 'Simulation paused.')
            }}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? (
              <svg className="button-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg className="button-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
              </svg>
            )}
            <span className="label-wide">{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button type="button" className="button" onClick={() => setHelpOpen(true)}>
            Help
          </button>
        </nav>
      </header>

      <form id="find-row" className="find-row" onSubmit={onFind} hidden={!findOpen} noValidate>
        <label className="find-label" htmlFor="find-input">
          Agent ID
        </label>
        <input
          id="find-input"
          ref={findInputRef}
          className="find-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="51364"
          aria-describedby={findError ? 'find-error' : undefined}
          aria-invalid={findError ? true : undefined}
        />
        <button type="submit" className="button button-primary">
          Find
        </button>
        <button type="button" className="button" onClick={onRandom}>
          Meet a random agent
        </button>
        {findError && (
          <p id="find-error" className="find-error" role="alert">
            {findError}
          </p>
        )}
      </form>

      <main id="map-region" className="stage">
        <GameCanvas sim={sim} paused={paused} reducedMotion={reducedMotion} onPick={pick} focusRef={focusRef} panelRef={panelRef} />
        {!agent && (
          <p className="hint" data-testid="hint">
            Tap an agent to meet it. {agentCount.toLocaleString('en-US')} agents are roaming.
          </p>
        )}
        <p className="data-note">
          {data.mode === 'live' ? 'Live from api.imd.fun' : `Snapshot of api.imd.fun, ${dateFmt.format(Date.parse(data.at))}`}
        </p>
        {agent && (
          <AgentPanel
            panelRef={panelRef}
            sim={sim}
            agent={agent}
            collection={data.chain.collection}
            dataAt={data.at}
            dataMode={data.mode}
            onClose={close}
          />
        )}
      </main>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} agentCount={agentCount} />
    </div>
  )
}
