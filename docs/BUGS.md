# Defect Log & RCA - MermaidApp Studio

### BUG-001: Next.js / TypeScript Incompatible Event Type in React Flow
* **Symptom**: `npm run build` in `mermaid-visual-editor` failed with:
  `Type error: Type '(_event: MouseEvent, draggedNode: Node<FlowNodeData>) => void' is not assignable to type 'OnNodeDrag<Node<FlowNodeData>>'`.
* **Root Cause**: React Flow's `onNodeDragStop` event handler definition expects React's synthetic mouse/touch event, whereas the file imported the native DOM `MouseEvent` from `'react'` under React 19 types.
* **Resolution Strategy**: Relaxed parameter typing to `(_event: unknown, draggedNode: Node<FlowNodeData>)` in `components/Canvas.tsx`.
* **Code Anchor**: `mermaid-visual-editor/components/Canvas.tsx:174`.

---

### BUG-002: Azure Trusted Signing Failure in Personal Builds
* **Symptom**: `electron-builder` failed during packaging when invoking `build/sign-trusted.mjs` due to missing Azure credentials/dlib.
* **Root Cause**: Official `drawio-desktop` builds enforce Azure Artifact Signing by default unless opted out via `DRAWIO_UNSIGNED=true`.
* **Resolution Strategy**: Updated `build/sign-trusted.mjs` to unconditionally return for personal fork packaging, allowing seamless offline creation of portable binaries without cloud signing dependencies.
* **Code Anchor**: `drawio-desktop/build/sign-trusted.mjs:1-15`.

---

### BUG-003: Submodule Initialization Requirement
* **Symptom**: Cloned `drawio-desktop` directory was missing `drawio/src/main/webapp/index.html`.
* **Root Cause**: The core webapp lives in the `jgraph/drawio` submodule.
* **Resolution Strategy**: Executed `git submodule update --init --depth 1` to shallow-clone the full web assets directly into `drawio-desktop/drawio`.

---

### BUG-004: Custom Plugin Not Displaying in Packaged Electron Release due to Async Bootstrap & `App.initPluginCallback()` Reset
* **Symptom**: Opening the initial packaged `.exe` showed the standard Draw.io interface without the custom Mermaid Visual Editor buttons or a prominent place to paste and auto-render diagram code.
* **Root Cause**:
  1. `index.html` loaded `<script src="plugins/mermaid-visual-editor.js"></script>` synchronously while `js/bootstrap.js` loaded `js/PreConfig.js` and `js/app.min.js` asynchronously. At the time `mermaid-visual-editor.js` executed, `window.Draw` was still `undefined`, causing the script to exit early.
  2. Even when queued early, `ElectronApp.js` (line 236) invoked `App.initPluginCallback()`, resetting `App.DrawPlugins = []`.
* **Resolution Strategy**:
  1. Injected `mxscript('./plugins/mermaid-visual-editor.js')` directly inside `ElectronApp.js` immediately after `App.initPluginCallback()` (line 237) and in `PostConfig.js`, and exposed `window.__activeDrawioUi = this` inside `EditorUi.prototype.init` (`ElectronApp.js` line 456).
  2. Added idempotent lifecycle registration inside `plugins/mermaid-visual-editor.js`.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/ElectronApp.js:236-238, 452-458`
  * `drawio-desktop/drawio/src/main/webapp/js/PostConfig.js:1-10`

---

### BUG-005: Electron CSP Blocking Next.js Hydration & Root-Relative `/_next/` Path Resolution in `file://` Protocol
* **Symptom**: Loading `mermaid-visual-editor/index.html` inside the Electron `file://` iframe failed to load `/_next/static/...` chunks and blocked Next.js inline hydration scripts under Electron's strict `Content-Security-Policy`.
* **Root Cause**:
  1. `electron.js` (line 838), `bootstrap.js` (line 244), and `ElectronApp.js` (line 305) enforced a strict `script-src 'self'` CSP without `'unsafe-inline'` or `'unsafe-eval'`.
  2. Next.js static export emitted root-relative `/_next/static/...` asset URLs in `mermaid-visual-editor/index.html`.
* **Resolution Strategy**:
  1. Rewrote all `/_next/` references in `drawio/src/main/webapp/mermaid-visual-editor/index.html` to relative `./_next/` paths.
  2. Added an `onBeforeRequest` redirect rule in `drawio-desktop/src/main/electron.js` (lines 851-858) redirecting any stray `/_next/` requests to `codeUrl + 'mermaid-visual-editor/_next/'`.
  3. Relaxed the Electron header and meta CSPs in `electron.js`, `bootstrap.js`, and `ElectronApp.js`.
* **Code Anchors**:
  * `drawio-desktop/src/main/electron.js:838-858`
  * `drawio-desktop/drawio/src/main/webapp/js/bootstrap.js:244-248`
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/ElectronApp.js:305-306`

---

### BUG-006: Duplicate Custom Sidebar Palettes (`Radar & Spider`, `Mind Maps`, `Infographics`) Appearing 2–3 Times
* **Symptom**: In Screenshots 1 & 2, the left shape library sidebar repeated `Radar & Spider Diagrams`, `Mind Maps & Brainstorming`, and `Infographics & Flow Visualization` multiple times.
* **Root Cause**: `plugins/mermaid-visual-editor.js` was loaded via `<script>` in `index.html`, `ElectronApp.js`, and `PostConfig.js`. Because `var pluginInitialized = false` was scoped to each IIFE closure instance rather than `window`, each script execution ran its own closure and registered the palettes again.
* **Resolution Strategy**: Replaced closure-local `pluginInitialized` with a window-global `window.__mermaidStudioPluginInitialized` singleton guard and added `ui.sidebar._customMermaidPalettesAdded = true` before calling `sb.addPaletteFunctions`.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:15-24, 3308-3312`

---

### BUG-007: White-on-White Contrast Inversion in Universal Studio Live Preview
* **Symptom**: In Screenshot 4, node and subgraph labels inside the Universal Code-to-Diagram Studio preview rendered with white text on light-yellow (`#ffffde`) and white (`#ffffff`) backgrounds, making text unreadable.
* **Root Cause**: `ui.getSvgForXml(xml, 20, 'auto')` stamped `color-scheme: light dark` onto the generated SVG root and used CSS `light-dark(#000000, #ffffff)` for text fills. When Windows OS dark mode was active while the preview canvas used a light `#ffffff` background, CSS `light-dark()` evaluated to `#ffffff` (dark-mode white text) over light node/subgraph fills.
* **Resolution Strategy**: Implemented `resolveLightDarkCss(svgStr, previewTheme)` to strip `color-scheme: light dark` and deterministically replace `light-dark(lightVal, darkVal)` with `lightVal` when rendering on the light preview canvas (or `darkVal` on dark canvas), and passed explicit `'light'`/`'dark'` theme mode to `ui.getSvgForXml()`.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1720-1755, 1810-1832`

---

### BUG-008: 2-Way Visual Mermaid Editor Showing "Canvas is empty" & Failing on Complex Flowchart Syntax
* **Symptom**: In Screenshot 5, opening the 2-Way Visual Editor showed `"Canvas is empty"`, left-click dragging could not pan the canvas, clicking `"Apply to Draw.io Canvas"` did not sync, and complex flowcharts with `subgraph ID["Title"]` (no space before `[`), `<br>`, `&amp;`, parentheses in quoted labels, `<-- "label" -->`, or `n1@{ shape: text }` failed to parse.
* **Root Cause**:
  1. `mermaid-visual-editor/lib/parser.ts` only matched `^flowchart\s+(TD|LR|BT|RL)` (missing `TB` and `graph`), required whitespace before `[` in `subgraph ID["Title"]`, did not track quote state inside `extractBalancedShape` (breaking when quoted labels contained `(` or `)`), lacked `<-- "label" -->` regex support, and choked on `n1@{ shape: text }`.
  2. `components/Canvas.tsx` restricted `panOnDrag` to middle/right mouse buttons (`[1, 2]`) and started with 0 nodes when opened without a selected cell.
  3. `app/page.tsx` only listened for `LOAD_MERMAID` and did not respond to `GET_MERMAID` from the Draw.io parent window.
* **Resolution Strategy**:
  1. Upgraded `mermaid-visual-editor/lib/parser.ts` to handle `flowchart`/`graph` (`TD|TB|LR|BT|RL`), `subgraph ID["Title"]`, `<br>` and HTML entity decoding, quote-aware `extractBalancedShape`, bidirectional labeled edges, and `@` shape annotations.
  2. Updated `components/Canvas.tsx` and `app/page.tsx` to pre-load an interactive starter flowchart when opened empty, enable left-click canvas panning (`panOnDrag={!drawingShape}`), and respond to `GET_MERMAID` with `MERMAID_SYNC`.
  3. Added clear text labels (`+ Rect`, `+ Diamond`, `+ Circle`, `+ Stadium`, `⚡ Sync to Draw.io`) and Draw.io light-slate styling to `components/TopToolbar.tsx`.
* **Code Anchors**:
  * `mermaid-visual-editor/lib/parser.ts:1-600`
  * `mermaid-visual-editor/components/Canvas.tsx:55-260`
  * `mermaid-visual-editor/components/TopToolbar.tsx:70-220`
  * `mermaid-visual-editor/app/page.tsx:25-110`
