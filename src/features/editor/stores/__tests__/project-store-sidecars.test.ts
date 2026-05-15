import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/openreel-core";

type ProjectStoreHook = typeof import("../project-store").useProjectStore;

let useProjectStore: ProjectStoreHook;

vi.mock("../../services/auto-save", () => ({
  autoSaveManager: {
    startAutoSave: vi.fn(),
    stopAutoSave: vi.fn(),
    triggerSave: vi.fn(),
    getRecentSaves: vi.fn().mockResolvedValue([]),
    loadSave: vi.fn(),
    deleteSave: vi.fn(),
  },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../bridges/media-bridge", () => ({
  getMediaBridge: vi.fn(() => ({
    isInitialized: vi.fn().mockReturnValue(true),
  })),
  initializeMediaBridge: vi.fn().mockResolvedValue(undefined),
}));

function emptyProject(name = "Loaded project"): Project {
  return {
    id: `project-${name}`,
    name,
    createdAt: Date.now(),
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

describe("ProjectStore sidecar clip engines", () => {
  beforeAll(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          measureText: vi.fn(() => ({ width: 0 })),
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          fillText: vi.fn(),
          strokeText: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          quadraticCurveTo: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
        }) as unknown as CanvasRenderingContext2D,
    );
    ({ useProjectStore } = await import("../project-store"));
  });

  beforeEach(async () => {
    useProjectStore.getState().createNewProject("Project with text");
    await useProjectStore.getState().addTrack("text");
  });

  it("clears title-engine clips when creating a fresh project", () => {
    const trackId = useProjectStore.getState().project.timeline.tracks[0].id;

    useProjectStore.getState().createTextClip(trackId, 0, "Stale caption", 3);
    expect(useProjectStore.getState().getAllTextClips()).toHaveLength(1);

    useProjectStore.getState().createNewProject("Fresh project");

    expect(useProjectStore.getState().getAllTextClips()).toHaveLength(0);
    expect(useProjectStore.getState().getFullProject().textClips).toEqual([]);
  });

  it("clears stale title-engine clips when loading a project without text clips", () => {
    const trackId = useProjectStore.getState().project.timeline.tracks[0].id;

    useProjectStore.getState().createTextClip(trackId, 0, "Previous project", 3);
    expect(useProjectStore.getState().getAllTextClips()).toHaveLength(1);

    useProjectStore.getState().loadProject(emptyProject("No text clips"));

    expect(useProjectStore.getState().getAllTextClips()).toHaveLength(0);
    expect(useProjectStore.getState().getFullProject().textClips).toEqual([]);
  });
});
