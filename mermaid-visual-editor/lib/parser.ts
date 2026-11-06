import type { Edge, Node } from '@xyflow/react'
import type {
  ArrowType,
  CurveStyle,
  Direction,
  EdgeStyle,
  FlowEdgeData,
  FlowNodeData,
  Look,
  NodeShape,
  Theme,
} from './store'
import { applyDagreLayout } from './layout'

// ─── Public result type ───────────────────────────────────────────────────────

export interface ParseResult {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  direction: Direction
  theme: Theme
  look: Look
  curveStyle: CurveStyle
  error: string | null
}

// ─── Label cleaner ────────────────────────────────────────────────────────────

export function cleanLabel(raw: string): string {
  if (!raw) return ''
  let s = raw.trim()
  // Strip surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
    s = s.slice(1, -1).trim()
  }
  // Convert <br>, <br/>, <br /> (case-insensitive) to \n
  s = s.replace(/<br\s*\/?>/gi, '\n')
  // Decode HTML entities
  s = s.replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
  // Strip surrounding quotes again if inner string was quoted
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
    s = s.slice(1, -1).trim()
  }
  return s
}

// ─── Node shape detection ─────────────────────────────────────────────────────
// Parses a node suffix like [label], (label), {label}, etc.
// Supports both quoted ("label") and unquoted (label) forms.

function parseNodeSuffix(suffix: string): { shape: NodeShape; label: string } | null {
  let m: RegExpMatchArray | null

  // double-circle: ((("label"))) or (((label)))
  m = suffix.match(/^\({3}([\s\S]*)\){3}$/)
  if (m) return { shape: 'double-circle', label: cleanLabel(m[1]) }

  // stadium: (["label"]) or ([label])
  m = suffix.match(/^\(\[([\s\S]*)\]\)$/)
  if (m) return { shape: 'stadium', label: cleanLabel(m[1]) }

  // circle: (("label")) or ((label))
  m = suffix.match(/^\({2}([\s\S]*)\){2}$/)
  if (m) return { shape: 'circle', label: cleanLabel(m[1]) }

  // rounded: ("label") or (label)
  m = suffix.match(/^\(([\s\S]*)\)$/)
  if (m) return { shape: 'rounded', label: cleanLabel(m[1]) }

  // subroutine: [["label"]] or [[label]]
  m = suffix.match(/^\[\[([\s\S]*)\]\]$/)
  if (m) return { shape: 'subroutine', label: cleanLabel(m[1]) }

  // cylinder: [("label")] or [(label)]
  m = suffix.match(/^\[\(([\s\S]*)\)\]$/)
  if (m) return { shape: 'cylinder', label: cleanLabel(m[1]) }

  // hexagon: {{"label"}} or {{label}}
  m = suffix.match(/^\{\{([\s\S]*)\}\}$/)
  if (m) return { shape: 'hexagon', label: cleanLabel(m[1]) }

  // diamond: {"label"} or {label}
  m = suffix.match(/^\{([\s\S]*)\}$/)
  if (m) return { shape: 'diamond', label: cleanLabel(m[1]) }

  // parallelogram: [/"label"/] or [/label/]
  if (suffix.startsWith('[/"') || suffix.startsWith('[/')) {
    m = suffix.match(/^\[\/([\s\S]*)\/\]$/)
    if (m) return { shape: 'parallelogram', label: cleanLabel(m[1]) }
  }

  // trapezoid: [/"label"\] or [/label\]
  if (suffix.startsWith('[/') && suffix.endsWith('\\]')) {
    m = suffix.match(/^\[\/([\s\S]*)\\\]$/)
    if (m) return { shape: 'trapezoid', label: cleanLabel(m[1]) }
  }

  // parallelogram-alt: [\"label"\] or [\label\]
  if (suffix.startsWith('[\\') && suffix.endsWith('\\]')) {
    m = suffix.match(/^\[\\([\s\S]*)\\\]$/)
    if (m) return { shape: 'parallelogram-alt', label: cleanLabel(m[1]) }
  }

  // trapezoid-alt: [\"label"/] or [\label/]
  if (suffix.startsWith('[\\') && suffix.endsWith('/]')) {
    m = suffix.match(/^\[\\([\s\S]*)\/\]$/)
    if (m) return { shape: 'trapezoid-alt', label: cleanLabel(m[1]) }
  }

  // asymmetric: >"label"] or >label]
  m = suffix.match(/^>([\s\S]*)\]$/)
  if (m) return { shape: 'asymmetric', label: cleanLabel(m[1]) }

  // rectangle: ["label"] or [label]
  m = suffix.match(/^\[([\s\S]*)\]$/)
  if (m) return { shape: 'rectangle', label: cleanLabel(m[1]) }

  return null
}

// ─── Extract a node reference from the start of a string ─────────────────────

interface NodeRef {
  id: string
  label: string
  shape: NodeShape
  rest: string
}

function extractNodeRef(str: string): NodeRef | null {
  str = str.trim()

  // Match the node ID (starts with word char, allows hyphens)
  const idMatch = str.match(/^([a-zA-Z0-9_][\w-]*)/)
  if (!idMatch) return null

  const id = idMatch[1]
  const after = str.slice(id.length)

  // If there is a shape bracket, parse it
  const trimmedAfter = after.trimStart()
  if (trimmedAfter && ['[', '(', '{', '>'].includes(trimmedAfter[0])) {
    const shapeStr = extractBalancedShape(trimmedAfter)
    if (shapeStr) {
      const parsed = parseNodeSuffix(shapeStr)
      if (parsed) {
        const offset = after.length - trimmedAfter.length + shapeStr.length
        return {
          id,
          label: parsed.label,
          shape: parsed.shape,
          rest: after.slice(offset),
        }
      }
    }
  }

  // Bare ID
  return { id, label: id, shape: 'rectangle', rest: after }
}

// Extract a balanced bracket expression from the start of a string.
// Handles nested brackets like (([label])), {label}, etc.
// Ignores brackets inside quotes so ["Chat 2: (Arc)"] does not break the bracket stack.
function extractBalancedShape(str: string): string | null {
  if (!str) return null

  const open = str[0]
  let closeChar: string
  if (open === '[') closeChar = ']'
  else if (open === '(') closeChar = ')'
  else if (open === '{') closeChar = '}'
  else if (open === '>') closeChar = ']'
  else return null

  // For '>' asymmetric shape, find closing ']' accounting for quotes
  if (open === '>') {
    let quoteChar: string | null = null
    for (let i = 1; i < str.length; i++) {
      const ch = str[i]
      if ((ch === '"' || ch === "'") && str[i - 1] !== '\\') {
        if (quoteChar === null) quoteChar = ch
        else if (quoteChar === ch) quoteChar = null
        continue
      }
      if (quoteChar === null && ch === ']') {
        return str.slice(0, i + 1)
      }
    }
    return null
  }

  const brackets: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
  const stack: string[] = []
  let quoteChar: string | null = null

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    // Track quotes so brackets/parentheses inside quoted labels don't confuse bracket stack
    if ((ch === '"' || ch === "'") && (i === 0 || str[i - 1] !== '\\')) {
      if (quoteChar === null) {
        quoteChar = ch
      } else if (quoteChar === ch) {
        quoteChar = null
      }
      continue
    }

    if (quoteChar !== null) {
      continue
    }

    if (ch in brackets) {
      stack.push(brackets[ch])
    } else if (ch === closeChar || ch === ']' || ch === ')' || ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop()
        if (stack.length === 0) {
          return str.slice(0, i + 1)
        }
      } else {
        return null
      }
    }
  }
  return null
}

// ─── Edge connector matching ─────────────────────────────────────────────────

const CONNECTORS: { pattern: RegExp; edgeStyle: EdgeStyle; arrowType: ArrowType }[] = [
  // Dashed with arrows (longer patterns first)
  { pattern: /^<-\.->/, edgeStyle: 'dashed', arrowType: 'bidirectional' },
  { pattern: /^<\.->/, edgeStyle: 'dashed', arrowType: 'bidirectional' },
  { pattern: /^-\.->/, edgeStyle: 'dashed', arrowType: 'arrow' },
  { pattern: /^-\.-o/, edgeStyle: 'dashed', arrowType: 'circle' },
  { pattern: /^-\.-x/, edgeStyle: 'dashed', arrowType: 'cross' },
  { pattern: /^-\.-/, edgeStyle: 'dashed', arrowType: 'none' },
  // Thick
  { pattern: /^<===>/, edgeStyle: 'thick', arrowType: 'bidirectional' },
  { pattern: /^==>/, edgeStyle: 'thick', arrowType: 'arrow' },
  { pattern: /^===/, edgeStyle: 'thick', arrowType: 'none' },
  // Solid
  { pattern: /^<-->/, edgeStyle: 'solid', arrowType: 'bidirectional' },
  { pattern: /^-->/, edgeStyle: 'solid', arrowType: 'arrow' },
  { pattern: /^--o/, edgeStyle: 'solid', arrowType: 'circle' },
  { pattern: /^--x/, edgeStyle: 'solid', arrowType: 'cross' },
  { pattern: /^---/, edgeStyle: 'solid', arrowType: 'none' },
  // Single -> treated as -->
  { pattern: /^->/, edgeStyle: 'solid', arrowType: 'arrow' },
]

interface ConnectorMatch {
  edgeStyle: EdgeStyle
  arrowType: ArrowType
  label?: string
  rest: string
}

function matchConnector(str: string): ConnectorMatch | null {
  str = str.trim()

  // 1. Bidirectional solid with label: <-- "label" --> or <-- label -->
  const biSolidMatch = str.match(/^<--(?!>)\s*"?(.+?)"?\s*-->(.*)$/)
  if (biSolidMatch) {
    return {
      edgeStyle: 'solid',
      arrowType: 'bidirectional',
      label: cleanLabel(biSolidMatch[1]),
      rest: biSolidMatch[2],
    }
  }

  // 2. Bidirectional dashed with label: <-. "label" .->
  const biDashedMatch = str.match(/^<-\.(?!->)\s*"?(.+?)"?\s*\.->(.*)$/)
  if (biDashedMatch) {
    return {
      edgeStyle: 'dashed',
      arrowType: 'bidirectional',
      label: cleanLabel(biDashedMatch[1]),
      rest: biDashedMatch[2],
    }
  }

  // 3. Dashed with label: -. "label" .->
  const dashedLabelMatch = str.match(/^-\.(?!->)\s*"?(.+?)"?\s*\.->(.*)$/)
  if (dashedLabelMatch) {
    return {
      edgeStyle: 'dashed',
      arrowType: 'arrow',
      label: cleanLabel(dashedLabelMatch[1]),
      rest: dashedLabelMatch[2],
    }
  }

  // 4. Solid with label: -- "label" --> or -- label -->, etc.
  const dashLabelMatch = str.match(/^--(?![-=>ox])\s*"?(.+?)"?\s*(-->|---|--o|--x|<-->)(.*)$/)
  if (dashLabelMatch) {
    const [, label, conn, rest] = dashLabelMatch
    let arrowType: ArrowType = 'arrow'
    if (conn === '---') arrowType = 'none'
    else if (conn === '--o') arrowType = 'circle'
    else if (conn === '--x') arrowType = 'cross'
    else if (conn === '<-->') arrowType = 'bidirectional'
    return {
      edgeStyle: 'solid',
      arrowType,
      label: cleanLabel(label),
      rest,
    }
  }

  // 5. Thick with label: == "label" ==> or == label ===, == label <===>
  const thickLabelMatch = str.match(/^==(?![-=>])\s*"?(.+?)"?\s*(==>|===|<===>)(.*)$/)
  if (thickLabelMatch) {
    const [, label, conn, rest] = thickLabelMatch
    let arrowType: ArrowType = 'arrow'
    if (conn === '===') arrowType = 'none'
    else if (conn === '<===>') arrowType = 'bidirectional'
    return {
      edgeStyle: 'thick',
      arrowType,
      label: cleanLabel(label),
      rest,
    }
  }

  // 6. Connectors with optional |label| or |"label"| suffix
  for (const c of CONNECTORS) {
    const m = str.match(c.pattern)
    if (m) {
      const rest = str.slice(m[0].length).trimStart()
      const labelMatch = rest.match(/^\|([\s\S]*?)\|(.*)$/)
      if (labelMatch) {
        return {
          edgeStyle: c.edgeStyle,
          arrowType: c.arrowType,
          label: cleanLabel(labelMatch[1]),
          rest: labelMatch[2],
        }
      }
      return { edgeStyle: c.edgeStyle, arrowType: c.arrowType, rest }
    }
  }

  return null
}

// ─── JSON extractor (depth-counted, handles nested objects) ───────────────────

function extractJson(s: string, fromIndex: number): string {
  let depth = 0
  let i = fromIndex
  while (i < s.length) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return s.slice(fromIndex, i + 1)
    }
    i++
  }
  return ''
}

// ─── Default node factory ─────────────────────────────────────────────────────

function makeNode(id: string, label?: string, shape: NodeShape = 'rectangle'): Node<FlowNodeData> {
  return {
    id,
    type: 'flowNode',
    position: { x: 0, y: 0 },
    data: { label: label ?? id, shape },
  }
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseMermaidFlowchart(syntax: string): ParseResult {
  const empty: ParseResult = {
    nodes: [], edges: [],
    direction: 'TD', theme: 'default', look: 'classic', curveStyle: 'basis',
    error: null,
  }

  try {
    // Strip YAML frontmatter blocks (--- ... --- at the start of the string)
    let cleaned = syntax.replace(/^---[\r\n]+[\s\S]*?[\r\n]+---[\r\n]*/, '').trim()

    // If no flowchart/graph header present, but contains diagram arrows, auto-prepend flowchart TD
    if (!/^(?:flowchart|graph)\b/i.test(cleaned) && /(-->|---|==>|-\.->|<--|->)/.test(cleaned)) {
      cleaned = 'flowchart TD\n' + cleaned
    }

    const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean)

    let direction: Direction = 'TD'
    let theme: Theme = 'default'
    let look: Look = 'classic'
    let curveStyle: CurveStyle = 'basis'
    let foundHeader = false
    let currentSubgraphId: string | null = null
    let edgeIdx = 0

    const nodesMap = new Map<string, Node<FlowNodeData>>()
    const edges: Edge<FlowEdgeData>[] = []
    const pendingStyles = new Map<string, Partial<Pick<FlowNodeData, 'fillColor' | 'strokeColor' | 'textColor'>>>()
    const pendingLinkStyles = new Map<number, string>()

    // Helper to register a node from a NodeRef
    const registerNode = (ref: NodeRef) => {
      if (!nodesMap.has(ref.id)) {
        const node = makeNode(ref.id, ref.label, ref.shape)
        if (currentSubgraphId) {
          node.parentId = currentSubgraphId
          node.extent = 'parent'
        }
        nodesMap.set(ref.id, node)
      } else {
        const existing = nodesMap.get(ref.id)!
        if (existing.data.label === existing.id && ref.label !== ref.id) {
          existing.data.label = ref.label
          existing.data.shape = ref.shape
        }
      }
    }

    for (const line of lines) {
      // ── Comment lines (%%): skip unless init directive
      if (line.startsWith('%%')) {
        const initIdx = line.indexOf('init:')
        if (initIdx >= 0) {
          const jsonStart = line.indexOf('{', initIdx + 5)
          if (jsonStart >= 0) {
            const jsonStr = extractJson(line, jsonStart)
            if (jsonStr) {
              try {
                const cfg = JSON.parse(jsonStr) as Record<string, unknown>
                if (typeof cfg.theme === 'string') theme = cfg.theme as Theme
                if (typeof cfg.look === 'string') look = cfg.look as Look
                const fc = cfg.flowchart as Record<string, unknown> | undefined
                if (typeof fc?.curve === 'string') curveStyle = fc.curve as CurveStyle
              } catch { /* ignore */ }
            }
          }
        }
        continue
      }

      // ── Flowchart or Graph header
      // Accept both flowchart and graph headers with TD, TB (normalize TB to 'TD'), LR, BT, RL,
      // or default 'TD' if direction is omitted
      const headerMatch = line.match(/^(?:flowchart|graph)(?:\s+(TD|TB|LR|BT|RL))?\b/i)
      if (headerMatch) {
        const dir = (headerMatch[1] || 'TD').toUpperCase()
        direction = (dir === 'TB' ? 'TD' : dir) as Direction
        foundHeader = true
        continue
      }

      if (!foundHeader) continue

      // ── Subgraph block
      // Support subgraph ID["Title"] without space between ID and [, as well as subgraph "Title" and subgraph Title
      if (/^subgraph\b/i.test(line)) {
        // 1. subgraph ID["Title"] or subgraph ID [Title]
        const mWithBracket = line.match(/^subgraph\s+([\w-]+)\s*(?:\[([\s\S]*?)\])?\s*$/i)
        if (mWithBracket && mWithBracket[1]) {
          currentSubgraphId = mWithBracket[1]
          const label = mWithBracket[2] !== undefined ? cleanLabel(mWithBracket[2]) : currentSubgraphId
          nodesMap.set(currentSubgraphId, {
            ...makeNode(currentSubgraphId, label),
            data: { label, shape: 'rectangle', isSubgraph: true },
            zIndex: -1,
          })
          continue
        }

        // 2. subgraph "Title"
        const mQuoted = line.match(/^subgraph\s+"([^"]+)"\s*$/i)
        if (mQuoted) {
          const title = cleanLabel(mQuoted[1])
          currentSubgraphId = title.replace(/\s+/g, '_').replace(/[^\w-]/g, '') || `sg_${nodesMap.size}`
          nodesMap.set(currentSubgraphId, {
            ...makeNode(currentSubgraphId, title),
            data: { label: title, shape: 'rectangle', isSubgraph: true },
            zIndex: -1,
          })
          continue
        }

        // 3. Fallback: subgraph Title
        const mFallback = line.match(/^subgraph\s+(.+)$/i)
        if (mFallback) {
          const raw = mFallback[1].trim()
          const title = cleanLabel(raw)
          currentSubgraphId = title.replace(/\s+/g, '_').replace(/[^\w-]/g, '') || `sg_${nodesMap.size}`
          nodesMap.set(currentSubgraphId, {
            ...makeNode(currentSubgraphId, title),
            data: { label: title, shape: 'rectangle', isSubgraph: true },
            zIndex: -1,
          })
          continue
        }
      }

      if (/^end\b/i.test(line)) {
        currentSubgraphId = null
        continue
      }

      // Ignore direction inside subgraphs cleanly
      if (/^direction\s+(TD|TB|LR|BT|RL)/i.test(line)) {
        continue
      }

      // ── Mermaid v11 @ shape annotations (e.g. n1@{ shape: text } or n1@{ shape: text, label: "..." })
      const atMatch = line.match(/^([\w-]+)@\{\s*([^}]+)\}/)
      if (atMatch) {
        const nodeId = atMatch[1]
        const props = atMatch[2]
        let label: string | undefined
        const labelMatch = props.match(/label:\s*(?:"([^"]*)"|'([^']*)'|([^,}\n]+))/)
        if (labelMatch) {
          label = cleanLabel(labelMatch[1] ?? labelMatch[2] ?? labelMatch[3])
        }
        if (!nodesMap.has(nodeId)) {
          const node = makeNode(nodeId, label ?? nodeId, 'rectangle')
          if (currentSubgraphId) {
            node.parentId = currentSubgraphId
            node.extent = 'parent'
          }
          nodesMap.set(nodeId, node)
        } else if (label) {
          const existing = nodesMap.get(nodeId)!
          existing.data.label = label
        }
        continue
      }

      // ── Ignore classDef, class, click, and accessibility statements
      if (/^(?:classDef|class|click|accTitle|accDescr)\b/i.test(line)) {
        continue
      }

      // ── style line
      if (line.startsWith('style ')) {
        const m = line.match(/^style\s+([\w-]+)\s+(.+)$/)
        if (m) {
          const [, nodeId, stylePart] = m
          const s: Partial<Pick<FlowNodeData, 'fillColor' | 'strokeColor' | 'textColor'>> = {}
          for (const part of stylePart.split(',')) {
            const sep = part.indexOf(':')
            if (sep < 0) continue
            const k = part.slice(0, sep).trim()
            const v = part.slice(sep + 1).trim()
            if (k === 'fill') s.fillColor = v
            else if (k === 'stroke') s.strokeColor = v
            else if (k === 'color') s.textColor = v
          }
          pendingStyles.set(nodeId, s)
        }
        continue
      }

      // ── linkStyle line
      if (line.startsWith('linkStyle ')) {
        const m = line.match(/^linkStyle\s+(\d+)\s+stroke:([^\s,]+)/)
        if (m) pendingLinkStyles.set(parseInt(m[1], 10), m[2])
        continue
      }

      // ── Parse line as a chain of: NodeRef (connector NodeRef)*
      const firstNode = extractNodeRef(line)
      if (!firstNode) continue

      registerNode(firstNode)

      let remaining = firstNode.rest
      let prevNodeId = firstNode.id

      // Try to parse a chain of edges
      while (remaining.trim()) {
        const conn = matchConnector(remaining)
        if (!conn) break

        const targetRef = extractNodeRef(conn.rest)
        if (!targetRef) break

        registerNode(targetRef)

        edges.push({
          id: `edge_${edgeIdx++}`,
          source: prevNodeId,
          target: targetRef.id,
          type: 'flowEdge',
          label: conn.label,
          data: { edgeStyle: conn.edgeStyle, arrowType: conn.arrowType },
        })

        prevNodeId = targetRef.id
        remaining = targetRef.rest
      }
    }

    if (!foundHeader) {
      return { ...empty, error: 'No valid flowchart header found. Start with "flowchart TD" (or LR/BT/RL).' }
    }

    if (nodesMap.size === 0) {
      return { ...empty, error: 'No nodes found. Add at least one node.' }
    }

    // Apply pending node styles
    let nodes = [...nodesMap.values()].map((node) => {
      const style = pendingStyles.get(node.id)
      return style ? { ...node, data: { ...node.data, ...style } } : node
    })

    // Apply pending link styles
    edges.forEach((edge, i) => {
      const sc = pendingLinkStyles.get(i)
      if (sc) edge.data = { ...edge.data, strokeColor: sc } as FlowEdgeData
    })

    // Layout
    nodes = applyDagreLayout(nodes, edges, direction)

    return { nodes, edges, direction, theme, look, curveStyle, error: null }
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : 'Parse error' }
  }
}
