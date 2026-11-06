'use client'

import { useEffect } from 'react'

interface HelpPanelProps {
  onClose: () => void
}

const SHORTCUTS: [string, string][] = [
  ['N', 'Add a node'],
  ['Double-click canvas', 'Add a node at that point'],
  ['Drag between handles', 'Connect two nodes'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Ctrl + C / V', 'Copy / paste selection'],
  ['Ctrl + D', 'Duplicate selection'],
  ['Click "Import Code"', 'Load Mermaid syntax onto the canvas'],
  ['Ctrl + K', 'Command palette'],
  ['Delete / Backspace', 'Remove selected nodes and edges'],
]

const SECTIONS: [string, string][] = [
  ['1 · Build the diagram', 'Click "+ Node" or a shape in "+ Add Shape", then drag it around. Click a shape button first to draw a custom-sized node directly on the canvas.'],
  ['2 · Connect nodes', 'Hover a node to reveal its connection handles, then drag from one handle to another. Drag the label on an edge to rename it.'],
  ['3 · Group with subgraphs', 'Press "+ Subgraph" to drop a group container. Drag nodes inside it and they attach automatically; drag them out to release them.'],
  ['4 · Load existing code', '"Import Code" replaces the canvas with parsed Mermaid. "Paste Mermaid Code" reads the clipboard; "Load from Selected Cell" pulls the code from a selected draw.io Mermaid shape.'],
  ['5 · Send it back to draw.io', '"✓ Sync to Draw.io" (or the host window\'s "Apply to draw.io Canvas" button) turns the canvas into draw.io shapes. "Copy .mmd" copies the Mermaid source instead.'],
]

export function HelpPanel({ onClose }: HelpPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Visual editor help"
        style={{
          background: 'var(--neu-bg)',
          borderRadius: 16,
          border: '1px solid rgba(203,213,225,0.9)',
          boxShadow: '0 24px 60px -12px rgba(15,23,42,0.45)',
          width: 'min(620px, 94vw)',
          maxHeight: '86vh',
          overflow: 'auto',
          padding: '20px 22px',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>How to use this editor</div>
          <button
            onClick={onClose}
            aria-label="Close help"
            style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
          Changes are live: the Mermaid source updates as you drag, and the result can be sent straight to the draw.io canvas.
        </p>

        {SECTIONS.map(([title, body]) => (
          <div key={title} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: '#334155' }}>{body}</div>
          </div>
        ))}

        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '18px 0 8px' }}>
          Keyboard & mouse
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {SHORTCUTS.map(([keys, desc]) => (
              <tr key={keys} style={{ borderTop: '1px solid rgba(203,213,225,0.6)' }}>
                <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap', fontWeight: 600, color: '#1e293b', width: '42%' }}>{keys}</td>
                <td style={{ padding: '6px 0', color: '#475569' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: 11, color: '#94a3b8', margin: '16px 0 0', lineHeight: 1.5 }}>
          If the canvas looks empty after opening, press <strong>+ Add Starter Flowchart</strong>: it loads a working example you can edit.
        </p>
      </div>
    </div>
  )
}
