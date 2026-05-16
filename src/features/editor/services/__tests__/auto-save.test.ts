import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/openreel-core";
import { AutoSaveManager } from "../auto-save";

vi.mock("../../bridges/transition-bridge", () => ({
  getTransitionBridge: () => ({
    serializeIntoProject: (project: Project) => project,
  }),
}));

vi.mock("../project-cloud", () => ({
  scheduleCloudSave: vi.fn(),
}));

function createProject(name: string, modifiedAt: number): Project {
  return {
    id: "project-1",
    name,
    createdAt: 1,
    modifiedAt,
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

function spyOnSave(manager: AutoSaveManager) {
  return vi
    .spyOn(
      manager as unknown as { save: (project: Project) => Promise<void> },
      "save",
    )
    .mockResolvedValue(undefined);
}

describe("AutoSaveManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounced saves use the latest project snapshot", async () => {
    const manager = new AutoSaveManager({
      debounceTime: 10,
      interval: 60_000,
    });
    const saveSpy = spyOnSave(manager);
    let currentProject = createProject("initial", 1);

    manager.start(() => currentProject);
    currentProject = createProject("latest edit", 2);
    manager.markDirty();

    await vi.advanceTimersByTimeAsync(10);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0].name).toBe("latest edit");
    manager.destroy();
  });

  it("flush clears the debounce timer and saves immediately", async () => {
    const manager = new AutoSaveManager({
      debounceTime: 1_000,
      interval: 60_000,
    });
    const saveSpy = spyOnSave(manager);
    let currentProject = createProject("initial", 1);

    manager.start(() => currentProject);
    currentProject = createProject("before close", 2);
    manager.markDirty();

    await manager.flush();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0].name).toBe("before close");
    manager.destroy();
  });

  it("does not drop edits that happen while a save is in flight", async () => {
    const manager = new AutoSaveManager({
      debounceTime: 10,
      interval: 60_000,
    });
    let resolveFirstSave: (() => void) | null = null;
    const saveSpy = spyOnSave(manager);
    saveSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    let currentProject = createProject("first edit", 2);
    manager.start(() => currentProject);
    manager.markDirty();

    const flushPromise = manager.flush();
    currentProject = createProject("second edit", 3);
    manager.markDirty();

    resolveFirstSave?.();
    await flushPromise;

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy.mock.calls[1][0].name).toBe("second edit");
    manager.destroy();
  });
});
