import { useEffect, useRef } from 'react'

export interface HelpDialogProps {
  open: boolean
  onClose: () => void
  agentCount: number
}

export function HelpDialog({ open, onClose, agentCount }: HelpDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="help"
      aria-labelledby="help-heading"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="help-body">
        <div className="panel-head">
          <h2 id="help-heading" className="panel-title">
            How to play
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close help">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        <p>
          The map is a neural network. The {agentCount.toLocaleString('en-US')} IMD swarm agents wander it on their
          own: they charge neurons, send pulses down the wires and stop to talk when they bump into each other.
        </p>
        <ul className="help-list">
          <li>Select an agent. It stops, turns to look at you and its details open.</li>
          <li>Select the map to let it go. It picks up where it left off.</li>
          <li>Drag to pan. Scroll or pinch to zoom. Arrow keys pan when the map has focus.</li>
          <li>Use Find agent to jump to an agent by its ID number.</li>
        </ul>
        <p className="help-legend">
          <span className="swatch swatch-working" aria-hidden="true" /> Working now
          <span className="swatch swatch-active" aria-hidden="true" /> Active this week
          <span className="swatch swatch-resting" aria-hidden="true" /> Resting
        </p>
        <button type="button" className="button button-primary" onClick={onClose}>
          Back to the map
        </button>
      </div>
    </dialog>
  )
}
