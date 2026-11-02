# Architecture Specification - MermaidApp Studio

## 1. High-Level System Architecture

MermaidApp Studio merges three visual diagramming engines into a unified offline desktop suite:
1. **Host Environment**: **draw.io Desktop** (`jgraph/drawio-desktop` v32.6.1 + `jgraph/drawio`), powered by Electron, Node.js, and the `mxGraph` canvas.
2. **Universal Code-to-Diagram Auto-Detect Studio**: A full-screen split-pane studio modal (`#universal-studio-modal`) and persistent top floating pill launcher (`#mermaid-studio-floating-bar`) inside `plugins/mermaid-visual-editor.js` that auto-detects 22+ diagram syntaxes as you type or paste, repairs broken LLM/Mermaid syntax, and renders live interactive SVG previews.
3. **2-Way Visual Drag & Drop Component**: **`mermaid-visual-editor`**, built with Next.js (exported as a static client-side bundle) using `@xyflow/react` (React Flow), `@dagrejs/dagre`, `zustand`, and `mermaid` core, synchronized via an iframe-to-host `postMessage` bridge.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           draw.io Desktop Host                               │
│  (Electron 44.9.3 + mxGraph + Local Node Backend + Multi-Engine Plugin)      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │        Persistent Top Floating Studio Bar (#mermaid-studio-floating-bar)│  │
│  │  [✨ Paste Code ➔ Auto-Render] [⚡ 2-Way Visual Editor] [🕸️ Templates]  │  │
│  └──────────────────┬───────────────────────────────────┬─────────────────┘  │
│                     │                                   │                    │
│                     ▼                                   ▼                    │
│  ┌─────────────────────────────────────┐ ┌────────────────────────────────┐  │
│  │ Universal Code-to-Diagram Studio    │ │ 2-Way Visual Editor (mxWindow) │  │
│  │ - Auto-Detect Engine (22+ formats)  │ │ - Iframe: mermaid-visual-editor│  │
│  │ - 1-Click Syntax Auto-Fixer         │ │ - React Flow Drag & Drop       │  │
│  │ - Radar/Spider & Infographic Engines│ │ - Bidirectional AST Sync       │  │
│  │ - Live Zoom/Pan SVG Preview         │ └──────────────┬─────────────────┘  │
│  └──────────────────┬──────────────────┘                │                    │
│                     │ (Editable Shapes or Crisp SVG)    │ (MERMAID_SYNC)     │
│                     ▼                                   ▼                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               Draw.io Canvas (mxGraph Model & Exporter)                │  │
│  │  - Native Editable mxCells & Stencil Palettes                          │  │
│  │  - Vector SVG, High-DPI PNG, and PDF Export                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Universal Code-to-Diagram Auto-Detection & Rendering Pipeline

1. **Instant Syntax Auto-Detection (`detectDiagramType`)**:
   * Inspects pasted or typed input on a 250ms debounce and classifies it into one of 22+ diagram types:
     * **Mermaid Native (19 types)**: `flowchart` / `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram-v2`, `erDiagram`, `gantt`, `pie`, `mindmap`, `timeline`, `gitGraph`, `journey`, `quadrantChart`, `xychart-beta`, `block-beta`, `packet-beta`, `kanban`, `sankey-beta`, `architecture-beta`, `C4Context`.
     * **Spider / Radar DSL**: `radar` / `spider` / `radar-beta` multi-axis quantitative series.
     * **Infographic KPI & Funnel DSL**: `infographic` cards with KPI metric grids and process steps.
     * **Markdown / Bullet Outlines**: `# Heading` or `- Bullet` hierarchies automatically converted on the fly into `mindmap` syntax via `markdownToMindmap()`.
     * **PlantUML**: `@startuml ... @enduml` blocks parsed offline via `mxPlantUmlToDrawio`.

2. **1-Click Syntax Auto-Fixer (`autoFixSyntax`)**:
   * Strips markdown code fences (```` ```mermaid ````), replaces smart quotes (`""''`) with straight ASCII quotes, repairs malformed arrows (`->` to `-->` in flowcharts), auto-quotes node labels containing unquoted parentheses `[Label (Info)]` ➔ `["Label (Info)"]`, and appends missing `end` statements for unclosed `subgraph` blocks.

3. **Multi-Engine Live Preview & Canvas Insertion**:
   * Renders live vector SVG into an interactive pan-and-zoom viewport (`#universal-preview-container`).
   * **⚡ Insert as Editable Shapes**: Converts the diagram into native Draw.io `mxCell` vertices and edges (`ui.parseMermaidDiagram` + `mxMermaidToDrawio.wrapGroup` or `ui.parsePlantUmlDiagram`).
   * **🖼️ Insert as Crisp Vector SVG**: Embeds a high-DPI scalable `shape=image;image=data:image/svg+xml...` cell on the Draw.io canvas (`insertSvgAsImageCell`), ideal for Radar/Spider charts and Infographic cards.

---

## 3. Bidirectional Data Flow Lifecycle (2-Way Visual Editor)

1. **Extraction (Draw.io ➔ Visual Editor)**:
   * Selecting a diagram cell and clicking **⚡ 2-Way Visual Editor** reads `cell.value` or `mermaidData` and dispatches:
     ```javascript
     editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: code }, '*');
     ```
   * Inside `mermaid-visual-editor`, `app/page.tsx` parses the syntax via `parseMermaidFlowchart(syntax)` and populates React Flow's reactive store (`useFlowStore`).

2. **Manipulation (Visual Drag-and-Drop)**:
   * Nodes and edges can be dragged, added, or connected on the React Flow canvas while `serialize(nodes, edges, config)` recomputes valid `.mmd` syntax.

3. **Injection & Render (Visual Editor ➔ Draw.io)**:
   * Clicking **Sync to Draw.io** dispatches `window.parent.postMessage({ type: 'MERMAID_SYNC', syntax }, '*')`, updating the active Draw.io cell in place.
