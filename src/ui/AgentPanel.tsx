import { useEffect, useRef, useState } from 'react'
import { acceptanceRate, daysSinceActive, type SeatRecord } from '../data/agents'
import { describeActivity, type Agent, type Sim } from '../game/sim'

export interface AgentPanelProps {
  sim: Sim
  agent: Agent
  collection: string
  dataAt: string
  dataMode: 'snapshot' | 'live'
  onClose: () => void
}

const numberFmt = new Intl.NumberFormat('en-US')
const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

function formatDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? `${dateFmt.format(t)} UTC` : 'Unknown'
}

function statusText(seat: SeatRecord, dataAt: string): string {
  if (seat.working) return 'Working on a job right now'
  const days = daysSinceActive(seat, dataAt)
  if (!Number.isFinite(days)) return 'No activity recorded'
  if (days < 1) return 'Active in the last day'
  if (days <= 7) return `Active ${Math.round(days)} days ago`
  return `Resting, last active ${Math.round(days)} days ago`
}

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function AgentPanel({ sim, agent, collection, dataAt, dataMode, onClose }: AgentPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [activity, setActivity] = useState(() => describeActivity(sim, agent))
  const seat = agent.seat
  const rate = acceptanceRate(seat)

  useEffect(() => {
    headingRef.current?.focus()
  }, [agent.index])

  useEffect(() => {
    setActivity(describeActivity(sim, agent))
    const id = window.setInterval(() => setActivity(describeActivity(sim, agent)), 1000)
    return () => window.clearInterval(id)
  }, [sim, agent])

  const rows: [string, string][] = [
    ['Seat token', `#${seat.tokenId}`],
    ['Network status', statusText(seat, dataAt)],
    ['Last active', formatDate(seat.last)],
    ['Attempts', numberFmt.format(seat.attempts)],
    ['Accepted', numberFmt.format(seat.accepted)],
    ['Rejected', numberFmt.format(seat.rejected)],
    ['Failed', numberFmt.format(seat.failed)],
    ['Pending review', numberFmt.format(seat.pending)],
    ['Queued jobs', numberFmt.format(seat.queued)],
    ['Acceptance rate', rate === null ? 'No settled jobs yet' : `${(rate * 100).toFixed(1)}%`],
    ['Nodes charged this visit', numberFmt.format(agent.visits)],
    ['Conversations this visit', numberFmt.format(agent.chats)],
  ]

  return (
    <aside className="panel" role="dialog" aria-labelledby="agent-heading" data-testid="agent-panel">
      <div className="panel-head">
        <div>
          <h2 id="agent-heading" ref={headingRef} tabIndex={-1} className="panel-title">
            Agent {seat.agentId}
          </h2>
          <p className="panel-activity" data-testid="agent-activity">
            {activity}
          </p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close agent details">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>

      <dl className="facts">
        {rows.map(([k, v]) => (
          <div className="fact" key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
        <div className="fact">
          <dt>Owner</dt>
          <dd className="num">
            {seat.owner ? (
              <a
                href={`https://etherscan.io/address/${seat.owner}`}
                target="_blank"
                rel="noreferrer"
                title={seat.owner}
              >
                {shortAddress(seat.owner)}
              </a>
            ) : (
              'Unknown'
            )}
          </dd>
        </div>
      </dl>

      <p className="panel-links">
        <a href={`https://etherscan.io/nft/${collection}/${seat.tokenId}`} target="_blank" rel="noreferrer">
          View seat #{seat.tokenId} on Etherscan
        </a>
      </p>
      <p className="panel-note">
        {dataMode === 'live' ? 'Live network data from ' : 'Bundled snapshot from '}
        {formatDate(dataAt)}.
      </p>
    </aside>
  )
}
