# Project Operating Instructions (`AGENTS.md`)
> **Notice:** This project inherits user persona, confirmation gates, and documentation blueprints from the global master `AGENTS.md`. Do not duplicate those rules here.

## 1. Project Tech Stack & Environment
* **Runtime / Language:** Node.js v22.12.0+ (active: v24.21.0), JavaScript ES Modules, TypeScript 5+
* **Framework / Host:** Electron 44 + draw.io Desktop core (mxGraph) + Next.js 16 static export (@xyflow/react 12)
* **Target OS / Build Output:** Windows x64 portable `.exe` (`MermaidApp-draw.io-v<version>-Portable.exe`) and NSIS installer (`MermaidApp-draw.io-v<version>-Setup.exe`)

## 2. Mandatory Verification & Build Commands
* **Run App Locally:** `cd drawio-desktop; npm start`
* **Test Suite:** `cd drawio-desktop; npm test` (Node.js built-in test runner, 257 passing tests)
* **Visual Editor Build & Bundle Sync:** `node scripts/sync-visual-editor.cjs`
* **Check Upstream Updates:** `node scripts/check-upstream.cjs`
* **Cloud Build / Packaging:** Triggered by git tag or push to master in GitHub Actions (`.github/workflows/build.yml`). Local test build: `cd drawio-desktop; node ./sync.cjs; $env:DRAWIO_UNSIGNED='true'; npx electron-builder --config electron-builder-win.json --publish never`

## 3. Repository Directory Structure & Conventions
* `drawio-desktop/` - Electron host process (`src/main/electron.js`) & vendored draw.io webapp (`drawio/`).
* `mermaid-visual-editor/` - Next.js React Flow drag-and-drop editor source (`out/` compiled bundle).
* `scripts/` - Maintenance & diagnostic tooling (`sync-visual-editor.cjs`, `check-upstream.cjs`).
* `docs/` - Core documentation suite (`PRODUCT.md`, `ARCHITECTURE.md`, `DECISIONS_AND_TRAPS.md`, `VISUAL_GUIDE.html`). Search-first slug headers only; no line-number anchors or `INDEX.md`.

## 4. Repository-Specific Engineering Traps
* **TRAP 1: Blessed Paths BOM Parse Error:** Never save `%APPDATA%\draw.io\config.json` with a UTF-8 BOM; electron-store fails to parse it and revokes folder access.
* **TRAP 2: Next.js Bundled URL Rewriting:** Never rewrite `/_next/` to relative `./_next/` in the bundled editor; Turbopack runtime requires absolute `/_next/` redirected by `electron.js`. Always use `scripts/sync-visual-editor.cjs`.
* **TRAP 3: Native Prompt Removal:** Never call `window.prompt()` in Electron renderer. Use in-app DOM dialogs (`inAppDialog`, `appPrompt`, `appConfirm`).
* **TRAP 4: Tag Versioning Collision:** Never fetch upstream git tags without `--no-tags`; foreign upstream tags pollute the version auto-bump calculation.
* **TRAP 5: GPL-3.0 Copyleft Compliance:** The combined app is licensed under GNU GPLv3; never introduce proprietary or commercial restriction licenses that conflict with draw.io's GPL-3.0 base.
