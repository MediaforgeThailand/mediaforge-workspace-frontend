import { describe, it, expect, beforeEach, vi } from "vitest";
import { useWorkspaceStore, DEFAULT_PROJECT_NAME } from "../useWorkspaceStore";

/** Reset the singleton store between tests so each test runs against a
 *  freshly-mounted state (matches the store's first-load layout). */
function resetStore() {
  // Stamp a deterministic project + activeProjectId so cross-test
  // assertions stay stable. The store always boots with one
  // "Default project" so creating workspaces without a project
  // argument has somewhere to attach them.
  useWorkspaceStore.setState({
    projects: [
      { id: "p_default", name: DEFAULT_PROJECT_NAME, updatedAt: 0 },
    ],
    activeProjectId: "p_default",
    workspaces: [],
    canvases: [],
    graphs: {},
    current: null,
    selectedNodeId: null,
    deletedWorkspaceIds: {},
    history: [],
    redoStack: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createWorkspace — initial state", () => {
  it("creates a workspace with one default Page 1 canvas", () => {
    const { workspaceId, canvasId } = useWorkspaceStore
      .getState()
      .createWorkspace("My space");

    const s = useWorkspaceStore.getState();
    expect(s.workspaces).toHaveLength(1);
    expect(s.workspaces[0].id).toBe(workspaceId);
    expect(s.workspaces[0].name).toBe("My space");
    expect(s.canvases).toHaveLength(1);
    expect(s.canvases[0].id).toBe(canvasId);
    expect(s.canvases[0].name).toBe("Page 1");
    expect(s.current?.id).toBe(canvasId);
    expect(s.current?.nodes).toEqual([]);
  });

  it("falls back to 'Untitled workspace' when name is empty", () => {
    useWorkspaceStore.getState().createWorkspace("");
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe(
      "Untitled workspace",
    );
  });

  it("resets history and redo stacks when a new workspace is created", () => {
    useWorkspaceStore.setState({
      history: [{ nodes: [], edges: [] }],
      redoStack: [{ nodes: [], edges: [] }],
    });
    useWorkspaceStore.getState().createWorkspace("X");
    const s = useWorkspaceStore.getState();
    expect(s.history).toEqual([]);
    expect(s.redoStack).toEqual([]);
  });

  it("attaches the new workspace to the active project", () => {
    useWorkspaceStore.setState({
      projects: [
        { id: "p1", name: "P1", updatedAt: 0 },
        { id: "p2", name: "P2", updatedAt: 0 },
      ],
      activeProjectId: "p2",
    });
    useWorkspaceStore.getState().createWorkspace("X");
    expect(useWorkspaceStore.getState().workspaces[0].projectId).toBe("p2");
  });

  it("can override the project explicitly", () => {
    useWorkspaceStore.setState({
      projects: [
        { id: "p1", name: "P1", updatedAt: 0 },
        { id: "p2", name: "P2", updatedAt: 0 },
      ],
      activeProjectId: "p1",
    });
    useWorkspaceStore.getState().createWorkspace("X", "p2");
    expect(useWorkspaceStore.getState().workspaces[0].projectId).toBe("p2");
  });
});

describe("undo / redo cycle", () => {
  it("addSchemaNode pushes a snapshot onto history", () => {
    useWorkspaceStore.getState().createWorkspace("X");
    useWorkspaceStore
      .getState()
      .addSchemaNode("textNode", "T", { x: 0, y: 0 });
    const s = useWorkspaceStore.getState();
    expect(s.history).toHaveLength(1);
    expect(s.current?.nodes).toHaveLength(1);
  });

  it("undo restores the previous snapshot and feeds redo", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    store.addSchemaNode("textNode", "T", { x: 0, y: 0 });
    store.undo();

    const s = useWorkspaceStore.getState();
    expect(s.current?.nodes).toEqual([]);
    expect(s.history).toHaveLength(0);
    expect(s.redoStack).toHaveLength(1);
  });

  it("redo replays the last undone snapshot", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    store.addSchemaNode("textNode", "T", { x: 0, y: 0 });
    store.undo();
    store.redo();

    const s = useWorkspaceStore.getState();
    expect(s.current?.nodes).toHaveLength(1);
    expect(s.redoStack).toHaveLength(0);
  });

  it("undo is a no-op when history is empty", () => {
    useWorkspaceStore.getState().createWorkspace("X");
    const before = useWorkspaceStore.getState().current?.nodes;
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().current?.nodes).toBe(before);
  });

  it("redo is a no-op when redoStack is empty", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    store.addSchemaNode("textNode", "T", { x: 0, y: 0 });
    const before = useWorkspaceStore.getState().current?.nodes;
    store.redo();
    expect(useWorkspaceStore.getState().current?.nodes).toBe(before);
  });

  it("a fresh mutation after undo clears the redo stack", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    store.addSchemaNode("textNode", "T", { x: 0, y: 0 });
    store.undo();
    expect(useWorkspaceStore.getState().redoStack).toHaveLength(1);

    store.addSchemaNode("textNode", "T2", { x: 0, y: 0 });
    expect(useWorkspaceStore.getState().redoStack).toEqual([]);
  });

  it("history is bounded at 80 entries (HISTORY_LIMIT)", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    // Add 90 nodes — each addSchemaNode pushes one history entry.
    for (let i = 0; i < 90; i++) {
      useWorkspaceStore
        .getState()
        .addSchemaNode("textNode", `T${i}`, { x: 0, y: 0 });
    }
    expect(useWorkspaceStore.getState().history.length).toBeLessThanOrEqual(80);
  });

  it("pushHistory directly snapshots the current canvas", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    store.pushHistory();
    expect(useWorkspaceStore.getState().history).toHaveLength(1);
  });

  it("pushHistory clears the redo stack", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    useWorkspaceStore.setState({ redoStack: [{ nodes: [], edges: [] }] });
    store.pushHistory();
    expect(useWorkspaceStore.getState().redoStack).toEqual([]);
  });
});

describe("deleteWorkspace — cascade + tombstone", () => {
  it("removes the workspace and all its canvases", () => {
    const store = useWorkspaceStore.getState();
    const { workspaceId, canvasId } = store.createWorkspace("X");
    store.deleteWorkspace(workspaceId);

    const s = useWorkspaceStore.getState();
    expect(s.workspaces.find((w) => w.id === workspaceId)).toBeUndefined();
    expect(s.canvases.find((c) => c.id === canvasId)).toBeUndefined();
    expect(s.graphs[canvasId]).toBeUndefined();
  });

  it("clears `current` if the active canvas belonged to the deleted workspace", () => {
    const store = useWorkspaceStore.getState();
    const { workspaceId } = store.createWorkspace("X");
    expect(useWorkspaceStore.getState().current).not.toBeNull();
    store.deleteWorkspace(workspaceId);
    expect(useWorkspaceStore.getState().current).toBeNull();
  });

  it("preserves `current` if it belongs to a different workspace", () => {
    const store = useWorkspaceStore.getState();
    const a = store.createWorkspace("A");
    const b = store.createWorkspace("B");
    // After the second create, `current` is B's canvas. Delete A:
    store.deleteWorkspace(a.workspaceId);
    expect(useWorkspaceStore.getState().current?.id).toBe(b.canvasId);
  });

  it("records a tombstone with the deletion timestamp", () => {
    const store = useWorkspaceStore.getState();
    const { workspaceId } = store.createWorkspace("X");
    const before = Date.now();
    store.deleteWorkspace(workspaceId);
    const ts = useWorkspaceStore.getState().deletedWorkspaceIds[workspaceId];
    expect(ts).toBeDefined();
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});

describe("renameWorkspace", () => {
  it("updates name + updatedAt for the matching workspace only", () => {
    const store = useWorkspaceStore.getState();
    const a = store.createWorkspace("A");
    const b = store.createWorkspace("B");

    store.renameWorkspace(a.workspaceId, "A renamed");

    const s = useWorkspaceStore.getState();
    const renamedA = s.workspaces.find((w) => w.id === a.workspaceId);
    const untouchedB = s.workspaces.find((w) => w.id === b.workspaceId);
    expect(renamedA?.name).toBe("A renamed");
    expect(untouchedB?.name).toBe("B");
  });

  it("is a no-op when the id doesn't match any workspace", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("A");
    const before = useWorkspaceStore.getState().workspaces;
    store.renameWorkspace("nonexistent-id", "X");
    expect(useWorkspaceStore.getState().workspaces).toEqual(before);
  });
});

describe("addSchemaNode", () => {
  it("returns the new node id", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    const id = store.addSchemaNode("textNode", "T", { x: 10, y: 20 });
    expect(id).toMatch(/^n_/);
  });

  it("attaches the node to the current canvas at the given position", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    const id = store.addSchemaNode("textNode", "T", { x: 10, y: 20 });
    const node = useWorkspaceStore
      .getState()
      .current?.nodes.find((n) => n.id === id);
    expect(node?.position).toEqual({ x: 10, y: 20 });
    expect(node?.type).toBe("textNode");
  });

  it("seeds textNode params with empty content", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    const id = store.addSchemaNode("textNode", "T", { x: 0, y: 0 });
    const node = useWorkspaceStore
      .getState()
      .current?.nodes.find((n) => n.id === id);
    expect(node?.data).toMatchObject({ content: "", params: {} });
  });
});

describe("updateNodeData", () => {
  it("merges patch into the matching node's data without touching others", () => {
    const store = useWorkspaceStore.getState();
    store.createWorkspace("X");
    const a = store.addSchemaNode("textNode", "A", { x: 0, y: 0 });
    const b = store.addSchemaNode("textNode", "B", { x: 0, y: 0 });

    store.updateNodeData(a, { content: "hello" });

    const nodes = useWorkspaceStore.getState().current?.nodes ?? [];
    const aNode = nodes.find((n) => n.id === a);
    const bNode = nodes.find((n) => n.id === b);
    expect((aNode?.data as { content?: string }).content).toBe("hello");
    expect((bNode?.data as { content?: string }).content).toBe("");
  });
});
