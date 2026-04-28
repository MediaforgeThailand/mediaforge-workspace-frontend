/**
 * Workspace keyboard shortcuts.
 *
 * Mounts a single window-level `keydown` listener and routes each
 * combo to the matching action. The shortcut table mirrors the
 * Photoshop / Figma / Krea conventions the UI cribs from:
 *
 *   ── Basics ──
 *     Ctrl+C / X / V          copy / cut / paste
 *     Ctrl+Shift+V            paste without connections
 *     Ctrl+D                  duplicate
 *     Ctrl+Shift+D            duplicate without connections
 *     Ctrl+A                  select all
 *     Ctrl+Z / Ctrl+Shift+Z   undo / redo (best-effort, history is shallow)
 *
 *   ── Control ──
 *     Delete / Backspace      delete selection (handled by ReactFlow)
 *     Esc                     clear selection
 *     N                       open Add Node picker (centre of viewport)
 *     Ctrl+Enter              Run selected node(s)
 *     Ctrl+Shift+Enter        Run every tool node on canvas
 *     ← / →                   previous / next generation on selected tool node
 *
 *   ── Navigation ──
 *     D                       zoom to fit (entire graph)
 *     F                       zoom to selection
 *     Ctrl+0                  reset viewport to {0,0,1}
 *
 * Single-letter shortcuts are suppressed while the user is typing
 * inside an input / textarea / contentEditable so the prompt fields
 * still behave normally. Modifier-based combos (Ctrl+*, Esc) work
 * everywhere since they don't collide with normal typing.
 */

import { useCallback, useEffect, useRef } from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";

interface ClipboardSnapshot {
  nodes: Node[];
  /** Edges where BOTH endpoints sit inside the copy set. */
  edges: Edge[];
}

interface ShortcutOptions {
  /** Called when the user presses `N`. Implementations should open
   *  the node picker at a sensible location (e.g. viewport centre). */
  onAddNode?: () => void;
  /** Called when the user presses `A` with a node selected. The
   *  callback should open a fullscreen preview of that node. */
  onPreviewSelected?: () => void;
}

const NEW_ID = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function useWorkspaceShortcuts({
  onAddNode,
  onPreviewSelected,
}: ShortcutOptions = {}) {
  const rf = useReactFlow();
  const clipboardRef = useRef<ClipboardSnapshot | null>(null);
  const cursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  /* ── Track cursor for paste-at-cursor positioning ───────── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  /* ── Selection ───────────────────────────────────────────── */
  const selectAll = useCallback(() => {
    rf.setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    rf.setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [rf]);

  const clearSelection = useCallback(() => {
    rf.setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    rf.setEdges((eds) => eds.map((e) => (e.selected ? { ...e, selected: false } : e)));
  }, [rf]);

  /* ── Clipboard ───────────────────────────────────────────── */
  const copySelection = useCallback((): ClipboardSnapshot | null => {
    const selectedNodes = rf.getNodes().filter((n) => n.selected);
    if (selectedNodes.length === 0) return null;
    const ids = new Set(selectedNodes.map((n) => n.id));
    const internalEdges = rf
      .getEdges()
      .filter((e) => ids.has(e.source) && ids.has(e.target));
    const snap: ClipboardSnapshot = {
      // Deep-clone so future mutations on the canvas don't mutate the
      // clipboard payload (React Flow shares object refs by default).
      nodes: selectedNodes.map((n) => ({
        ...n,
        position: { ...n.position },
        data: structuredClone(n.data),
      })),
      edges: internalEdges.map((e) => ({ ...e })),
    };
    clipboardRef.current = snap;
    return snap;
  }, [rf]);

  const cutSelection = useCallback(() => {
    const snap = copySelection();
    if (!snap) return;
    // Belt-and-braces snapshot for shortcut-driven mutations.
    useWorkspaceStore.getState().pushHistory();
    const ids = new Set(snap.nodes.map((n) => n.id));
    rf.setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    rf.setEdges((eds) =>
      eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
    );
  }, [rf, copySelection]);

  const pasteFrom = useCallback(
    (snap: ClipboardSnapshot, withConnections: boolean) => {
      if (snap.nodes.length === 0) return;
      useWorkspaceStore.getState().pushHistory();

      // Position offset = cursor (in flow coords) → top-left of the
      // copy bounding box. Falls back to a +40 / +40 nudge if cursor
      // hasn't been tracked yet (window blur / cold render).
      const cursorFlow = rf.screenToFlowPosition(cursorRef.current);
      const minX = Math.min(...snap.nodes.map((n) => n.position.x));
      const minY = Math.min(...snap.nodes.map((n) => n.position.y));
      const dx = isFinite(cursorFlow.x) ? cursorFlow.x - minX : 40;
      const dy = isFinite(cursorFlow.y) ? cursorFlow.y - minY : 40;

      const idMap = new Map<string, string>();
      const newNodes: Node[] = snap.nodes.map((n) => {
        const nid = NEW_ID();
        idMap.set(n.id, nid);
        return {
          ...n,
          id: nid,
          position: { x: n.position.x + dx, y: n.position.y + dy },
          selected: true,
          // Reset transient UI state so a copied "processing" node
          // doesn't paste with a leftover spinner.
          data: { ...(structuredClone(n.data) as Record<string, unknown>), status: "idle" },
        };
      });

      // Deselect everything else so the freshly-pasted set IS the new
      // selection — matches Figma / Photoshop expectations.
      rf.setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...newNodes,
      ]);

      if (withConnections) {
        const newEdges: Edge[] = snap.edges.map((e) => ({
          ...e,
          id: NEW_ID(),
          source: idMap.get(e.source) ?? e.source,
          target: idMap.get(e.target) ?? e.target,
          selected: false,
        }));
        rf.setEdges((eds) => [
          ...eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
          ...newEdges,
        ]);
      } else {
        rf.setEdges((eds) =>
          eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
        );
      }
    },
    [rf],
  );

  const pasteFromClipboard = useCallback(
    (withConnections: boolean) => {
      const snap = clipboardRef.current;
      if (!snap) return;
      pasteFrom(snap, withConnections);
    },
    [pasteFrom],
  );

  const duplicateSelection = useCallback(
    (withConnections: boolean) => {
      const snap = copySelection();
      if (!snap) return;
      pasteFrom(snap, withConnections);
    },
    [copySelection, pasteFrom],
  );

  /* ── Viewport ────────────────────────────────────────────── */
  const zoomToFit = useCallback(() => {
    rf.fitView({ duration: 300, padding: 0.1 });
  }, [rf]);

  const zoomToSelection = useCallback(() => {
    const sel = rf.getNodes().filter((n) => n.selected);
    if (sel.length === 0) {
      // Fall back to fit-all so the key isn't a no-op.
      rf.fitView({ duration: 300, padding: 0.1 });
      return;
    }
    rf.fitView({ duration: 300, padding: 0.2, nodes: sel });
  }, [rf]);

  const resetView = useCallback(() => {
    rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [rf]);

  /* ── Generation flip (← / →) ────────────────────────────── */
  const flipGeneration = useCallback(
    (delta: -1 | 1) => {
      const sel = rf.getNodes().find((n) => n.selected);
      if (!sel) return;
      const data = (sel.data ?? {}) as Record<string, unknown>;
      const gens = Array.isArray(data.generations)
        ? (data.generations as Array<unknown>)
        : [];
      if (gens.length < 2) return;
      const cur = typeof data.selectedGenIndex === "number" ? data.selectedGenIndex : 0;
      const next = Math.max(0, Math.min(gens.length - 1, cur + delta));
      if (next === cur) return;
      rf.setNodes((nds) =>
        nds.map((n) =>
          n.id === sel.id
            ? { ...n, data: { ...n.data, selectedGenIndex: next } }
            : n,
        ),
      );
    },
    [rf],
  );

  /* ── Run dispatch (event-based) ──────────────────────────── */
  // WorkspaceToolNode listens for these events; payload `nodeId` is
  // matched against the node's React Flow id. Using window events
  // lets us avoid lifting `runNode` into a global store action just
  // to wire up shortcuts.
  const runSelected = useCallback(() => {
    const ids = rf
      .getNodes()
      .filter((n) => n.selected)
      .map((n) => n.id);
    for (const id of ids) {
      window.dispatchEvent(
        new CustomEvent("workspace-run-shortcut", { detail: { nodeId: id } }),
      );
    }
  }, [rf]);

  const runAll = useCallback(() => {
    // No topo sort yet — emit the event for every tool-shaped node and
    // let each one run independently. Downstream nodes that depend on
    // upstream outputs may need a second pass (or use Run-selected on
    // the leaves first). Documented as known V2 limitation.
    const TOOL_TYPES = new Set([
      "imageGenNode",
      "videoGenNode",
      "removeBackgroundNode",
      "mergeAudioNode",
      "videoToPromptNode",
      "chatAiNode",
      "bananaProNode",
      "klingVideoNode",
    ]);
    const ids = rf
      .getNodes()
      .filter((n) => n.type && TOOL_TYPES.has(n.type))
      .map((n) => n.id);
    for (const id of ids) {
      window.dispatchEvent(
        new CustomEvent("workspace-run-shortcut", { detail: { nodeId: id } }),
      );
    }
  }, [rf]);

  /* ── Keyboard router ─────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key;
      const lower = k.toLowerCase();

      /* ── Esc — always wins, even while typing ── */
      if (k === "Escape") {
        if (isTyping) {
          (target as HTMLElement)?.blur();
        }
        clearSelection();
        return;
      }

      /* ── Ctrl-modified combos. Skip while typing in form fields
       *    so native browser shortcuts (Ctrl+C copy text, Ctrl+A
       *    select-all text) still work inside inputs. ── */
      if (ctrl && !isTyping) {
        if (lower === "a") {
          e.preventDefault();
          selectAll();
          return;
        }
        if (lower === "c") {
          e.preventDefault();
          copySelection();
          return;
        }
        if (lower === "x") {
          e.preventDefault();
          cutSelection();
          return;
        }
        if (lower === "v") {
          e.preventDefault();
          pasteFromClipboard(!shift);
          return;
        }
        if (lower === "d") {
          e.preventDefault();
          duplicateSelection(!shift);
          return;
        }
        if (lower === "0") {
          e.preventDefault();
          resetView();
          return;
        }
        if (lower === "z") {
          // Ctrl+Z = undo, Ctrl+Shift+Z = redo. Most editors also
          // accept Ctrl+Y for redo; we wire both for muscle-memory
          // compatibility. Empty-stack case shows a tiny toast so
          // the user knows the shortcut DID fire — silence felt
          // like the keybind was broken.
          e.preventDefault();
          const store = useWorkspaceStore.getState();
          if (shift) {
            const before = store.redoStack.length;
            store.redo();
            if (before === 0) toast.info("Nothing to redo");
          } else {
            const before = store.history.length;
            store.undo();
            if (before === 0) toast.info("Nothing to undo");
          }
          return;
        }
        if (lower === "y") {
          e.preventDefault();
          const store = useWorkspaceStore.getState();
          const before = store.redoStack.length;
          store.redo();
          if (before === 0) toast.info("Nothing to redo");
          return;
        }
        if (lower === "enter") {
          e.preventDefault();
          if (shift) runAll();
          else runSelected();
          return;
        }
      }

      /* ── Single-letter shortcuts — only outside form fields. ── */
      if (isTyping) return;

      if (k === "ArrowLeft") {
        e.preventDefault();
        flipGeneration(-1);
        return;
      }
      if (k === "ArrowRight") {
        e.preventDefault();
        flipGeneration(1);
        return;
      }
      if (lower === "d" && !ctrl) {
        e.preventDefault();
        zoomToFit();
        return;
      }
      if (lower === "f" && !ctrl) {
        e.preventDefault();
        zoomToSelection();
        return;
      }
      if (lower === "n" && !ctrl) {
        e.preventDefault();
        onAddNode?.();
        return;
      }
      if (lower === "a" && !ctrl) {
        e.preventDefault();
        onPreviewSelected?.();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectAll,
    clearSelection,
    copySelection,
    cutSelection,
    pasteFromClipboard,
    duplicateSelection,
    resetView,
    zoomToFit,
    zoomToSelection,
    flipGeneration,
    runSelected,
    runAll,
    onAddNode,
    onPreviewSelected,
  ]);
}
