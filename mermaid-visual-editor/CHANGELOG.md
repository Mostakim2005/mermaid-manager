# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Real-world Mermaid parser upgrades in `lib/parser.ts`:
  - YAML frontmatter stripping (`--- ... ---`).
  - Direction normalization (`TB` -> `TD`, default `TD` when omitted) across both `flowchart` and `graph` declarations.
  - Bracket quote awareness in `extractBalancedShape` so parentheses/brackets within quoted labels never break the bracket stack.
  - Comprehensive HTML entity decoding (`&amp;`, `&lt;`, `&gt;`, `&quot;`) and `<br>` to newline conversion via `cleanLabel`.
  - Subgraph syntax support for `subgraph ID["Title"]` without space, `subgraph "Title"`, and `subgraph Title`.
  - Support for Mermaid v11 `@` shape annotations (`nodeId@{ shape: ..., label: "..." }`) and graceful ignoring of `classDef`, `class`, and `click`.
  - Edge connectors with inline labels for bidirectional solid (`<-- "label" -->`), solid (`-- "label" -->`), dashed (`-. "label" .->`), and thick (`== "label" ==>`).
- Canvas pan & drag UX improvements:
  - Enabled left-click drag panning on empty canvas space (`panOnDrag={!drawingShape}`).
  - Added interactive empty-state buttons (`+ Add Starter Flowchart` and `+ Add Node`).
- Draw.io Desktop two-way synchronization bridge:
  - Responds immediately to `GET_MERMAID` messages with `MERMAID_SYNC` containing the latest diagram syntax.
  - Replaces canvas diagram when `LOAD_MERMAID` arrives with valid syntax.
  - Automatically initializes with an interactive architecture starter flowchart when opened fresh.
- Toolbar & UI Refresh:
  - Added clear text labels across all toolbar controls (`Select / Pan`, `+ Node`, `+ Add Shape`, `+ Subgraph`, `Import Code`, `Copy .mmd`, `✓ Sync to Draw.io`, `Inspector`).
  - Shifted neumorphic design system from muddy gray to Draw.io-native crisp slate `#f8fafc` with refined borders and shadows.

## [0.1.0] - 2026-03-08

### Added
- 14 node shapes: rectangle, rounded, stadium, subroutine, cylinder, circle, double-circle, diamond, hexagon, parallelogram, parallelogram-alt, trapezoid, trapezoid-alt, asymmetric
- 3 edge line styles (solid, dashed, thick) × 5 arrowhead types (arrow, none, bidirectional, circle, cross)
- 4 flow directions: TD, LR, BT, RL — canvas re-layouts on change via Dagre
- Undo/redo with 50-snapshot history stack (Ctrl+Z / Ctrl+Y)
- Node styling: fill color, stroke color, text color per node
- Edge styling: stroke color per edge
- 5 Mermaid themes (default, dark, forest, neutral, base) + hand-drawn look toggle
- 12 curve styles for edge routing
- Duplicate selected nodes (Ctrl+D)
- Export diagram as SVG
- Import Mermaid flowchart syntax → canvas (live parse feedback)
- Subgraphs: create, drag-assign children, rename, duplicate with children, full serialize/import round-trip
- Copy/paste nodes (Ctrl+C / Ctrl+V)
- Marquee multi-select
- Inspector panel for node/edge properties
- Toolbar with full keyboard accessibility (ARIA labels, focus management)
- `npx mermaid-visual-editor` terminal install — serves static build and opens browser
- CI workflow: lint + audit + build on every push/PR
- Release workflow: automated version bump, npm publish, GitHub Release
