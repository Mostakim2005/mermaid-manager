/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert'
import test from 'node:test'
import { serialize } from './serializer.ts'
import type { NodeShape } from './store.ts'

test('serialize shapes', () => {
  const shapes: NodeShape[] = [
    'rounded',
    'stadium',
    'subroutine',
    'cylinder',
    'circle',
    'double-circle',
    'diamond',
    'hexagon',
    'parallelogram',
    'parallelogram-alt',
    'trapezoid',
    'trapezoid-alt',
    'asymmetric',
    'rectangle'
  ]

  const nodes = shapes.map((shape, i) => ({
    id: `n${i}`,
    data: { label: `Label ${shape}`, shape },
    position: { x: 0, y: 0 }
  }))

  const output = serialize(nodes as any, [])

  assert.ok(output.includes('n0("Label rounded")'), 'rounded failed')
  assert.ok(output.includes('n1(["Label stadium"])'), 'stadium failed')
  assert.ok(output.includes('n2[["Label subroutine"]]'), 'subroutine failed')
  assert.ok(output.includes('n3[("Label cylinder")]'), 'cylinder failed')
  assert.ok(output.includes('n4(("Label circle"))'), 'circle failed')
  assert.ok(output.includes('n5((("Label double-circle")))'), 'double-circle failed')
  assert.ok(output.includes('n6{"Label diamond"}'), 'diamond failed')
  assert.ok(output.includes('n7{{"Label hexagon"}}'), 'hexagon failed')
  assert.ok(output.includes('n8[/"Label parallelogram"/]'), 'parallelogram failed')
  assert.ok(output.includes('n9[\\"Label parallelogram-alt"\\ ]'.replace('\\ ', '\\')), 'parallelogram-alt failed')
  assert.ok(output.includes('n10[/"Label trapezoid"\\ ]'.replace('\\ ', '\\')), 'trapezoid failed')
  assert.ok(output.includes('n11[\\"Label trapezoid-alt"/]'), 'trapezoid-alt failed')
  assert.ok(output.includes('n12>"Label asymmetric"]'), 'asymmetric failed')
  assert.ok(output.includes('n13["Label rectangle"]'), 'rectangle failed')
})

test('serialize default shape', () => {
  const nodes = [
    {
      id: 'n_default',
      data: { label: 'Default' },
      position: { x: 0, y: 0 }
    }
  ]
  const output = serialize(nodes as any, [])
  assert.ok(output.includes('n_default["Default"]'))
})

test('serialize nested subgraphs recursively', () => {
  const nodes = [
    {
      id: 'sg_outer',
      data: { label: 'Outer Group', isSubgraph: true },
      position: { x: 0, y: 0 },
    },
    {
      id: 'sg_inner',
      parentId: 'sg_outer',
      data: { label: 'Inner Group', isSubgraph: true },
      position: { x: 20, y: 20 },
    },
    {
      id: 'n_leaf',
      parentId: 'sg_inner',
      data: { label: 'Leaf Node', shape: 'rectangle' },
      position: { x: 40, y: 40 },
    },
  ]

  const output = serialize(nodes as any, [])
  const lines = output.split('\n')
  const outerStart = lines.findIndex((l) => l.includes('subgraph sg_outer ["Outer Group"]'))
  const innerStart = lines.findIndex((l) => l.includes('subgraph sg_inner ["Inner Group"]'))
  const leafLine = lines.findIndex((l) => l.includes('n_leaf["Leaf Node"]'))
  const firstEnd = lines.findIndex((l, idx) => idx > leafLine && l.trim() === 'end')
  const secondEnd = lines.findIndex((l, idx) => idx > firstEnd && l.trim() === 'end')

  assert.ok(outerStart >= 0, 'outer subgraph missing')
  assert.ok(innerStart > outerStart, 'inner subgraph should appear inside outer subgraph')
  assert.ok(leafLine > innerStart, 'leaf node should appear inside inner subgraph')
  assert.ok(firstEnd > leafLine, 'inner end missing')
  assert.ok(secondEnd > firstEnd, 'outer end missing')
})
