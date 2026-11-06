# Handover — MermaidApp Studio

**Date**: 2026-11-06
**Repo root**: `C:\Users\kazir\Documents\Agentic Harness\Windows Exe\MermaidApp\`
**Session goal**: all four user-reported issues fixed, verified, documented, and committed.

---

## What this app is

An offline diagramming suite: draw.io Desktop (Electron) plus a bundled
Next.js/React-Flow "2-Way Visual Mermaid Editor", a Universal Code-to-Diagram
Studio, and a Diagrams & Folders Workspace Hub — all injected by one plugin,
`drawio-desktop/drawio/src/main/webapp/plugins/mermaid-visual-editor.js`.

Repo layout (nested git repos, root tracks them as gitlinks):

```
MermaidApp/                     root repo (docs/, scripts/)
├── drawio-desktop/             Electron host (its own repo)
│   ├── drawio/                 core webapp SUBMODULE (plugin + bundled editor live here)
│   └── src/main/electron.js    main process (IPC + security model)
├── mermaid-visual-editor/      Next.js editor source (its own repo; out/ → bundled into drawio webapp)
├── docs/                       ARCHITECTURE / FEATURES / BUGS (PIA set) + HANDOVER.md (this file)
├── scripts/
│   ├── sync-visual-editor.cjs  build editor + atomically swap it into the webapp
│   └── verify-ipc-integration.mjs  end-to-end CDP regression test (real app)
└── releases/                   packaged portable exe (NOT rebuilt this session)
```

## What was fixed this session (all in `docs/BUGS.md` as BUG-009…013)

1. **BUG-009 — 2-Way Visual Editor buttons dead.** The bundled copy had been
   hand-edited (relative `./_next/` URLs) and mixed chunks from several builds,
   so the Turbopack runtime never booted and React never hydrated. Fix:
   `scripts/sync-visual-editor.cjs` (build → verify referenced chunks exist →
   stage → atomic swap → stale-chunk check). The export keeps ABSOLUTE
   `/_next/` URLs on purpose; `electron.js:846-869` redirects `/_next/*` to
   the bundled folder. Verified: iframe hydrates, clicking `+ Node` adds nodes.
2. **BUG-010 — `prompt() is not supported`.** Electron removes `prompt()`;
   the hub used it in 4 places. Added DOM-based `inAppDialog`/`appPrompt`/
   `appConfirm` in the plugin and replaced every native dialog call site.
   Verified: folder creation through the in-app dialog works.
3. **BUG-011 — PC folders + default save folder.** Hub gained an "Add PC
   folder" button (native picker → blessed → persisted grant), a per-folder
   `Rescan` action, and a
   `⚙ Default save folder` selector; all save paths resolve through
   `getDefaultFolderId()`. Electron path reads/writes real disk over new IPC
   (below); non-Electron falls back to `webkitdirectory`.
4. **BUG-012 — contrast inversion.** `resolveLightDarkCss` split
   `light-dark()` args on the first comma — `rgb(...)` values contain commas.
   Rewrote paren-depth-aware, pins `color-scheme` to the canvas theme.
5. **BUG-013 — auto-fixer.** Replaced blind regex rewrite with an ordered,
   diagram-family-aware, idempotent pipeline (`autoFixSyntaxDetailed`) that
   reports each applied repair in the status bar.

## The IPC disk layer (new this session, in `drawio-desktop/src/main/electron.js`)

Security model = draw.io's own: the renderer is semi-untrusted. A folder is
authorized ONLY when the user picks it in the native directory dialog
(`showOpenDialog` → `blessPath` → persisted in electron-store
`%APPDATA%\draw.io\config.json` under `blessedPaths`), and the grant persists
across launches. New actions:

| Action | Files | Guards |
|---|---|---|
| `mermaidListFolder` | top-level `.mmd/.md/.markdown` | readable-blessed folder, LSTAT file-type check, 2000-entry cap |
| `mermaidReadFile` | one file | blessed folder, name sanitiser, realpath containment, 5 MB cap |
| `mermaidWriteFile` | `.mmd/.md/.markdown/.drawio` | writable-blessed folder, sanitiser, containment, 5 MB cap, O_SYNC write |
| `mermaidDeleteFile` | one file | writable-blessed folder, sanitiser, containment, LSTAT (no symlink/junction follow), unlink |

Name sanitiser rejects: path separators, `..`, null, trailing dot/space,
>200 chars, Windows reserved device names (CON, NUL, COM1-9, LPT1-9…).
Child paths are computed main-process-side from the blessed folder's realpath;
`canonicalisePath` refuses symlink children entirely.

**Verified end-to-end** over CDP against the real app
(`scripts/verify-ipc-integration.mjs`): blessed folder list/read/write/delete
round-trip passes; unauthorised folder, `..\` traversal, `.exe` extension and
`CON` names are all refused with `path not authorised` / `bad name`.

## ⚠️ Operation note: the config-BOM trap

`%APPDATA%\draw.io\config.json` must be BOM-less UTF-8 JSON. Editing it with
PowerShell 5.1 `Set-Content -Encoding UTF8` writes a BOM, electron-store's
parse then fails (`Failed to initialize electron-store: Unexpected token`)
and **`blessedPaths` silently loads empty** — every hub disk access then
reports `path not authorised`. If that symptom appears, check the first three
bytes of config.json (`EF BB BF` = BOM) and rewrite BOM-less. PowerShell 7
(`pwsh`) and `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)` are safe.

## How to run / verify / build

```powershell
# dev run (CDP)
cd drawio-desktop; cmd /c "node_modules\.bin\electron.cmd . --remote-debugging-port=9333"

# end-to-end regression (builds fixtures, launches real app, asserts IPC+hub+editor)
node scripts\verify-ipc-integration.mjs <path-to-drawio-desktop>

# rebuild + reinstall the visual editor into the webapp
node scripts\sync-visual-editor.cjs            # or --no-build

# plugin/main syntax gates
node --check drawio-desktop\src\main\electron.js
node --check "drawio-desktop\drawio\src\main\webapp\plugins\mermaid-visual-editor.js"

# package the portable exe (NOT run this session — releases/ still holds the old build)
cd drawio-desktop; npm run sync; $env:DRAWIO_UNSIGNED='true'; npx electron-builder --config electron-builder-win.json --publish never
```

## Known limits / deferred work

- **Generate AI panel** (DeepSeek/Gemini selector, CLI+API routes) — user
  deferred; no such panel exists in this codebase.
- **`releases/MermaidApp-draw.io-…-Portable.exe`** predates all of these fixes;
  needs an electron-builder run to pick them up.
- In-app-created (non-disk) hub folders remain virtual (localStorage) by design;
  disk folders are the on-disk surface.
- Nested repos: `drawio-desktop` must be committed BEFORE the root (gitlink
  update), and `drawio-desktop/drawio` (submodule) before `drawio-desktop`.

## Git map for this session's changes

| Repo | Changed |
|---|---|
| root | `docs/BUGS.md` (BUG-009…013), `docs/HANDOVER.md` (new), `scripts/*` (new) |
| `mermaid-visual-editor` | `components/HelpPanel.tsx` (new), `components/TopToolbar.tsx` (Help button) |
| `drawio-desktop` | `src/main/electron.js` (IPC actions + security helpers) |
| `drawio-desktop/drawio` (submodule) | `plugins/mermaid-visual-editor.js` (dialogs, hub, auto-fixer, contrast), `mermaid-visual-editor/*` (rebuilt editor bundle) |
