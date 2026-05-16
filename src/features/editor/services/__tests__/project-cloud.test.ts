import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/openreel-core";
import {
  flushCloudSave,
  scheduleCloudSave,
  setCloudSaveEnabled,
} from "../project-cloud";

const { upsertCalls, pendingUpserts } = vi.hoisted(() => ({
  upsertCalls: [] as Array<Record<string, unknown>>,
  pendingUpserts: [] as Array<() => void>,
}));

vi.mock("../../bridges/transition-bridge", () => ({
  getTransitionBridge: () => ({
    serializeIntoProject: (project: Project) => project,
  }),
}));

vi.mock("../supabase-client", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
  getSupabase: vi.fn(() => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) =>
        new Promise<{ error: null }>((resolve) => {
          upsertCalls.push(row);
          pendingUpserts.push(() => resolve({ error: null }));
        }),
    }),
  })),
}));

function createProject(name: string): Project {
  return {
    id: "project-1",
    name,
    createdAt: 1,
    modifiedAt: Date.now(),
    settings: {
      width: 1920,
      height: 1080,
      frameRate: 30,
      sampleRate: 48000,
      channels: 2,
    },
    mediaLibrary: { items: [] },
    timeline: {
      tracks: [],
      subtitles: [],
      duration: 0,
      markers: [],
    },
  };
}

describe("project-cloud save queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    upsertCalls.length = 0;
    pendingUpserts.length = 0;
    setCloudSaveEnabled(true);
  });

  afterEach(async () => {
    for (const resolve of pendingUpserts.splice(0)) {
      resolve();
    }
    await flushCloudSave();
    setCloudSaveEnabled(false);
    vi.useRealTimers();
  });

  it("flushes a pending timer immediately", async () => {
    scheduleCloudSave(createProject("pending"), 1_000);

    const flushPromise = flushCloudSave();
    await vi.waitFor(() => expect(upsertCalls).toHaveLength(1));
    pendingUpserts.shift()?.();
    await flushPromise;

    await vi.advanceTimersByTimeAsync(1_000);
    expect(upsertCalls).toHaveLength(1);
  });

  it("waits for an in-flight timer save before resolving", async () => {
    scheduleCloudSave(createProject("in flight"), 10);
    await vi.advanceTimersByTimeAsync(10);

    let resolved = false;
    const flushPromise = flushCloudSave().then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(upsertCalls).toHaveLength(1);
    expect(resolved).toBe(false);

    pendingUpserts.shift()?.();
    await flushPromise;
    expect(resolved).toBe(true);
  });
});
