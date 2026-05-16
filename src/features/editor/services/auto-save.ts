import type { Project } from "@/lib/openreel-core";
import { getTransitionBridge } from "../bridges/transition-bridge";
import { scheduleCloudSave } from "./project-cloud";

/**
 * Serialize bridge-managed state (transitions etc.) into the project model
 * before persisting. Without this, transitions live only in the bridge's
 * in-memory map and disappear on auto-save recovery (V6-C1).
 */
function serializeBridgeState(project: Project): Project {
  try {
    return getTransitionBridge().serializeIntoProject(project);
  } catch (e) {
    console.warn("[AutoSave] serializeBridgeState failed:", e);
    return project;
  }
}

export interface AutoSaveConfig {
  interval: number;
  maxSlots: number;
  enabled: boolean;
  debounceTime: number;
}

export interface AutoSaveMetadata {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: number;
  slot: number;
  isRecovery: boolean;
}

interface AutoSaveRecord {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: number;
  slot: number;
  data: string;
}

const DEFAULT_CONFIG: AutoSaveConfig = {
  interval: 30000, // 30 seconds
  maxSlots: 3,
  enabled: true,
  debounceTime: 2000, // 2 seconds
};

const AUTO_SAVE_DB_NAME = "openreel-autosave";
const AUTO_SAVE_DB_VERSION = 1;
const AUTO_SAVE_STORE = "autosaves";

type AutoSaveEventType = "saved" | "restored" | "error" | "recoveryAvailable";
type AutoSaveEventCallback = (data?: unknown) => void;

export class AutoSaveManager {
  private config: AutoSaveConfig;
  private db: IDBDatabase | null = null;
  private initializePromise: Promise<void> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastSavedHash: string = "";
  private currentSlot: number = 0;
  private listeners: Map<AutoSaveEventType, Set<AutoSaveEventCallback>> =
    new Map();

  private projectProvider: (() => Project) | null = null;
  private pendingProject: Project | null = null;
  private isDirty: boolean = false;
  private dirtyVersion: number = 0;
  private saveInFlight: Promise<void> | null = null;
  private saveRequestedDuringFlight: boolean = false;

  constructor(config: Partial<AutoSaveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = this.openDatabase()
      .then((db) => {
        this.db = db;
      })
      .catch((error) => {
        console.error("[AutoSave] Failed to initialize:", error);
        this.emit("error", {
          error,
          message: "Failed to initialize auto-save",
        });
      })
      .finally(() => {
        this.initializePromise = null;
      });

    await this.initializePromise;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB not supported"));
        return;
      }

      const request = indexedDB.open(AUTO_SAVE_DB_NAME, AUTO_SAVE_DB_VERSION);

      request.onerror = () => {
        reject(
          new Error(
            `Failed to open auto-save database: ${request.error?.message}`,
          ),
        );
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(AUTO_SAVE_STORE)) {
          const store = db.createObjectStore(AUTO_SAVE_STORE, {
            keyPath: "id",
          });
          store.createIndex("projectId", "projectId", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("slot", "slot", { unique: false });
        }
      };
    });
  }

  start(getProject: () => Project): void {
    if (!this.config.enabled) {
      return;
    }

    this.stop(); // Stop any existing auto-save
    this.projectProvider = getProject;

    // Capture the current project immediately so the first edit after mount
    // does not save an older snapshot from a previous interval tick.
    this.captureProject();
    this.saveIfDirty();

    // Set up periodic saves
    this.intervalId = setInterval(() => {
      this.captureProject();
      this.saveIfDirty();
    }, this.config.interval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
      this.debounceTimeoutId = null;
    }
  }

  markDirty(project?: Project): void {
    if (project) {
      this.pendingProject = project;
    } else {
      this.captureProject();
    }
    this.isDirty = true;
    this.dirtyVersion += 1;

    // Debounce the save
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
    }

    this.debounceTimeoutId = setTimeout(() => {
      this.saveIfDirty();
    }, this.config.debounceTime);
  }

  private captureProject(): Project | null {
    if (!this.projectProvider) {
      return this.pendingProject;
    }
    try {
      this.pendingProject = this.projectProvider();
    } catch (error) {
      console.warn("[AutoSave] Failed to capture project snapshot:", error);
    }
    return this.pendingProject;
  }

  private async saveIfDirty(): Promise<void> {
    this.captureProject();
    if (!this.pendingProject || !this.isDirty) {
      return;
    }

    if (this.saveInFlight) {
      this.saveRequestedDuringFlight = true;
      return this.saveInFlight;
    }

    const run = async () => {
      do {
        this.saveRequestedDuringFlight = false;
        this.captureProject();

        if (!this.pendingProject || !this.isDirty) {
          return;
        }

        const project = this.pendingProject;
        const dirtyVersionAtSaveStart = this.dirtyVersion;
        const hash = this.computeHash(project);

        if (hash === this.lastSavedHash) {
          if (this.dirtyVersion === dirtyVersionAtSaveStart) {
            this.isDirty = false;
          }
          continue;
        }

        try {
          await this.save(project);
          this.lastSavedHash = hash;
          if (this.dirtyVersion === dirtyVersionAtSaveStart) {
            this.isDirty = false;
          }
        } catch (error) {
          console.error("[AutoSave] Save failed:", error);
          this.emit("error", { error, message: "Auto-save failed" });
          return;
        }
      } while (this.isDirty || this.saveRequestedDuringFlight);
    };

    this.saveInFlight = run().finally(() => {
      this.saveInFlight = null;
    });

    return this.saveInFlight;
  }

  private async save(project: Project): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error("Auto-save database not initialized");
    }

    const enriched = serializeBridgeState(project);
    const record: AutoSaveRecord = {
      id: `${enriched.id}-slot-${this.currentSlot}`,
      projectId: enriched.id,
      projectName: enriched.name,
      timestamp: Date.now(),
      slot: this.currentSlot,
      data: JSON.stringify(enriched),
    };

    await this.saveRecord(record);

    this.currentSlot = (this.currentSlot + 1) % this.config.maxSlots;
    await this.cleanupOldSaves(project.id);

    // Mirror to Supabase (best effort, debounced internally). The
    // cloud save is opt-in via setCloudSaveEnabled() so it stays off
    // for the original openreel-video deploy and only fires inside the
    // workspace integration.
    try {
      scheduleCloudSave(enriched);
    } catch (e) {
      // Cloud save failures must never break the local autosave path.
      console.warn("[AutoSave] cloud mirror schedule failed:", e);
    }

    this.emit("saved", {
      projectId: project.id,
      timestamp: record.timestamp,
      slot: record.slot,
    });
  }

  private saveRecord(record: AutoSaveRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const tx = this.db.transaction(AUTO_SAVE_STORE, "readwrite");
      const store = tx.objectStore(AUTO_SAVE_STORE);
      const request = store.put(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            `Failed to save: ${tx.error?.message ?? request.error?.message}`,
          ),
        );
      tx.onabort = () =>
        reject(
          new Error(
            `Save transaction aborted: ${
              tx.error?.message ?? request.error?.message ?? "unknown error"
            }`,
          ),
        );
      request.onerror = () =>
        reject(new Error(`Failed to save: ${request.error?.message}`));
    });
  }

  private async cleanupOldSaves(currentProjectId: string): Promise<void> {
    if (!this.db) return;

    const allSaves = await this.getAllSaves();
    const projectSaves = allSaves.filter(
      (s) => s.projectId === currentProjectId,
    );

    if (projectSaves.length > this.config.maxSlots) {
      const toDelete = projectSaves
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(this.config.maxSlots);

      for (const save of toDelete) {
        await this.deleteRecord(save.id);
      }
    }
  }

  private deleteRecord(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const tx = this.db.transaction(AUTO_SAVE_STORE, "readwrite");
      const store = tx.objectStore(AUTO_SAVE_STORE);
      const request = store.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            `Failed to delete: ${tx.error?.message ?? request.error?.message}`,
          ),
        );
      tx.onabort = () =>
        reject(
          new Error(
            `Delete transaction aborted: ${
              tx.error?.message ?? request.error?.message ?? "unknown error"
            }`,
          ),
        );
      request.onerror = () =>
        reject(new Error(`Failed to delete: ${request.error?.message}`));
    });
  }

  private getAllSaves(): Promise<AutoSaveRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const tx = this.db.transaction(AUTO_SAVE_STORE, "readonly");
      const store = tx.objectStore(AUTO_SAVE_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error(`Failed to get saves: ${request.error?.message}`));
    });
  }

  async checkForRecovery(projectId?: string): Promise<AutoSaveMetadata[]> {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const allSaves = await this.getAllSaves();

      let saves = allSaves;
      if (projectId) {
        saves = allSaves.filter((s) => s.projectId === projectId);
      }

      const metadata: AutoSaveMetadata[] = saves
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((s) => ({
          id: s.id,
          projectId: s.projectId,
          projectName: s.projectName,
          timestamp: s.timestamp,
          slot: s.slot,
          isRecovery: true,
        }));

      if (metadata.length > 0) {
        this.emit("recoveryAvailable", { saves: metadata });
      }

      return metadata;
    } catch (error) {
      console.error("[AutoSave] Failed to check for recovery:", error);
      return [];
    }
  }

  async recover(saveId: string): Promise<Project | null> {
    if (!this.db) {
      await this.initialize();
    }

    try {
      const record = await this.getRecord(saveId);
      if (!record) {
        console.warn(`[AutoSave] No save found with id: ${saveId}`);
        return null;
      }

      const project = JSON.parse(record.data) as Project;

      // V6-C1: Restore bridge state (transitions etc.) on recovery so
      // the bridge map is in sync with the loaded project model.
      try {
        getTransitionBridge().restoreFromProject(project);
      } catch (e) {
        console.warn("[AutoSave] transition restore failed:", e);
      }

      this.emit("restored", { project, timestamp: record.timestamp });
      return project;
    } catch (error) {
      console.error("[AutoSave] Recovery failed:", error);
      this.emit("error", { error, message: "Failed to recover project" });
      return null;
    }
  }

  private getRecord(id: string): Promise<AutoSaveRecord | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const tx = this.db.transaction(AUTO_SAVE_STORE, "readonly");
      const store = tx.objectStore(AUTO_SAVE_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () =>
        reject(new Error(`Failed to get record: ${request.error?.message}`));
    });
  }

  async getMostRecentSave(projectId: string): Promise<AutoSaveMetadata | null> {
    const saves = await this.checkForRecovery(projectId);
    return saves.length > 0 ? saves[0] : null;
  }

  async clearProjectSaves(projectId: string): Promise<void> {
    if (!this.db) return;

    const allSaves = await this.getAllSaves();
    const projectSaves = allSaves.filter((s) => s.projectId === projectId);

    for (const save of projectSaves) {
      await this.deleteRecord(save.id);
    }
  }

  async clearAllSaves(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(AUTO_SAVE_STORE, "readwrite");
      const store = tx.objectStore(AUTO_SAVE_STORE);
      const request = store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            `Failed to clear: ${tx.error?.message ?? request.error?.message}`,
          ),
        );
      tx.onabort = () =>
        reject(
          new Error(
            `Clear transaction aborted: ${
              tx.error?.message ?? request.error?.message ?? "unknown error"
            }`,
          ),
        );
      request.onerror = () =>
        reject(new Error(`Failed to clear: ${request.error?.message}`));
    });
  }

  private computeHash(project: Project): string {
    // Serialize bridge state first so transitions count into the hash. This
    // ensures that adding/removing a transition flips isDirty even when the
    // tracks/clips/media counts stay identical (V6-C1).
    const enriched = serializeBridgeState(project);
    const key = JSON.stringify(enriched);

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  updateConfig(config: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AutoSaveConfig {
    return { ...this.config };
  }

  on(event: AutoSaveEventType, callback: AutoSaveEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: AutoSaveEventType, callback: AutoSaveEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: AutoSaveEventType, data?: unknown): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error("[AutoSave] Event callback error:", error);
      }
    });
  }

  async forceSave(project: Project): Promise<void> {
    this.pendingProject = project;
    this.isDirty = true;
    this.dirtyVersion += 1;
    await this.saveIfDirty();
  }

  async flush(): Promise<void> {
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId);
      this.debounceTimeoutId = null;
    }

    this.captureProject();
    await this.saveIfDirty();
  }

  hasUnsavedChanges(): boolean {
    return this.isDirty || Boolean(this.debounceTimeoutId || this.saveInFlight);
  }

  destroy(): void {
    this.stop();
    this.projectProvider = null;
    this.pendingProject = null;
    this.isDirty = false;
    this.dirtyVersion = 0;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.listeners.clear();
  }
}

export const autoSaveManager = new AutoSaveManager();

export async function initializeAutoSave(): Promise<void> {
  await autoSaveManager.initialize();
}

export function startAutoSave(getProject: () => Project): void {
  autoSaveManager.start(getProject);
}

export function stopAutoSave(): void {
  autoSaveManager.stop();
}

export function markProjectDirty(): void {
  autoSaveManager.markDirty();
}

export async function checkForRecovery(
  projectId?: string,
): Promise<AutoSaveMetadata[]> {
  return autoSaveManager.checkForRecovery(projectId);
}

export async function recoverProject(saveId: string): Promise<Project | null> {
  return autoSaveManager.recover(saveId);
}
