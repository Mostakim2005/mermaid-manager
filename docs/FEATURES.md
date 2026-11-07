# Features & Code Anchors - MermaidApp Studio

This catalog provides exact file paths and line anchors for all features integrated into the MermaidApp suite.

---

## 1. Feature Catalog

### F-01: Native Draw.io Toolbar Integration (`📁 Diagrams`, `✨ Paste Code ➔ Auto-Render`, `⚡ 2-Way Visual Editor`, `🕸️ Quick Templates`)
* **Description**: Dedicated native toolbar button group (`#mermaid-native-toolbar-group`) injected directly into Draw.io's `.geToolbar` with native light/dark theme styling (`mermaid-tb-btn`), replacing the legacy floating dark pill bar.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:465-605` (`injectThemeStyles`, `isDarkMode`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:3030-3100` (`injectNativeToolbarButtons`)

### F-02: Left & Right Side Panel `«` / `»` Collapse/Uncollapse Buttons
* **Description**: Edge-mounted collapse/expand tabs (`#left-panel-collapse-btn` and `#right-panel-collapse-btn`) on the left shape library sidebar (`ui.sidebarContainer`) and right format inspector panel (`ui.formatContainer`) for 1-click distraction-free diagram viewing.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:3105-3220` (`setupSidePanelCollapsers`)

### F-03: Visual Diagrams & Folders Workspace Hub (`📁 Diagrams`)
* **Description**: Mermaid.ai-style visual workspace modal (`#diagrams-hub-modal`, shortcut `Ctrl+Shift+D`) featuring a folder tree (`Dashboard / All Diagrams`, `⭐ Favorites`, custom folders, `+ New Folder`), search bar, **Grid (`⊞`) / List (`☰`) view toggle**, **`💾 Save Canvas Diagram`**, and visual board cards with live SVG previews, folder assignment dropdowns, and 1-click **Open on Canvas** or **Edit in Studio**.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:610-955` (`getWorkspaceData`, `saveWorkspaceData`, `DEFAULT_FOLDERS`, `DEFAULT_DIAGRAMS`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1165-1715` (`openDiagramsHub`, `renderHubFolderSidebar`, `renderHubCards`)

### F-04: Resizable, Collapsible & Contrast-Fixed Universal Code-to-Diagram Studio
* **Description**: Split-pane code-to-diagram studio (`#universal-studio-modal`, shortcut `Ctrl+Shift+M`) with a draggable vertical splitter (`#studio-split-resizer`), inline `« Collapse` / `» Code Editor` buttons, `resolveLightDarkCss()` contrast-safe SVG rendering, 22+ syntax auto-detection (`detectDiagramType`), and `💾 Save to Diagrams Folder`.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:65-153` (`detectDiagramType`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1720-1755` (`resolveLightDarkCss`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1756-3025` (`renderCurrentCode`, `openUniversalStudio`, `#studio-split-resizer`, `toggleStudioCodeEditor`)

### F-05: 1-Click Syntax Auto-Fixer & Markdown-to-Mindmap Converter
* **Description**: Automatically repairs broken Mermaid syntax (code fences, smart quotes, broken arrows, unquoted parentheses in labels, unclosed `subgraph` blocks) and converts plain Markdown headings/bullet lists into Mermaid `mindmap` syntax.
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:158-249` (`autoFixSyntax`, `markdownToMindmap`)

### F-06: Deduplicated Custom Spider/Radar & Infographic SVG Engines
* **Description**: Vector SVG generators for multi-series quantitative Spider/Radar web charts (`renderRadarSvg`) and KPI/process funnel infographics (`renderInfographicSvg`), plus guarded single-registration sidebar stencil palettes (`ui.sidebar._customMermaidPalettesAdded`).
* **Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:254-462` (`renderRadarSvg`, `renderInfographicSvg`)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:3308-3366` (`sb.addPaletteFunctions` with `_customMermaidPalettesAdded` guard)

### F-07: Enhanced 2-Way Visual Drag & Drop Mermaid Editor
* **Description**: Interactive React Flow visual editor supporting complex flowcharts (`subgraph ID["Title"]`, `<br>`, `&amp;`, quoted parentheses, `<-- "label" -->`, `n1@{ shape: text }`), pre-loaded starter diagram on open, left-click canvas drag/pan, labeled shape creation toolbar (`+ Rect`, `+ Diamond`, `+ Circle`, `+ Stadium`), and 1-click sync back to Draw.io.
* **Anchors**:
  * `mermaid-visual-editor/lib/parser.ts:1-600` (`parseMermaidFlowchart`, `extractBalancedShape`)
  * `mermaid-visual-editor/components/Canvas.tsx:1-310`
  * `mermaid-visual-editor/components/TopToolbar.tsx:1-290`
  * `mermaid-visual-editor/app/page.tsx:1-165`

### F-08: Self-Contained Cloud CI/CD Release Pipeline & GPLv3 Harmonization
* **Description**: Automated GitHub Actions CI workflow that computes patch auto-incremented versions from Git tags, stamps package manifests, builds both portable `.exe` and NSIS installer `.exe` on Windows runners, and publishes GitHub releases. Project is licensed under GNU GPLv3 to ensure full legal copyleft compatibility with draw.io Desktop.
* **Anchors**:
  * `.github/workflows/build.yml:1-146` (`build-portable`, version auto-bump, `softprops/action-gh-release@v2`)
  * `drawio-desktop/electron-builder-win.json:1-88` (portable + NSIS targets, GitHub publisher)
  * `LICENSE:1-674` (GNU General Public License v3.0)
  * `THIRD_PARTY_NOTICES.md:1-60` (attribution & license harmonization)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:960-1160` (`openVisualMermaidEditor`, `applyMermaidToCanvas`)

### F-08: Native Export to Vector SVG, PNG, and PDF & Portable Desktop Executable
* **Description**: Exports diagrams directly from the Universal Studio (`Export SVG`, `Export PNG`) or Draw.io (`File > Export as > SVG / PNG / PDF`), packaged into `releases/MermaidApp-draw.io-v32.6.1-Portable.exe`.
* **Anchors**:
  * `releases/MermaidApp-draw.io-v32.6.1-Portable.exe`
  * `drawio-desktop/electron-builder-win.json:1-69`
