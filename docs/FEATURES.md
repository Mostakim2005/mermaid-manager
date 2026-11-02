# Features & Code Anchors - MermaidApp Studio

This catalog provides exact file paths and line anchors for all features integrated into the MermaidApp suite.

---

## 1. Feature Catalog

### F-01: Persistent Top Floating Studio Bar
* **Description**: Unmistakable top-level pill toolbar (`#mermaid-studio-floating-bar`) pinned at the top of the Draw.io workspace with drag-repositioning and 1-click buttons for **✨ Paste Code ➔ Auto-Render**, **⚡ 2-Way Visual Editor**, and **🕸️ Quick Templates** (plus global shortcut `Ctrl+Shift+M`).
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1605-1741` (`createFloatingStudioBar`, keyboard shortcut listener)

### F-02: Universal "Paste Code ➔ Auto-Detect & Render" Studio Modal
* **Description**: Split-pane code-to-diagram studio (`#universal-studio-modal`) with real-time syntax auto-detection badge (`#universal-auto-detect-badge`), 10 one-click preset templates, direction/layout selectors (`TD`, `LR`, `BT`, `RL`, `Dagre` vs `ELK`), interactive zoom/pan SVG preview, background theme switcher, and 1-click insertion into Draw.io as editable shapes or crisp vector SVG.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:55-141` (`detectDiagramType`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:763-1600` (`renderCurrentCode`, `openUniversalStudio`, `insertSvgAsImageCell`)

### F-03: 1-Click Syntax Auto-Fixer & Markdown-to-Mindmap Converter
* **Description**: Automatically repairs broken Mermaid syntax (code fences, smart quotes, broken arrows, unquoted parentheses in labels, unclosed `subgraph` blocks) and converts plain Markdown headings/bullet lists into Mermaid `mindmap` syntax.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:146-237` (`autoFixSyntax`, `markdownToMindmap`)

### F-04: Custom Spider/Radar & Infographic SVG Engines
* **Description**: Dedicated vector SVG generators for multi-series quantitative Spider/Radar web charts (`renderRadarSvg`) and publication-grade dark-slate KPI & process funnel infographics (`renderInfographicSvg`), plus sidebar stencil palettes (`radarSpider`, `mindmapsCustom`, `infographicsSuite`).
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:242-502` (`renderRadarSvg`, `renderInfographicSvg`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1774-1829` (`sb.addPaletteFunctions`)

### F-05: Two-Way Visual Drag & Drop Mermaid Editor
* **Description**: Interactive React Flow canvas where flowchart nodes can be dragged, added, or reshaped with live bidirectional updates against Mermaid code and 1-click sync back to the Draw.io canvas.
* **Anchors**:
  * `mermaid-visual-editor/components/Canvas.tsx:1-290`
  * `mermaid-visual-editor/components/TopToolbar.tsx:1-265`
  * `mermaid-visual-editor/app/page.tsx:1-130`
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:561-741` (`openVisualMermaidEditor`, `applyMermaidToCanvas`)

### F-06: Native Export to Vector SVG, PNG, and PDF
* **Description**: Exports diagrams directly from the Universal Studio (`💾 Export SVG`, `📷 Export PNG`) or from the main Draw.io canvas (`File > Export as > SVG / PNG / PDF`).
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1505-1561`
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/EditorUi.js` (`exportSvg`, `exportFile`, `createPdf`)

### F-07: Portable Desktop Executable
* **Description**: Standalone portable single `.exe` executable (`MermaidApp-draw.io-v32.6.1-Portable.exe`) and unpacked desktop binary (`releases/win-unpacked/MermaidApp-draw.io.exe`) running offline on Windows 10/11 x64.
* **Anchors**:
  * `releases/MermaidApp-draw.io-v32.6.1-Portable.exe`
  * `drawio-desktop/electron-builder-win.json:1-69`
