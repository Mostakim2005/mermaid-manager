# MermaidApp Studio (draw.io + Visual Two-Way Drag & Drop Mermaid)

[![Build Portable EXE](https://github.com/Mostakim2005/mermaid-manager/actions/workflows/build.yml/badge.svg)](https://github.com/Mostakim2005/mermaid-manager/actions/workflows/build.yml)

**MermaidApp Studio** is a completely offline, zero-subscription desktop diagramming suite for Windows. It integrates the power of **draw.io Desktop** with the **mermaid-visual-editor** (React Flow + Mermaid AST), enabling true two-way visual drag-and-drop diagramming alongside comprehensive multi-domain visualization tools.

**Repository:** <https://github.com/Mostakim2005/mermaid-manager>
**Releases:** <https://github.com/Mostakim2005/mermaid-manager/releases>

---

## Key Features

1. **Two-Way Visual Drag & Drop Mermaid Editor**:
   * Click **⚡ Mermaid Visual** on the top toolbar or right-click any diagram cell to open the visual canvas.
   * Drag nodes, reconnect arrows, change hierarchy directions (TB, BT, LR, RL), switch color themes, and edit subgraphs visually.
   * Real-time bidirectional synchronization: `.mmd` code updates as you drag, and clicking **Sync to Draw.io** injects the vector shapes onto your Draw.io canvas.
2. **Comprehensive Diagram Type Coverage**:
   * **Flowcharts & State Machines**: Full Mermaid and draw.io flowcharting capabilities.
   * **Radar & Spider Diagrams**: Built-in 5-axis, 6-axis, and 8-axis geometric grid and data polygon stencils in the sidebar.
   * **Mind Maps**: Central concept nodes, organic curved connectors, and topic pills.
   * **Cloud Architecture**: AWS, Azure, Google Cloud (GCP), Kubernetes, Cisco, and C4 Model shapes.
   * **Infographics & Flows**: KPI statistics cards, chevron process flows, comparison boards, and timeline funnels.
3. **100% Free & Local (MIT / Apache 2.0 / GPLv3)**:
   * No subscription fees, no online account requirement, and zero telemetry.
4. **Vector & Raster Exports**:
   * Export to scalable **SVG** (with embedded editable diagram data), crisp **PNG** (transparent backgrounds, custom DPI), and vectorized **PDF**.
5. **Portable Executable (built in the cloud)**:
   * Standalone single-file binary attached to [GitHub Releases](https://github.com/Mostakim2005/mermaid-manager/releases) — run immediately without installation.
   * Pushing a `v*` tag builds it automatically on GitHub Actions; no local build toolchain needed.

---

## Quick Start

### Download the portable application
1. Open the [latest release](https://github.com/Mostakim2005/mermaid-manager/releases).
2. Download `MermaidApp-draw.io-v32.6.1-Portable.exe`.
3. Double-click it — no installer, no account, no admin rights.

### Build the portable exe in the cloud
1. Push a version tag (for example `git tag v32.6.1 && git push origin v32.6.1`).
2. The **Build Portable EXE** workflow compiles it on `windows-latest`, uploads it as a run artifact, and attaches it to the matching GitHub Release.
3. The tag version must match `drawio-desktop/drawio/VERSION`; the workflow warns if they differ.

### Using the Visual Drag-and-Drop Editor
1. In draw.io, click the **⚡ Mermaid Visual** button on the toolbar (or navigate to `Arrange > Insert > Advanced > Visual Mermaid Editor`).
2. In the floating editor window, draw or rearrange nodes on the canvas.
3. Click **Sync to Draw.io Canvas** to render your diagram directly into draw.io shapes.
4. To edit an existing diagram, select it on the canvas and click **📥 Load from Selected Cell** inside the visual editor window.

---

## Directory Structure

One Git repository, no submodules. Dependency folders, build outputs and the packaged
`.exe` are git-ignored.

```
mermaid-manager/
├── .github/workflows/build.yml        # tag-triggered portable-exe cloud build
├── drawio-desktop/                    # draw.io desktop source & Electron harness
│   ├── drawio/src/main/webapp/
│   │   ├── plugins/mermaid-visual-editor.js   # Host integration plugin
│   │   └── mermaid-visual-editor/             # Bundled React Flow web client
│   └── electron-builder-win.json      # Portable exe packaging config
├── mermaid-visual-editor/             # Source for the visual drag & drop component
├── docs/                              # PIA documentation + visual dashboard
├── scripts/                           # bundle sync + verification scripts
├── LICENSE                            # PolyForm Noncommercial 1.0.0
└── THIRD_PARTY_NOTICES.md             # upstream MIT / Apache / GPL credits
```
