# Workspace Canvas — Design Handoff

Wireframe for the new **Workspace** feature. This document describes
*what is built* and *what the design pass should add*. Hand this to
Claude Design (or a human designer) along with the source files in
`src/components/workspace/`.

---

## Goals

- A node-based canvas where a user chains AI tools (image gen, video
  gen, TTS, etc.) into a workflow.
- **No Input/Output nodes** — every node is a *tool*. Inputs are either
  typed inline on the node or fed from an upstream tool's output.
- Target users: small agencies (10–20 person teams) and university
  classes (SSO). Not pro VFX artists. UX must feel light, not Houdini.
- Must feel **smoother and clearer** than the legacy `FlowStudio` node
  editor.

## Routes

| Path | Component | Layout |
|------|-----------|--------|
| `/app/workspace` | `pages/workspace/index.tsx` | DashboardLayout (with sidebar) |
| `/app/workspace/:canvasId` | `pages/workspace/Canvas.tsx` | Full-screen, no layout |

Sidebar entry lives in `components/home/DashboardSidebar.tsx` —
icon: `Layers`, label: `Workspace`.

## Component map

```
src/
├── store/
│   └── useWorkspaceStore.ts          ← Zustand. canvases[], current{nodes,edges}, selection
├── components/workspace/
│   ├── workspace.css                 ← Visual primitives + animations (see below)
│   ├── workspaceSchema.ts            ← Node type definitions + AI provider schema
│   ├── WorkspaceCanvas.tsx           ← React Flow surface, drop handler, viewport persist
│   ├── CanvasHeader.tsx              ← Top bar: project chip, canvas name, Share, user menu
│   ├── CanvasContextMenu.tsx         ← Right-click tool palette (categorised)
│   ├── WorkspaceCanvasPagePill.tsx   ← Floating bottom-left page switcher
│   ├── WorkspaceToolNode.tsx         ← Tool node (image/video/audio gen, BG remove, merge audio)
│   └── …                             ← AssetNode, ElementNode, GroupNode, NodePreviewLightbox, …
└── pages/workspace/
    ├── index.tsx                     ← Dashboard: list + create canvas
    └── Canvas.tsx                    ← 3-pane editor wrapper (top + palette + canvas + preview)
```

## Tool catalog (10 tools, 4 categories)

Defined in `toolRegistry.ts`. Each tool has `inputs[]`, `outputs[]`,
`params[]`. Adding more tools = appending to the array. **No code
changes needed** in node, palette, or panel.

| Category | Tool | Inputs | Outputs |
|----------|------|--------|---------|
| Generate | Banana Pro | (optional) image | image |
| Generate | Seed Dream | (optional) image | image |
| Generate | Kling Video | image | video |
| Generate | Seed Dance | image | video |
| Edit | Remove Background | image | image |
| Edit | Motion Control | video, video | video |
| Edit | Extend Video | video | video |
| Audio | Text to Speech | text | audio |
| Audio | Merge Audio + Video | video, audio | video |
| AI | Chat AI | (optional) text | text |

Real execution is **not wired** — Run button is disabled. Tool
registry shape is meant to map cleanly to the existing edge function
contracts in `supabase/functions/` later.

## Port type system

```ts
type PortType = "text" | "image" | "video" | "audio" | "number";
```

Each handle is colored by its type. Each edge inherits its color from
the source port (handled in `WorkspaceCanvas.onConnect`). Color tokens:

| Type  | Tailwind (handle) | CSS HSL (wire)        |
|-------|-------------------|-----------------------|
| text  | `bg-blue-400`     | `hsl(217 91% 60%)`    |
| image | `bg-emerald-400`  | `hsl(160 84% 39%)`    |
| video | `bg-yellow-400`   | `hsl(64 100% 50%)`    |
| audio | `bg-amber-400`    | `hsl(43 96% 56%)`     |
| number| `bg-zinc-400`     | `hsl(0 0% 65%)`       |

Mirrored in CSS variables `--ws-wire-text`, `--ws-wire-image`, etc.

## Visual / animation primitives (in `workspace.css`)

| Class / keyframe | Purpose |
|------------------|---------|
| `.workspace-root` | Sets `--ws-ease`, `--ws-dur`, all `--ws-wire-*` vars |
| `.workspace-grid-surface` | Radial dot grid, masked to fade at edges |
| `.workspace-handle` | 22×22 hit area, 9×9 visible dot, hover scales to 1.35× |
| `.workspace-node-shell[data-state]` | Ring per status: `selected` / `processing` / `done` / `error` |
| `@keyframes ws-glow-blue` | Pulsing blue ring for `processing` |
| `@keyframes ws-flow` | Dashed wire animation for live edges |
| `@keyframes ws-draw-edge` | Available for future: draw-on-connect (needs `--path-length`) |

All transitions use the same `200ms cubic-bezier(0.4, 0, 0.2, 1)`
easing. Colors and durations are CSS variables — designer can
re-theme without touching components.

## State model (Zustand)

```ts
canvases: { id, name, updatedAt }[]
current:  { id, name, nodes: WorkspaceNode[], edges: WorkspaceEdge[] } | null
selectedNodeId: string | null

// Per-node data shape
ToolNodeData {
  toolId: string
  params: Record<string, string | number>
  preview?: { type, url?, text? }       // set by future Run wiring
  status?: "idle" | "processing" | "done" | "error"  // drives node ring
}
```

**Persistence:** none yet for graph (Zustand in-memory). Viewport
(zoom + pan) **is** persisted per canvas via
`localStorage["workspace-viewport-{canvasId}"]` so reopening a canvas
returns the user to the same camera position.

## What the design pass should add

These were intentionally left raw so the designer has room. Priorities,
roughly in order:

1. **Replace the static left palette with a "+ New Node" floating
   drawer.** The drawer should: keyword search at top, categorized
   list, surface "favorites" + "recent" from localStorage. Frees
   horizontal canvas space (the legacy editor's biggest complaint).
2. **Floating bottom toolbar** for cursor modes: Select / Pan /
   Scissor (cut edge) / Group / Duplicate. Mirrors industry pattern
   (Figma, ComfyUI). Replaces the always-visible right-panel pattern.
3. **Inline params in the node body** (collapsed "Settings" section
   like the legacy node editor's collapsed groups). The right panel
   then becomes a *Preview-only* panel — bigger, focused on the
   generated output.
4. **Result reveal animation** for generated images/videos (multi-
   property: opacity + blur + brightness + saturate + scale).
   Renders inside each node's compact preview area.
5. **Connection affordance:** when an input port is connected, show
   "Receiving input" state in the corresponding param row instead of
   the empty input.
6. **Node hover handle preview:** hovering an output handle shows a
   tiny tooltip with the data type and (when status=done) a preview
   thumbnail.
7. **Brand polish:** typography, spacing, dark theme tuned to
   MediaForge's existing tokens (see `src/index.css`). Wireframe
   uses raw zinc-* — must be retuned.

## Out of scope for this wireframe

- Backend persistence (no Supabase wiring; refresh wipes the graph)
- Auth gate (any user can hit `/app/workspace`)
- Real tool execution (Run button is disabled)
- Sharing / team / SSO (planned next phase)
- Mobile layout (desktop-only for now — agency/uni use case)

## Files touched outside `workspace/`

- `src/App.tsx` — added 2 lazy routes
- `src/components/home/DashboardSidebar.tsx` — added `Layers` nav item
- `src/store/useWorkspaceStore.ts` — new file, but lives under `src/store/`

Keep these in mind when refactoring sidebar / routing.
