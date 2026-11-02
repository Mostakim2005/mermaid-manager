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
* **Code Anchor**: `drawio-desktop/build/sign-trusted.mjs`.

---

### BUG-003: Submodule Initialization Requirement
* **Symptom**: Cloned `drawio-desktop` directory was missing `drawio/src/main/webapp/index.html`.
* **Root Cause**: The core webapp lives in the `jgraph/drawio` submodule.
* **Resolution Strategy**: Executed `git submodule update --init --depth 1` to shallow-clone the full web assets directly into `drawio-desktop/drawio`.
