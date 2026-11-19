import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { Direction, FlowNodeData } from './store'

const NODE_WIDTH = 150
const NODE_HEIGHT = 60
const SUBGRAPH_PADDING = 40
const MIN_SUBGRAPH_WIDTH = 240
const MIN_SUBGRAPH_HEIGHT = 160

const RANKDIR: Record<Direction, string> = {
  TD: 'TB',
  LR: 'LR',
  BT: 'BT',
  RL: 'RL',
}

export function applyDagreLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  direction: Direction = 'TD'
): Node<FlowNodeData>[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: RANKDIR[direction], nodesep: 60, ranksep: 80 })

  // Track which subgraphs have children so empty ones retain visible dimensions
  const subgraphsWithChildren = new Set<string>()
  for (const node of nodes) {
    if (node.parentId) subgraphsWithChildren.add(node.parentId)
  }

  // Add all nodes
  for (const node of nodes) {
    if (node.data?.isSubgraph) {
      const hasChildren = subgraphsWithChildren.has(node.id)
      g.setNode(node.id, {
        width: hasChildren ? 0 : MIN_SUBGRAPH_WIDTH,
        height: hasChildren ? 0 : MIN_SUBGRAPH_HEIGHT,
        paddingX: SUBGRAPH_PADDING,
        paddingY: SUBGRAPH_PADDING,
      })
    } else {
      const w = typeof node.style?.width === 'number' ? node.style.width : NODE_WIDTH
      const h = typeof node.style?.height === 'number' ? node.style.height : NODE_HEIGHT
      g.setNode(node.id, { width: w, height: h })
    }
  }

  // Set parent relationships for compound layout
  for (const node of nodes) {
    if (node.parentId) {
      g.setParent(node.id, node.parentId)
    }
  }

  // Add ALL edges — dagre handles cross-boundary edges in compound mode
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const layout = g.node(node.id)
    if (!layout || !Number.isFinite(layout.x) || !Number.isFinite(layout.y)) return node

    if (node.data?.isSubgraph) {
      const sw = Number.isFinite(layout.width) && layout.width > 0 ? Math.max(layout.width, MIN_SUBGRAPH_WIDTH) : MIN_SUBGRAPH_WIDTH
      const sh = Number.isFinite(layout.height) && layout.height > 0 ? Math.max(layout.height, MIN_SUBGRAPH_HEIGHT) : MIN_SUBGRAPH_HEIGHT
      return {
        ...node,
        position: {
          x: layout.x - sw / 2,
          y: layout.y - sh / 2,
        },
        style: {
          ...node.style,
          width: sw,
          height: sh,
        },
      }
    }

    if (node.parentId) {
      // Convert dagre absolute coords to parent-relative for React Flow
      const parentLayout = g.node(node.parentId)
      if (!parentLayout || !Number.isFinite(parentLayout.x) || !Number.isFinite(parentLayout.y)) return node
      const w = typeof node.style?.width === 'number' ? node.style.width : NODE_WIDTH
      const h = typeof node.style?.height === 'number' ? node.style.height : NODE_HEIGHT
      const pw = Number.isFinite(parentLayout.width) && parentLayout.width > 0 ? Math.max(parentLayout.width, MIN_SUBGRAPH_WIDTH) : MIN_SUBGRAPH_WIDTH
      const ph = Number.isFinite(parentLayout.height) && parentLayout.height > 0 ? Math.max(parentLayout.height, MIN_SUBGRAPH_HEIGHT) : MIN_SUBGRAPH_HEIGHT
      const parentTopLeftX = parentLayout.x - pw / 2
      const parentTopLeftY = parentLayout.y - ph / 2
      return {
        ...node,
        position: {
          x: layout.x - w / 2 - parentTopLeftX,
          y: layout.y - h / 2 - parentTopLeftY,
        },
      }
    }

    // Top-level non-subgraph node
    const w = typeof node.style?.width === 'number' ? node.style.width : NODE_WIDTH
    const h = typeof node.style?.height === 'number' ? node.style.height : NODE_HEIGHT
    return {
      ...node,
      position: {
        x: layout.x - w / 2,
        y: layout.y - h / 2,
      },
    }
  })
}
