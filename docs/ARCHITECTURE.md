# Architecture Specification - MermaidApp Studio

## 1. High-Level System Architecture

MermaidApp Studio merges four visual diagramming engines and workspace tools into a unified offline desktop suite that matches Draw.io's native Light/Dark UI/UX:
1. **Host Environment**: **draw.io Desktop** (`jgraph/drawio-desktop` v32.6.1 + `jgraph/drawio`), powered by Electron, Node.js, and the `mxGraph` canvas, augmented with native toolbar buttons (`#mermaid-native-toolbar-group`) and collapsible side panel tabs (`#left-panel-collapse-btn`, `#right-panel-collapse-btn`).
2. **Visual Diagrams & Folders Workspace Hub (`#diagrams-hub-modal`)**: A Mermaid.ai-inspired folder and visual board management hub with `localStorage` persistence (`mermaidApp_workspace_v1`), folder hierarchy (`All Diagrams`, `⭐ Favorites`, `Personal`, `Novel Pipeline & Architecture`, `Radar & Infographics`, `+ New Folder`), live SVG card thumbnails, Grid (`⊞`) / List (`☰`) view switcher, and 1-click **Open on Canvas** or **Edit in Studio**.
3. **Universal Code-to-Diagram Auto-Detect Studio (`#universal-studio-modal`)**: A split-pane studio modal inside `plugins/mermaid-visual-editor.js` with a draggable vertical splitter (`#studio-split-resizer`), collapsible code editor pane (`« Collapse` / `» Code Editor`), contrast-corrected `resolveLightDarkCss()` SVG renderer, and real-time auto-detection across 22+ diagram syntaxes.
4. **2-Way Visual Drag & Drop Component (`mermaid-visual-editor`)**: Built with Next.js (exported as a static client-side bundle) using `@xyflow/react` (React Flow), `@dagrejs/dagre`, `zustand`, and `mermaid` core, synchronized via an iframe-to-host `postMessage` bridge (`LOAD_MERMAID`, `GET_MERMAID`, `MERMAID_SYNC`).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           draw.io Desktop Host                               │
│  (Electron + mxGraph + Native Toolbar Group + Side Panel « / » Collapsers)   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │        Native Draw.io Toolbar (#mermaid-native-toolbar-group)          │  │
│  │  [📁 Diagrams] [✨ Paste Code ➔ Auto-Render] [⚡ 2-Way Visual Editor]   │  │
│  │  [🕸️ Quick Templates]                                                  │  │
│  └──────┬─────────────────────────┬──────────────────────────┬────────────┘  │
│         │                         │                          │               │
│         ▼                         ▼                          ▼               │
│  ┌─────────────────────┐ ┌────────────────────────┐ ┌─────────────────────┐  │
│  │ 📁 Diagrams Hub     │ │ ✨ Universal Studio     │ │ ⚡ 2-Way Visual Ed.  │  │
│  │ - Folder Tree       │ │ - Draggable Splitter   │ │ - React Flow Canvas │  │
│  │ - Grid / List Views │ │ - « Collapse Code Pane │ │ - Labeled Shape Bar │  │
│  │ - Live SVG Previews │ │ - Contrast-Fixed SVG   │ │ - Subgraph & HTML   │  │
│  │ - + New Folder      │ │ - 22+ Syntax Engines   │ │   Parser + Sync     │  │
│  └──────┬──────────────┘ └────────┬───────────────┘ └────────┬────────────┘  │
│         │                         │                          │               │
│         └─────────────────────────┼──────────────────────────┘               │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               Draw.io Canvas (mxGraph Model & Exporter)                │  │
│  │  - Left «/» & Right »/« Collapsible Panels for Distraction-Free Focus  │  │
│  │  - Native Editable mxCells, Vector SVG, High-DPI PNG, and PDF Export   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Native UI/UX Integration & Collapsible Workspace Layout

1. **Native Toolbar Buttons (`injectNativeToolbarButtons`)**:
   * Appends a `.geSeparator` and `#mermaid-native-toolbar-group` directly into `ui.toolbar.container` (`.geToolbar`), replacing the legacy floating dark bar.
   * Dynamically adapts button colors, borders, and hover states to Draw.io's active theme (`isDarkMode()`).
2. **Left & Right Side Panel Collapse/Uncollapse Tabs (`setupSidePanelCollapsers`)**:
   * Mounts `#left-panel-collapse-btn` (`«` / `»`) along the inner edge of `ui.sidebarContainer` and `#right-panel-collapse-btn` (`»` / `«`) along the inner edge of `ui.formatContainer`.
   * Clicking toggles `ui.hsplitPosition` / `ui.toggleFormatPanel()`, invokes `ui.refresh()` and `graph.sizeDidChange()`, and repositions the collapse tab cleanly to `0px` when collapsed.
3. **Visual Diagrams & Folders Workspace Hub (`openDiagramsHub`)**:
   * Persists folders and diagram cards in `localStorage` under `mermaidApp_workspace_v1`, pre-seeded with 6 visual templates (including the user's `3-Chat Firewall & File Access` and `End-to-End Novel Pipeline` flowcharts).
   * Supports creating custom folders (`+ New Folder`), assigning diagrams to folders, starring favorites, toggling between Grid (`⊞`) and List (`☰`) views, saving the active Draw.io canvas (`💾 Save Canvas Diagram`), and opening any card on the canvas or in the Universal Studio.

---

## 3. Universal Code-to-Diagram Studio & Contrast-Safe SVG Pipeline

1. **Resizable & Collapsible Split-Pane Layout**:
   * Features a 10px draggable vertical splitter (`#studio-split-resizer`) between `#studio-code-pane` and `#studio-preview-pane` (supporting widths from `180px` up to `75%` of the modal width).
   * Includes an inline `« Collapse` button in the editor header and a floating `» Code Editor` restore tab in the preview pane for 100% fullscreen diagram inspection.
2. **Contrast-Safe Light/Dark SVG Resolution (`resolveLightDarkCss`)**:
   * Draw.io's `ui.getSvgForXml()` emits CSS `light-dark(lightVal, darkVal)` functions with `color-scheme: light dark`. When the OS is in dark mode while the diagram preview uses a light background (`#ffffff`) and light-yellow Mermaid subgraphs (`#ffffde`), browsers evaluate `light-dark(#000000, #ffffff)` to `#ffffff` (white text on white/yellow fill).
   * `resolveLightDarkCss(svgStr, previewTheme)` strips conflicting `color-scheme` declarations and resolves every `light-dark(a, b)` expression deterministically to `a` (in light preview mode) or `b` (in dark preview mode), guaranteeing high-contrast legibility.

---

## 4. Bidirectional Data Flow Lifecycle (2-Way Visual Editor)

1. **Enhanced Mermaid Flowchart Parser (`mermaid-visual-editor/lib/parser.ts`)**:
   * Supports `flowchart` and `graph` headers across `TD`, `TB`, `LR`, `BT`, and `RL` directions.
   * Normalizes `<br/>` / `<br>` tags to newlines, decodes `&amp;`, `&lt;`, `&gt;`, `&quot;` entities, parses `subgraph ID["Title"]` (with or without space before `[`), ignores parentheses inside quoted labels during `extractBalancedShape`, supports bidirectional labeled arrows (`<-- "label" -->`, `<-. label .->`), and converts Mermaid v11 `n1@{ shape: text }` blocks.
2. **Interactive React Flow Canvas (`components/Canvas.tsx` & `components/TopToolbar.tsx`)**:
   * Pre-loads a 5-node interactive starter flowchart whenever opened on an empty selection so the user immediately sees draggable nodes and edges.
   * Enables left-click canvas panning (`panOnDrag={!drawingShape}`), labeled top toolbar shape buttons (`+ Rect`, `+ Diamond`, `+ Circle`, `+ Stadium`, `⚡ Sync to Draw.io`), and bidirectional `GET_MERMAID` / `MERMAID_SYNC` message handling.
