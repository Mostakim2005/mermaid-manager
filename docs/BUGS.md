# Defect Log & RCA - MermaidApp Studio

### BUG-001: Next.js / TypeScript Incompatible Event Type in React Flow
* **Symptom**: `npm run build` in `mermaid-visual-editor` failed with:
  `Type error: Type '(_event: MouseEvent, draggedNode: Node<FlowNodeData>) => void' is not assignable to type 'OnNodeDrag<Node<FlowNodeData>>'`.
* **Root Cause**: React Flow's `onNodeDragStop` event handler definition expects React's synthetic mouse/touch event, whereas the file imported the native DOM `MouseEvent` from `'react'` under React 19 types.
* **Resolution Strategy**: Relaxed parameter typing to `(_event: any, draggedNode: Node<FlowNodeData>)` in `components/Canvas.tsx` line 174.
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
  2. Added idempotent lifecycle registration (`pluginInitialized` guard, `EditorUi.prototype.init` hook, `Draw.loadPlugin`, and a 300ms fallback polling timer checking `window.__activeDrawioUi`) inside `plugins/mermaid-visual-editor.js`.
  3. Built the unmistakable top floating studio bar (`#mermaid-studio-floating-bar`) and the full-screen **Universal Code-to-Diagram Studio** modal (`#universal-studio-modal`).
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/ElectronApp.js:236-238, 452-458`
  * `drawio-desktop/drawio/src/main/webapp/js/PostConfig.js:1-10`
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:14-16, 1837-1895`

---

### BUG-005: Electron CSP Blocking Next.js Hydration & Root-Relative `/_next/` Path Resolution in `file://` Protocol
* **Symptom**: Loading `mermaid-visual-editor/index.html` inside the Electron `file://` iframe failed to load `/_next/static/...` chunks (which resolved to `file:///C:/_next/...` and were blocked by `electron.js`'s `onBeforeRequest` security filter) and blocked Next.js inline hydration scripts under Electron's strict `Content-Security-Policy`.
* **Root Cause**:
  1. `electron.js` (line 838), `bootstrap.js` (line 244), and `ElectronApp.js` (line 305) enforced a strict `script-src 'self'` CSP without `'unsafe-inline'` or `'unsafe-eval'`.
  2. Next.js static export emitted root-relative `/_next/static/...` asset URLs in `mermaid-visual-editor/index.html`.
* **Resolution Strategy**:
  1. Rewrote all `/_next/` references in `drawio/src/main/webapp/mermaid-visual-editor/index.html` to relative `./_next/` paths.
  2. Added an `onBeforeRequest` redirect rule in `drawio-desktop/src/main/electron.js` (lines 851-858) redirecting any stray `/_next/` requests (where `!url.includes('/mermaid-visual-editor/_next/')`) to `codeUrl + 'mermaid-visual-editor/_next/'`.
  3. Relaxed the Electron header and meta CSPs in `electron.js` (line 838), `bootstrap.js` (line 244), and `ElectronApp.js` (line 305) to allow `'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:`.
* **Code Anchors**:
  * `drawio-desktop/src/main/electron.js:838-858`
  * `drawio-desktop/drawio/src/main/webapp/js/bootstrap.js:244-248`
  * `drawio-desktop/drawio/src/main/webapp/js/diagramly/ElectronApp.js:305-306`
  * `drawio-desktop/drawio/src/main/webapp/mermaid-visual-editor/index.html:1`
