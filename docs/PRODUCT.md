# Product Intent & Feature Map (`PRODUCT.md`)
> **1-Line Summary:** The permanent source of truth for what the user wants the app to do and feel like, independent of how the code is currently implemented.

## 1. Core Vision & User Experience Intent
* **What This App Does (Plain English):** MermaidApp Studio (repo name **Mermaid-Manager**) is a fully offline Windows diagramming suite: draw.io Desktop fused with a two-way visual Mermaid drag-and-drop editor, a universal paste-code-to-diagram studio, and a diagrams/folders workspace hub that manages real folders on the user's PC.
* **How It Must Feel to Use:** Native draw.io light/dark styling everywhere (no white-on-white or dark-on-dark text), instant startup from a single portable `.exe`, zero subscriptions/accounts/telemetry, and every Mermaid diagram stays editable text that round-trips between code and canvas.

## 2. Active Features (Do Not Break)

### [FEATURE: Two-Way Visual Mermaid Editor] | Aliases: 2-way editor, visual editor, drag and drop, React Flow editor
> **1-Line Summary:** A floating drag-and-drop canvas where nodes, edges and subgraphs can be edited visually and the Mermaid source syncs both ways with the draw.io canvas.
* **User Intention (Non-Negotiable):** Every toolbar button (`+ Node`, `+ Add Shape`, `+ Subgraph`, `Import Code`, `Copy .mmd`, `Sync to Draw.io`) must respond instantly; the canvas pre-loads a starter flowchart; a built-in **?** help panel teaches the workflow without leaving the app.
* **Visual / UI Behavior:** Floating mxWindow over draw.io; neu-styled toolbar; right inspector with object/diagram settings and live `.mmd` preview.
* **Code Anchors (Grep Targets):**
  * `mermaid-visual-editor/components/Canvas.tsx` -> `CanvasInner`, `DEFAULT_STARTER_FLOWCHART`
  * `mermaid-visual-editor/components/TopToolbar.tsx` -> `TopToolbar`
  * `mermaid-visual-editor/components/HelpPanel.tsx` -> `HelpPanel`
  * `mermaid-visual-editor/lib/store.ts` -> `useFlowStore`
  * `mermaid-visual-editor/lib/parser.ts` -> `parseMermaidFlowchart`

### [FEATURE: Universal Code-to-Diagram Studio] | Aliases: paste code, auto-render, studio, Ctrl+Shift+M
> **1-Line Summary:** A split-pane modal that auto-detects 22+ diagram syntaxes from pasted code, renders a live preview, and repairs broken Mermaid with an explained one-click fixer.
* **User Intention (Non-Negotiable):** Paste anything (Mermaid, PlantUML, Markdown outline, radar/infographic DSL) and see it rendered; the Auto-Fix button must say *what it repaired* in plain English, never rewrite code blindly.
* **Visual / UI Behavior:** Resizable splitter, collapsible code pane, light/dark preview toggle, status bar with an inline Auto-Fix prompt on syntax errors.
* **Code Anchors (Grep Targets):**
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` -> `openUniversalStudio`, `renderCurrentCode`, `detectDiagramType`, `autoFixSyntaxDetailed`, `applyAutoFixAndReport`

### [FEATURE: Mermaid Syntax Auto-Fixer] | Aliases: auto-fix, quick fix, syntax repair, mermaid fixing
> **1-Line Summary:** An ordered, diagram-family-aware repair pipeline that fixes fenced code, smart quotes, broken arrows, unquoted labels, unclosed brackets/subgraphs and unbalanced quotes — idempotently, with a human-readable report.
* **User Intention (Non-Negotiable):** Never silently mangle working code; sequence/class/state diagrams must pass through untouched; repeated clicks must not keep changing the code.
* **Visual / UI Behavior:** `🔧 Auto-Fix Syntax` in the studio toolbar and `Auto-Fix Now` in the error status bar.
* **Code Anchors (Grep Targets):**
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` -> `autoFixSyntaxDetailed`, `mermaidFamily`, `repairArrows`, `repairUnquotedLabels`, `repairSubgraphs`

### [FEATURE: Diagrams and Folders Workspace Hub] | Aliases: hub, diagrams hub, folders, Ctrl+Shift+D
> **1-Line Summary:** A folder-tree workspace with live-preview cards, grid/list views, favorites, and a default save folder — including real folders on the user's PC holding `.mmd`/`.md` Mermaid files.
* **User Intention (Non-Negotiable):** Creating a folder, saving a diagram, or deleting anything must always work through in-app dialogs (never native `prompt()`); PC folders are imported through the native directory picker and stay authorized across launches; files on disk are never deleted when a folder is removed from the hub.
* **Visual / UI Behavior:** Sidebar (Dashboard / Favorites / Folders with counts), card grid with SVG previews, `🖿 Add PC folder`, `⟳ Rescan`, `⚙ Default save folder` selector.
* **Code Anchors (Grep Targets):**
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` -> `openDiagramsHub`, `renderHubView`, `addDiskFolder`, `refreshDiskFolder`, `getDefaultFolderId`, `inAppDialog`, `appPrompt`, `appConfirm`

### [FEATURE: Electron Disk Access over IPC] | Aliases: IPC, file access, blessed paths, read write files
> **1-Line Summary:** Four main-process IPC actions let the hub list/read/write/delete Mermaid files in folders the user authorized through the native picker, with the same symlink/extension/size protections as draw.io itself.
* **User Intention (Non-Negotiable):** The renderer is semi-untrusted: only folders blessed via the native dialog are readable/writable; grants persist across launches; traversal (`..`), reserved device names (`CON`), non-text extensions and >5 MB content are refused.
* **Visual / UI Behavior:** Invisible to the user except through the hub's PC-folder buttons.
* **Code Anchors (Grep Targets):**
  * `drawio-desktop/src/main/electron.js` -> `mermaidAuthFolder`, `mermaidContainedChild`, `reqMermaidName`, `rendererReq`

### [FEATURE: Native Drawio Toolbar and Side Panels] | Aliases: toolbar, Diagrams button, Paste Code button, collapse panels
> **1-Line Summary:** Native-styled toolbar buttons (Diagrams, Paste Code → Auto-Render, 2-Way Visual Editor, Quick Templates) plus `«`/`»` collapse tabs for distraction-free diagramming.
* **User Intention (Non-Negotiable):** Buttons must follow draw.io light/dark theme and never duplicate (guarded single registration).
* **Code Anchors (Grep Targets):**
  * `drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js` -> `injectNativeToolbarButtons`, `setupSidePanelCollapsers`, `injectCustomStyles`

### [FEATURE: Portable Executable and Cloud Builds] | Aliases: portable exe, release, GitHub Actions, cloud build
> **1-Line Summary:** A single unsigned portable `.exe` built locally on demand and, by default, built in the cloud by a tag-triggered GitHub Actions workflow that attaches it to GitHub Releases.
* **User Intention (Non-Negotiable):** No installers unless asked; no code signing for personal builds; binaries never committed to Git.
* **Repository Rule:** Public repo <https://github.com/Mostakim2005/mermaid-manager>; the tag (`v32.6.1`) must match `drawio-desktop/drawio/VERSION` so the release name and the built file name agree.
* **Code Anchors (Grep Targets):**
  * `.github/workflows/build.yml` -> `build-portable`
  * `drawio-desktop/electron-builder-win.json` -> `portable.artifactName`
  * `drawio-desktop/build/sign-trusted.mjs` -> personal-build skip
  * `scripts/sync-visual-editor.cjs` -> build + atomic bundle swap
  * `scripts/verify-ipc-integration.mjs` -> CDP end-to-end regression
  * `scripts/verify-packaged-exe.mjs` -> packaged-exe regression

## 3. Planned Features & App-Merge Wishlist

### [WISHLIST: Generate AI Panel] | Aliases: AI, DeepSeek, Gemini, model selector, CLI API
> **1-Line Summary:** A chat-style Generate panel with a model picker (DeepSeek, Gemini, …) connectable either through installed harness CLIs or direct APIs, generating Mermaid into the Studio.
* **User Intention:** Describe a diagram in words and get editable Mermaid; switch models freely.
* **Target Integration Point:** New toolbar button in `injectNativeToolbarButtons`; output flows into `openUniversalStudio`.
* **Status:** Deferred by user (no such panel exists in the codebase yet).

### [WISHLIST: App-Created Folders On Disk] | Aliases: real folders, new folder on disk, write folders
> **1-Line Summary:** Let "New Folder" create a real directory on disk (not just a hub label) once folder-write support is generalized.
* **User Intention:** Folders created in the app should live on the C: drive alongside PC-imported ones.
* **Target Integration Point:** `addDiskFolder` / new `mermaidMakeFolder` IPC action; requires folder-create authorization in `mermaidAuthFolder`.
