'use client'

import { useState, useEffect, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas, DEFAULT_STARTER_FLOWCHART } from '@/components/Canvas'
import { TopToolbar } from '@/components/TopToolbar'
import { ZoomControls } from '@/components/ZoomControls'
import { InspectorPanel } from '@/components/Inspector/InspectorPanel'
import { CommandPalette } from '@/components/CommandPalette'
import { useFlowStore } from '@/lib/store'
import { serialize } from '@/lib/serializer'
import { parseMermaidFlowchart } from '@/lib/parser'

function EditorContent() {
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const { nodes, edges, direction, theme, look, curveStyle } = useFlowStore()
  const syntax = serialize(nodes, edges, { direction, theme, look, curveStyle })

  // Keep a ref to the latest syntax for synchronous message retrieval
  const syntaxRef = useRef(syntax)
  useEffect(() => {
    syntaxRef.current = syntax
  }, [syntax])

  // Mount logic: Load default starter flowchart if canvas is empty, then notify parent
  useEffect(() => {
    const currentNodes = useFlowStore.getState().nodes
    if (currentNodes.length === 0) {
      const res = parseMermaidFlowchart(DEFAULT_STARTER_FLOWCHART)
      if (res && !res.error && res.nodes && res.nodes.length > 0) {
        useFlowStore.getState().importDiagram(res.nodes, res.edges, {
          direction: res.direction,
          theme: res.theme,
          look: res.look,
          curveStyle: res.curveStyle,
        })
      }
    }

    // Two-way communication bridge with parent frame (Draw.io Desktop integration)
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return

      // Draw.io requests current syntax (e.g. from dialog apply button)
      if (event.data.type === 'GET_MERMAID') {
        const state = useFlowStore.getState()
        const latestSyntax = serialize(state.nodes, state.edges, {
          direction: state.direction,
          theme: state.theme,
          look: state.look,
          curveStyle: state.curveStyle,
        })
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'MERMAID_SYNC', syntax: latestSyntax }, '*')
        }
        return
      }

      // Draw.io sends code to load into editor
      if (event.data.type === 'LOAD_MERMAID' && typeof event.data.syntax === 'string') {
        const res = parseMermaidFlowchart(event.data.syntax)
        if (res && !res.error && res.nodes && res.nodes.length > 0) {
          useFlowStore.getState().importDiagram(res.nodes, res.edges, {
            direction: res.direction,
            theme: res.theme,
            look: res.look,
            curveStyle: res.curveStyle,
          })
        }
      }
    }

    window.addEventListener('message', handleMessage)

    // Notify Draw.io that editor is ready to receive diagram code
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'MERMAID_EDITOR_READY' }, '*')
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        background: 'var(--neu-bg)',
      }}
    >
      {/* Canvas zone */}
      <div style={{ position: 'relative', flex: 1, background: 'var(--neu-bg)' }}>
        <Canvas onOpenPalette={() => setPaletteOpen(true)} />

        {/* Top overlay - toolbar */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 20,
            pointerEvents: 'none',
          }}
        >
          <TopToolbar
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            onOpenPalette={() => setPaletteOpen(true)}
            syntax={syntax}
          />
        </div>

        {/* Zoom controls */}
        <ZoomControls />
      </div>

      {/* Right Inspector panel */}
      {inspectorOpen && (
        <InspectorPanel
          syntax={syntax}
          onCollapse={() => setInspectorOpen(false)}
        />
      )}

      {/* Command Palette */}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <EditorContent />
    </ReactFlowProvider>
  )
}
