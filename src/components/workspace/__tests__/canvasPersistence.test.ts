import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Build a chainable mock Supabase query — every chained method returns
 * `this`, the terminal `await` resolves to whatever `result` is set to.
 *
 * Tests configure behavior via the table-name routing below.
 */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => Promise.resolve(result)),
    upsert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

const tableHandlers = new Map<string, () => unknown>();
const fromMock = vi.fn((tableName: string) => {
  const handler = tableHandlers.get(tableName);
  if (!handler) {
    return makeChain({ data: null, error: { code: "42P01", message: `relation public.${tableName} does not exist` } });
  }
  return handler();
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tableName: string) => fromMock(tableName),
    auth: { getSession: vi.fn() },
  },
}));

import {
  loadCanvasFromServer,
  listServerCanvasIds,
  loadCanvasesByWorkspaceFromServer,
  loadLatestCanvasPreviewsByWorkspaceIds,
  saveCanvasToServer,
  deleteCanvasFromServer,
  loadWorkspacesFromServer,
  upsertWorkspaceToServer,
  deleteWorkspaceFromServer,
  loadProjectsFromServer,
  upsertProjectToServer,
  deleteProjectFromServer,
} from "../canvasPersistence";

beforeEach(() => {
  tableHandlers.clear();
  fromMock.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const sampleCanvasRow = {
  id: "canvas-1",
  user_id: "user-1",
  project_id: "proj-1",
  workspace_id: "ws-1",
  name: "My canvas",
  nodes: [{ id: "n1" }],
  edges: [{ id: "e1" }],
  viewport: { x: 0, y: 0, zoom: 1 },
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
  revision: 3,
};

describe("loadCanvasFromServer", () => {
  it("returns a CanvasGraph shaped from the row", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: sampleCanvasRow, error: null }),
    );
    const result = await loadCanvasFromServer("canvas-1");
    expect(result).toMatchObject({
      id: "canvas-1",
      ownerId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
      name: "My canvas",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      serverRevision: 3,
    });
    expect(result?.updatedAt).toBe(new Date("2025-01-02T00:00:00Z").getTime());
  });

  it("returns null when the row is not found", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: null, error: null }),
    );
    expect(await loadCanvasFromServer("missing")).toBeNull();
  });

  it("returns null and logs when the table is missing (42P01)", async () => {
    // default tableHandlers (no entry) returns 42P01
    expect(await loadCanvasFromServer("any")).toBeNull();
  });

  it("coerces non-array nodes/edges to empty arrays", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({
        data: { ...sampleCanvasRow, nodes: "garbage", edges: null },
        error: null,
      }),
    );
    const result = await loadCanvasFromServer("canvas-1");
    expect(result?.nodes).toEqual([]);
    expect(result?.edges).toEqual([]);
  });
});

describe("listServerCanvasIds", () => {
  it("returns a Set of ids on success", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: [{ id: "a" }, { id: "b" }], error: null }),
    );
    const ids = await listServerCanvasIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids?.has("a")).toBe(true);
    expect(ids?.has("b")).toBe(true);
  });

  it("returns null when the table is missing", async () => {
    expect(await listServerCanvasIds()).toBeNull();
  });

  it("returns an empty Set if data is not an array", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: null, error: null }),
    );
    const ids = await listServerCanvasIds();
    expect(ids).toEqual(new Set());
  });
});

describe("loadCanvasesByWorkspaceFromServer", () => {
  it("maps each row to a CanvasGraph", async () => {
    const rows = [sampleCanvasRow, { ...sampleCanvasRow, id: "canvas-2" }];
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: rows, error: null }),
    );
    const result = await loadCanvasesByWorkspaceFromServer("ws-1");
    expect(result).toHaveLength(2);
    expect(result?.[0].id).toBe("canvas-1");
  });

  it("returns null on missing table", async () => {
    expect(await loadCanvasesByWorkspaceFromServer("ws-1")).toBeNull();
  });
});

describe("loadLatestCanvasPreviewsByWorkspaceIds", () => {
  it("returns [] for empty input", async () => {
    expect(await loadLatestCanvasPreviewsByWorkspaceIds([])).toEqual([]);
  });

  it("dedupes input ids before querying", async () => {
    const handler = vi.fn(() =>
      makeChain({ data: [sampleCanvasRow], error: null }),
    );
    tableHandlers.set("workspace_canvases", handler);
    await loadLatestCanvasPreviewsByWorkspaceIds(["ws-1", "ws-1", "ws-1"]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("prefers content-bearing canvas over an empty one for the same workspace", async () => {
    const empty = { ...sampleCanvasRow, id: "empty", nodes: [], updated_at: "2025-02-01T00:00:00Z" };
    const filled = { ...sampleCanvasRow, id: "filled", nodes: [{ id: "n1" }], updated_at: "2025-01-01T00:00:00Z" };
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ data: [empty, filled], error: null }),
    );
    const result = await loadLatestCanvasPreviewsByWorkspaceIds(["ws-1"]);
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("filled");
  });
});

describe("saveCanvasToServer", () => {
  it("returns ok=true on success", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ error: null }),
    );
    const graph = {
      id: "c1",
      ownerId: "u1",
      projectId: null,
      workspaceId: "ws1",
      name: "n",
      nodes: [],
      edges: [],
    };
    expect(await saveCanvasToServer(graph as never, "u1")).toEqual({ ok: true, revision: null });
  });

  it("blocks stale local saves that would strip existing node data", async () => {
    const existingNodes = Array.from({ length: 4 }, (_, index) => ({
      id: `n${index}`,
      type: "imageGenNode",
      data: {
        label: "Image Generation",
        params: { prompt: `detailed prompt ${index}` },
        generations: [{ url: `https://example.test/${index}.png` }],
      },
    }));
    const incomingNodes = existingNodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: { label: "Image Generation", params: { prompt: "" } },
    }));
    const handler = vi.fn()
      .mockReturnValueOnce(makeChain({
        data: {
          id: "c1",
          nodes: existingNodes,
          edges: [{ id: "e1" }],
          viewport: null,
          revision: 12,
          updated_at: "2026-05-13T08:00:00Z",
        },
        error: null,
      }))
      .mockReturnValueOnce(makeChain({ error: null }));
    tableHandlers.set("workspace_canvases", handler);

    const result = await saveCanvasToServer({
      id: "c1",
      ownerId: "u1",
      projectId: null,
      workspaceId: "ws1",
      name: "n",
      nodes: incomingNodes,
      edges: [{ id: "e1" }],
    } as never, "u1");

    expect(result.ok).toBe(false);
    expect(result.staleLocal).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns tableMissing=true when the canvases table is gone", async () => {
    const graph = {
      id: "c1",
      ownerId: "u1",
      projectId: null,
      workspaceId: "ws1",
      name: "n",
      nodes: [],
      edges: [],
    };
    const result = await saveCanvasToServer(graph as never, "u1");
    expect(result.ok).toBe(false);
    expect(result.tableMissing).toBe(true);
  });

  it("returns ok=false with error string on other errors", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ error: { code: "42501", message: "RLS rejected" } }),
    );
    const graph = {
      id: "c1",
      ownerId: "u1",
      projectId: null,
      workspaceId: "ws1",
      name: "n",
      nodes: [],
      edges: [],
    };
    const result = await saveCanvasToServer(graph as never, "u1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RLS rejected/);
  });
});

describe("deleteCanvasFromServer", () => {
  it("resolves silently when delete succeeds", async () => {
    tableHandlers.set("workspace_canvases", () =>
      makeChain({ error: null }),
    );
    await expect(deleteCanvasFromServer("c1")).resolves.toBeUndefined();
  });

  it("does not throw when the table is missing", async () => {
    await expect(deleteCanvasFromServer("c1")).resolves.toBeUndefined();
  });
});

describe("loadWorkspacesFromServer", () => {
  it("maps each row to WorkspaceMeta", async () => {
    const rows = [
      {
        id: "w1",
        user_id: "u1",
        project_id: "p1",
        class_id: null,
        education_status: null,
        education_completed_at: null,
        name: "Workspace 1",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
    ];
    tableHandlers.set("workspaces", () => makeChain({ data: rows, error: null }));
    const result = await loadWorkspacesFromServer();
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      id: "w1",
      ownerId: "u1",
      projectId: "p1",
      classId: null,
      name: "Workspace 1",
    });
  });

  it("returns null when the workspaces table is missing", async () => {
    expect(await loadWorkspacesFromServer()).toBeNull();
  });
});

describe("upsertWorkspaceToServer", () => {
  it("rejects with 'Missing user id' when userId is empty", async () => {
    const meta = { id: "w1", name: "x" };
    expect(await upsertWorkspaceToServer(meta as never, "")).toEqual({
      ok: false,
      error: "Missing user id",
    });
  });

  it("returns ok=true when the insert succeeds first try", async () => {
    tableHandlers.set("workspaces", () => makeChain({ error: null }));
    const meta = { id: "w1", name: "x" };
    expect(await upsertWorkspaceToServer(meta as never, "u1")).toEqual({ ok: true });
  });

  it("falls back to UPDATE when INSERT hits a duplicate-key (23505)", async () => {
    let callIndex = 0;
    tableHandlers.set("workspaces", () => {
      callIndex += 1;
      if (callIndex === 1) {
        // First call: INSERT returns 23505
        return makeChain({ error: { code: "23505", message: "duplicate key value violates unique constraint" } });
      }
      // Second call: UPDATE succeeds
      return makeChain({ error: null });
    });
    const meta = { id: "w1", name: "x" };
    expect(await upsertWorkspaceToServer(meta as never, "u1")).toEqual({ ok: true });
    expect(callIndex).toBe(2);
  });

  it("returns tableMissing when INSERT hits 42P01", async () => {
    const meta = { id: "w1", name: "x" };
    const result = await upsertWorkspaceToServer(meta as never, "u1");
    expect(result.ok).toBe(false);
    expect(result.tableMissing).toBe(true);
  });
});

describe("deleteWorkspaceFromServer", () => {
  it("deletes canvases first, then the workspace row", async () => {
    const callOrder: string[] = [];
    tableHandlers.set("workspace_canvases", () => {
      callOrder.push("workspace_canvases");
      return makeChain({ error: null });
    });
    tableHandlers.set("workspaces", () => {
      callOrder.push("workspaces");
      return makeChain({ error: null });
    });
    await deleteWorkspaceFromServer("w1");
    expect(callOrder).toEqual(["workspace_canvases", "workspaces"]);
  });

  it("does not throw when both tables are missing", async () => {
    await expect(deleteWorkspaceFromServer("w1")).resolves.toBeUndefined();
  });
});

describe("loadProjectsFromServer", () => {
  it("maps each row to ProjectMeta with isPrivate booleanised", async () => {
    const rows = [
      {
        id: "p1",
        user_id: "u1",
        name: "Project 1",
        description: null,
        color: null,
        is_private: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
    ];
    tableHandlers.set("workspace_projects", () =>
      makeChain({ data: rows, error: null }),
    );
    const result = await loadProjectsFromServer();
    expect(result?.[0]).toMatchObject({
      id: "p1",
      ownerId: "u1",
      isPrivate: true,
    });
  });

  it("returns null when the projects table is missing", async () => {
    expect(await loadProjectsFromServer()).toBeNull();
  });
});

describe("upsertProjectToServer", () => {
  it("returns 'Missing user id' for empty userId", async () => {
    const meta = { id: "p1", name: "x" };
    expect(await upsertProjectToServer(meta as never, "")).toEqual({
      ok: false,
      error: "Missing user id",
    });
  });

  it("returns ok=true on successful upsert", async () => {
    tableHandlers.set("workspace_projects", () => makeChain({ error: null }));
    const meta = { id: "p1", name: "x" };
    expect(await upsertProjectToServer(meta as never, "u1")).toEqual({ ok: true });
  });
});

describe("deleteProjectFromServer", () => {
  it("cascades through generation_events, jobs, assets, canvases, workspaces, then deletes the project row", async () => {
    const callOrder: string[] = [];
    for (const t of [
      "workspace_generation_events",
      "workspace_generation_jobs",
      "user_assets",
      "workspace_canvases",
      "workspaces",
      "workspace_projects",
    ]) {
      tableHandlers.set(t, () => {
        callOrder.push(t);
        return makeChain({ error: null });
      });
    }
    await deleteProjectFromServer("p1");
    expect(callOrder).toEqual([
      "workspace_generation_events",
      "workspace_generation_jobs",
      "user_assets",
      "workspace_canvases",
      "workspaces",
      "workspace_projects",
    ]);
  });

  it("treats 42P01 (missing table) and 42703 (missing column) as cascadeable no-ops", async () => {
    // No table handlers — every from(t).delete().eq(...) returns 42P01.
    // deleteProjectFromServer should still try to reach workspace_projects last.
    await expect(deleteProjectFromServer("p1")).resolves.toBeUndefined();
  });
});
