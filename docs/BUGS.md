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

### BUG-006: Duplicate Custom Sidebar Palettes (`Radar & Spider`, `Mind Maps`, `Infographics`) Appearing 2â€“3 Times
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
  3. Added clear text labels (`+ Rect`, `+ Diamond`, `+ Circle`, `+ Stadium`, `âš¡ Sync to Draw.io`) and Draw.io light-slate styling to `components/TopToolbar.tsx`.
* **Code Anchors**:
  * `mermaid-visual-editor/lib/parser.ts:1-600`
  * `mermaid-visual-editor/components/Canvas.tsx:55-260`
  * `mermaid-visual-editor/components/TopToolbar.tsx:70-220`
  * `mermaid-visual-editor/app/page.tsx:25-110`

---

### BUG-009: 2-Way Visual Editor Rendered but Every Button Was Dead
* **Symptom**: The window opened and drew its whole UI (toolbar, empty-state card, inspector), but `Add Starter Flowchart`, `+ Node`, `+ Add Shape`, `Import Code`, `Copy .mmd` and `Sync to Draw.io` did nothing. Only moving the window worked.
* **Root Cause**: The bundled client never hydrated. Two separate defects combined:
  1. `drawio/src/main/webapp/mermaid-visual-editor/` was a hand-copied snapshot whose `index.html` had its `/_next/` URLs rewritten to `./_next/` by an ad-hoc script, and whose chunk directory had accumulated files from different builds (88 chunks for 20 referenced). The Turbopack runtime derives its chunk base from `document.currentScript.src`; with relative URLs and a mixed tree it never ran, so `globalThis.TURBOPACK` stayed a bare `[]`, React never mounted, and every `onclick` was inert.
  2. `electron.js:846-869` already redirects any `file://*_next*` request to `<codeUrl>mermaid-visual-editor/_next/`, which only works when the HTML keeps its **absolute** `/_next/` URLs.
* **Resolution Strategy**:
  1. Added `scripts/sync-visual-editor.cjs`, which builds the editor, validates that every referenced chunk exists, then stages and atomically swaps the destination directory (never copies over a live tree) and re-checks for stale chunks.
  2. The script deliberately keeps `/_next/` absolute â€” rewriting to `./_next/` is what breaks hydration.
* **Verification**: Headless Electron loads the webapp over `file://`; the iframe reports `hydrated: true`, 6 starter nodes, and 7 after clicking `+ Node`.
* **Code Anchors**:
  * `scripts/sync-visual-editor.cjs:1-70`
  * `drawio-desktop/src/main/electron.js:846-869`

---

### BUG-010: "New Folder" Failed with `Uncaught Error: prompt() is not supported`
* **Symptom**: Clicking **New Folder** in the Diagrams & Folders Workspace Hub raised an `Unknown error` dialog reading `Uncaught Error: prompt() is not supported.`, and no folder was created. Save-canvas, rename and delete actions were equally broken.
* **Root Cause**: Electron removes `window.prompt()` from renderers. The hub used `prompt()` in four places and `confirm()` in three; a `prompt()` call throws, so the handler aborted before touching storage.
* **Resolution Strategy**: Added DOM-based `inAppDialog()` / `appPrompt()` / `appConfirm()` helpers in the plugin and replaced every native `prompt()`/`confirm()` call site. The dialog is theme-aware, stops key events leaking into draw.io's canvas shortcuts, and supports Escape/Enter.
* **Verification**: Headless Electron creates a folder named "Verified Folder" through the in-app dialog; `prompt() is not supported` no longer appears anywhere in the DOM.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:107-230` (`inAppDialog`, `appPrompt`, `appConfirm`)

---

### BUG-011: Hub Folders Were Not On Disk and There Was No Default Save Location
* **Symptom**: "New Folder" only created a `localStorage` label â€” nothing existed on the C: drive, existing `.md`/`.mmd` diagrams could not be browsed, and every save landed in a hardcoded "Personal" folder.
* **Root Cause**: The workspace model had no notion of disk folders and no settings object; `folderId: 'personal'` was hardcoded at every save site.
* **Resolution Strategy**:
  1. Added `ðŸ–¿ Add PC folder` (native directory picker) which scans for `.mmd` files and `.md`/`.markdown` files containing ```` ```mermaid ```` blocks, and registers the directory as a hub folder (`kind: 'disk'`).
  2. Added `ðŸ”„ Rescan` on disk folders, since the web runtime keeps no directory handle â€” the folder is re-picked and re-matched by relative path.
  3. Added a `âš™ Default save folder` selector persisted in `workspace.settings.defaultFolderId`; all save paths now resolve through `getDefaultFolderId()`.
* **Note**: Folders created in-app remain virtual (localStorage) by design â€” writing arbitrary files requires an Electron IPC grant. Disk folders are read-imported.
* **Update (IPC implementation)**: Hub folders now read AND write real disk content. Four IPC actions were added to `electron.js` (`mermaidListFolder`, `mermaidReadFile`, `mermaidWriteFile`, `mermaidDeleteFile`): the folder must be one the user authorized through the native directory picker (`showOpenDialog` blesses it, persisted via electron-store), every child path is re-derived main-process-side from the blessed folder + a sanitized single-segment name, realpath-checked for containment (symlinks cannot escape), extension-allowlisted (`.mmd/.md/.markdown/.drawio`), Windows reserved device names rejected, and content size-capped at 5 MB. A native "Add PC folder" picker replaced the `webkitdirectory` workaround in Electron; the in-page picker remains as a non-Electron fallback. Verified end-to-end over CDP against the real app: blessed folder reads/writes/deletes work, traversal, `.exe` and `CON` names are refused, and the grant persists across launches.
* **Code Anchors (IPC)**:
  * `drawio-desktop/src/main/electron.js:4195-4260` (`mermaidAuthFolder`, `mermaidContainedChild`, `reqMermaidName`)
  * `drawio-desktop/src/main/electron.js:4620-4700` (rendererReq cases)
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:1660-1705` (`isElectronHost`, `ipcRequest`, `pickDiskFolder`)
  * `scripts/verify-ipc-integration.mjs` (CDP regression test)
---

### BUG-012: Contrast Inversion When Switching Light/Dark Themes
* **Symptom**: In dark mode a chart's bars were almost the same near-black as the panel behind them, and the selected shape and the floating palette icons were unreadable. In the Studio, node labels could turn white on a light canvas.
* **Root Cause**: `resolveLightDarkCss()` replaced `light-dark(a, b)` with a regex that split on the first comma â€” but draw.io emits `rgb(...)` values, which contain commas, so `light-dark(rgb(236, 236, 255), rgb(31, 32, 32))` was mangled. It also left `color-scheme` untouched, letting the browser re-resolve any surviving pair against the OS theme rather than the canvas being drawn.
* **Resolution Strategy**: Rewrote the resolver to walk the argument list with paren-depth awareness (`splitLightDarkArgs`) and to pin `color-scheme` to the target canvas. Added `parseCssColor`, `relativeLuminance` and `contrastRatio` helpers for contrast checks.
* **Verification**: A real draw.io render emits 11 `light-dark()` pairs per theme; after resolution both themes report 0 unresolved pairs and the expected light (`rgb(236,236,255)`, `rgb(51,51,51)`) / dark (`rgb(31,32,32)`, `rgb(204,204,204)`) values.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:16-100` (`splitLightDarkArgs`, `resolveLightDarkCss`, `parseCssColor`, `contrastRatio`)

---

### BUG-013: Auto-Fix Rewrote Code Blindly and Could Not Say What It Did
* **Symptom**: `ðŸ”§ Auto-Fix Syntax` / `Auto-Fix Now` reported "Applied syntax auto-fix rules" even when nothing changed, and its repairs were flowchart-only and regex-fragile: en-dash input produced `--->B`, unclosed brackets were left broken, and an unbalanced-quote pass could fight the bracket pass, making repeated clicks keep changing the code.
* **Root Cause**: One monolithic `autoFixSyntax()` with no result reporting, no diagram-family awareness, and no idempotency guarantee.
* **Resolution Strategy**:
  1. Replaced it with `autoFixSyntaxDetailed()`, an ordered pipeline of small repair rules (`repairUnicode`, `repairArrows`, `repairUnquotedLabels`, `repairUnclosedBrackets`, `repairSubgraphs`, `repairUnbalancedQuotes`, `repairHeaderSpacing`, `repairCaseKeywords`, `repairEdgeLabels`) gated by `mermaidFamily()`.
  2. Each rule only touches what it can prove is wrong and returns a human-readable note; `applyAutoFixAndReport()` shows the applied repairs in the status bar.
  3. `autoFixSyntax()` remains as a thin compatibility shim for existing callers.
* **Verification**: 17 cases (fencing, smart quotes/en-dashes, broken arrows, unquoted `()`/`:` labels, unclosed brackets, unclosed subgraphs, implicit headers, spaced edge labels, sequence/class passthrough) all produce stable, idempotent output.
* **Code Anchors**:
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js:527-760` (`autoFixSyntaxDetailed` and repair rules)

---

### BUG-014: License Incompatibility & Stale Upstream References Post-Cloud Migration
* **Symptom**: Cloud repository retained stale upstream URLs (pointing issues and releases to `jgraph/drawio-desktop` and `saketkattu/mermaid-visual-editor`) and declared PolyForm Noncommercial 1.0.0, which was legally incompatible with `drawio-desktop`'s copyleft GPL-3.0 license.
* **Root Cause**:
  1. Relicensing under PolyForm Noncommercial violated GPLv3 Section 5(c) which mandates that derivative works of GPLv3 software (`drawio-desktop`) must be licensed as a whole under GPLv3.
  2. `drawio-desktop/src/main/update-mode.js` and `drawio-desktop/src/main/electron.js` contained hardcoded upstream URLs opening `jgraph/drawio-desktop` issues and release pages.
  3. `package.json` manifests in `drawio-desktop` and `mermaid-visual-editor` pointed to upstream GitHub repository URLs instead of `Mostakim2005/mermaid-manager`.
* **Resolution Strategy**:
  1. Replaced root `LICENSE` with standard GNU General Public License v3.0 (GPL-3.0-only) and updated `THIRD_PARTY_NOTICES.md` to cleanly delineate GPLv3 root licensing alongside Apache 2.0 and MIT subcomponents.
  2. Updated `update-mode.js` (line 47) and its unit test (`update-mode.test.js`) to point to `https://github.com/Mostakim2005/mermaid-manager/releases/tag/v...`.
  3. Updated `electron.js` (line 1889) Support link to open `https://github.com/Mostakim2005/mermaid-manager/issues`.
  4. Updated `repository`, `bugs`, and `homepage` URLs in `drawio-desktop/package.json` and `mermaid-visual-editor/package.json`, and added owner/repo to `electron-builder-win.json` publish config.
* **Verification**: `npm test` in `drawio-desktop` passes 257 tests (including `getReleaseUrl` tests), and `.github/workflows/build.yml` triggers on version releases.
* **Code Anchors**:
  * `LICENSE:1-674`
  * `THIRD_PARTY_NOTICES.md:1-25`
  * `drawio-desktop/src/main/update-mode.js:45-48`
  * `drawio-desktop/src/main/electron.js:1887-1890`
  * `drawio-desktop/src/test/update-mode.test.js:88-94`
  * `drawio-desktop/package.json:20-36`
  * `drawio-desktop/electron-builder-win.json:23-28`
  * `mermaid-visual-editor/package.json:18-24`


