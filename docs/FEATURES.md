# Features & Code Anchors - MermaidApp Studio

This catalog provides exact file paths and anchors for all features integrated into the MermaidApp suite.

---

## 1. Feature Catalog

### F-01: Two-Way Visual Drag & Drop Mermaid Editor
* **Description**: Interactive canvas where nodes can be moved, added, or reshaped with live bidirectional updates against Mermaid code.
* **Component Files**:
  * `mermaid-visual-editor/components/Canvas.tsx`: React Flow canvas wrapper, node and edge drag listeners.
  * `mermaid-visual-editor/components/TopToolbar.tsx`: Synchronize button and palette triggers.
  * `mermaid-visual-editor/app/page.tsx`: Bidirectional postMessage listener bridging with draw.io.
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js`: Draw.io host plugin.

### F-02: Native Export to Vector SVG, PNG, and PDF
* **Description**: Draw.io vector engine exports any diagram—including imported/synced Mermaid diagrams—into high-resolution SVG (with embedded XML), transparent PNG, and PDF.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/EditorUi.js` (Export actions: `exportSvg`, `exportFile`, `createPdf`)

### F-03: Radar & Spider Diagram Suite
* **Description**: Stencil palette with 5-axis, 6-axis, and 8-axis spider web charts and semi-transparent data metric polygons.
* **Anchor**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` (`sb.addPaletteFunctions('radarSpider', ...)`)

### F-04: Mind Maps & Concept Mapping
* **Description**: Central idea nodes, curved organic connector edges, subtopic pills, and concept clouds.
* **Anchor**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` (`sb.addPaletteFunctions('mindmapsCustom', ...)`)

### F-05: Infographic Flow & KPI Metric Cards
* **Description**: Dark-mode KPI statistics cards with delta indicators, 4-stage chevron process funnels, and feature comparison boards.
* **Anchor**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` (`sb.addPaletteFunctions('infographicsSuite', ...)`)

### F-06: Portable Desktop Executable
* **Description**: Standalone portable single `.exe` executable running on any Windows 10/11 x64 machine without installation or administrative privileges.
* **Anchor**:
  * `releases/MermaidApp-draw.io-v32.6.1-Portable.exe`
  * Packaging config: `drawio-desktop/electron-builder-win.json`
