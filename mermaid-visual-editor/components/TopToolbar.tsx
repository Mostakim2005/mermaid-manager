'use client'

import { useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFlowStore } from '@/lib/store'
import { ShapePickerPopover } from '@/components/ShapePickerPopover'
import { SettingsPopover } from '@/components/SettingsPopover'
import { ImportModal } from '@/components/ImportModal'
import { HelpPanel } from '@/components/HelpPanel'

interface TopToolbarProps {
  inspectorOpen: boolean
  onToggleInspector: () => void
  onOpenPalette?: () => void
  syntax: string
}

function NeuBtn({
  onClick,
  disabled,
  active,
  title,
  icon,
  label,
  style,
}: {
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
  icon: React.ReactNode
  label?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title || label}
      style={{
        background: active ? '#e2e8f0' : 'var(--neu-bg)',
        border: '1px solid rgba(203, 213, 225, 0.8)',
        borderRadius: 8,
        boxShadow: active ? 'var(--neu-shadow-inset)' : 'var(--neu-shadow-raised)',
        padding: label ? '0 10px' : '0 8px',
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#2563eb' : '#334155',
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'all 0.15s ease',
        flexShrink: 0,
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      {label && <span>{label}</span>}
    </button>
  )
}

function Divider() {
  return (
    <div style={{ width: 1, height: 20, background: 'rgba(203, 213, 225, 0.8)', margin: '0 4px', flexShrink: 0 }} />
  )
}

// Simple SVG icons
const IconLayers = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const IconPointer = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
  </svg>
)

const IconCube = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconSubgraph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />
  </svg>
)

const IconCopy = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const IconSettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export function TopToolbar({ inspectorOpen, onToggleInspector, onOpenPalette, syntax }: TopToolbarProps) {
  const [shapePickerOpen, setShapePickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const { setDrawingShape, addSubgraph, addNode } = useFlowStore(
    useShallow((s) => ({
      setDrawingShape: s.setDrawingShape,
      addSubgraph: s.addSubgraph,
      addNode: s.addNode,
    }))
  )

  const drawingShape = useFlowStore((s) => s.drawingShape)
  const shapePickerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(syntax)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handlePointer = () => {
    setDrawingShape(null)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', pointerEvents: 'auto' }}>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      
      {/* Main floating toolbar */}
      <div
        style={{
          background: 'var(--neu-bg)',
          borderRadius: 12,
          border: '1px solid rgba(203, 213, 225, 0.8)',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {/* Pointer / Select mode */}
        <NeuBtn
          onClick={handlePointer}
          active={!drawingShape}
          title="Select & Pan Mode (Escape)"
          icon={<IconPointer />}
          label="Select / Pan"
        />

        {/* Quick Node addition */}
        <NeuBtn
          onClick={() => addNode()}
          title="Quickly add a standard node to canvas"
          icon={<span style={{ fontWeight: 'bold' }}>+</span>}
          label="Node"
        />

        {/* Shape picker */}
        <div ref={shapePickerRef} style={{ position: 'relative' }}>
          <NeuBtn
            onClick={() => { setShapePickerOpen((v) => !v); setSettingsOpen(false) }}
            active={shapePickerOpen}
            title="Pick shape to draw on canvas"
            icon={<IconCube />}
            label="+ Add Shape"
          />
          {shapePickerOpen && <ShapePickerPopover onClose={() => setShapePickerOpen(false)} />}
        </div>

        {/* Add Subgraph */}
        <NeuBtn
          onClick={() => addSubgraph()}
          title="Add a container group/subgraph"
          icon={<IconSubgraph />}
          label="+ Subgraph"
        />

        <Divider />

        {/* Import Mermaid */}
        <NeuBtn
          onClick={() => setImportOpen(true)}
          title="Import raw Mermaid syntax"
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          }
          label="Import Code"
        />

        {/* Copy syntax */}
        <NeuBtn
          onClick={handleCopy}
          active={copied}
          title="Copy Mermaid syntax to clipboard"
          icon={<IconCopy />}
          label={copied ? 'Copied!' : 'Copy .mmd'}
        />

        {/* Sync to Draw.io Button */}
        <button
          onClick={() => {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'MERMAID_SYNC', syntax }, '*');
            } else {
              handleCopy();
            }
          }}
          title="Apply this diagram directly into Draw.io canvas"
          style={{
            background: '#2563eb',
            color: '#ffffff',
            border: '1px solid #1d4ed8',
            borderRadius: 8,
            padding: '0 12px',
            height: 32,
            fontWeight: 600,
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>✓ Sync to Draw.io</span>
        </button>

        <Divider />

        {/* Layers / Inspector toggle */}
        <NeuBtn
          onClick={onToggleInspector}
          active={inspectorOpen}
          title="Toggle Inspector & Code Preview panel"
          icon={<IconLayers />}
          label="Inspector"
        />

        {/* Command palette trigger */}
        {onOpenPalette && (
          <NeuBtn
            onClick={onOpenPalette}
            title="Command palette (⌘K)"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
          />
        )}

        {/* Settings */}
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <NeuBtn
            onClick={() => { setSettingsOpen((v) => !v); setShapePickerOpen(false) }}
            active={settingsOpen}
            title="Settings & Export options"
            icon={<IconSettings />}
          />
          {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
        </div>

        {/* Help / usage guide */}
        <NeuBtn
          onClick={() => setHelpOpen(true)}
          active={helpOpen}
          title="How to use this editor"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        />
      </div>

      {/* Draw mode hint */}
      {drawingShape && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2563eb',
            color: 'white',
            fontSize: 11,
            fontWeight: 500,
            padding: '5px 12px',
            borderRadius: 50,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
          }}
        >
          Drawing: {drawingShape} — drag on canvas to draw — Esc to cancel
        </div>
      )}
    </div>
  )
}
