# Architecture Specification - MermaidApp Studio

## 1. High-Level System Architecture

MermaidApp Studio merges two visualization ecosystems:
1. **Host Environment**: **draw.io Desktop** (`jgraph/drawio-desktop` + `jgraph/drawio`), powered by Electron, Node.js, and the `mxGraph` canvas.
2. **Visual Editor Component**: **`mermaid-visual-editor`**, built with Next.js (exported as static client-side bundle) using `@xyflow/react` (React Flow), `@dagrejs/dagre`, `zustand`, and `mermaid` core.
3. **Two-Way Synchronization Bridge**: An iframe-to-host `postMessage` protocol coupled with a custom draw.io plugin (`mermaid-visual-editor.js`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        draw.io Desktop Host                            │
│  (Electron 44.9.3 + mxGraph + Local Node Backend + Plugins)            │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   Draw.io Canvas      │             │  Visual Mermaid Plugin     │  │
│  │   - Native mxCells    │◄────────────┤  (mermaid-visual-editor.js)│  │
│  │   - SVG/PNG/PDF Export│             │  - Menu / Toolbar Actions  │  │
│  │   - Cloud Stencils    │             │  - Custom Sidebar Palettes │  │
│  └───────────▲───────────┘             └─────────────┬──────────────┘  │
│              │                                       │                 │
│              │ (Cell Extraction / Injection)         │ (Hosts mxWindow)│
│              ▼                                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │             Two-Way Visual Editor Modal (mxWindow)               │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │   Iframe: mermaid-visual-editor/index.html                 │  │  │
│  │  │   - React Flow Drag-and-Drop Canvas                        │  │  │
│  │  │   - Bidirectional AST Synchronizer (serializer / parser)   │  │  │
│  │  │   - Top Toolbar + "Sync to Draw.io" Button                 │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Bidirectional Data Flow Lifecycle

1. **Extraction (Draw.io ➔ Visual Editor)**:
   * When the user clicks **⚡ Mermaid Visual** or selects a cell and chooses **Edit in Visual Mermaid Drag & Drop**, the plugin reads `cell.value` or `mermaidData`.
   * The host dispatches:
     ```javascript
     editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: code }, '*');
     ```
   * Inside `mermaid-visual-editor`, `app/page.tsx` parses the syntax via `parseMermaidFlowchart(syntax)` and populates React Flow's reactive store (`useFlowStore`).

2. **Manipulation (Visual Drag-and-Drop)**:
   * Nodes and edges can be moved, added, or connected on the React Flow canvas.
   * `serialize(nodes, edges, config)` constantly recomputes valid `.mmd` syntax.

3. **Injection & Render (Visual Editor ➔ Draw.io)**:
   * Clicking **Sync to Draw.io** dispatches:
     ```javascript
     window.parent.postMessage({ type: 'MERMAID_SYNC', syntax }, '*');
     ```
   * The host receives the payload, invokes `ui.parseMermaidDiagram(syntax, ...)`, and either replaces the active cell's children (`ui.replaceLockedGroupChildren`) or inserts a new grouped container.

---

## 3. Complementary Engines & Resources

* **Spider / Radar Diagrams**: Injected directly into the sidebar via `sb.addPaletteFunctions('radarSpider', ...)` with 5-axis, 6-axis, and 8-axis geometric grid and data polygon stencils.
* **Mind Maps**: Embedded via `sb.addPaletteFunctions('mindmapsCustom', ...)` with central concept nodes, organic branch curves, and subtopic pills.
* **Infographics & Flows**: Custom KPI metric cards, multi-stage chevron flow steps, and comparison cards.
* **Local Syntax Fixers**: `resources/mermaid-fixer` and `resources/markmap` provide offline CLI and script assets for batch linting and AST repairs.
