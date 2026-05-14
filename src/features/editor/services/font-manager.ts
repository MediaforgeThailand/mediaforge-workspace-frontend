/**
 * Font manager: load user-uploaded fonts via the FontFace API and persist
 * them in IndexedDB so they survive a page reload. Built-in fonts are
 * declared in CSS / Tailwind and never need to go through this path.
 *
 * Usage:
 *   await loadFontFromFile("My Font", file);        // upload
 *   await restoreFontsFromIndexedDB();              // on app boot
 *   const all = await listSavedFonts();             // for UI
 *   await removeFont("My Font");                    // delete
 */

const DB_NAME = "mediaforge-fonts";
const STORE_NAME = "fonts";
const DB_VERSION = 1;

interface StoredFont {
  /** Font-family name (used as the IndexedDB primary key). */
  name: string;
  /** Original filename so we can re-display it in the UI. */
  fileName: string;
  /** Raw font bytes. */
  buffer: ArrayBuffer;
  /** File MIME type, for completeness. */
  mimeType?: string;
  /** When this font was added (epoch ms). */
  addedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbTxn<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Register a FontFace with the document so CSS can use it by name.
 */
async function registerFontFace(
  name: string,
  buffer: ArrayBuffer,
): Promise<void> {
  // Clone the buffer — IDB returns a buffer that may be invalidated when
  // the transaction ends, and FontFace stores it internally.
  const fontFace = new FontFace(name, buffer.slice(0));
  await fontFace.load();
  (document.fonts as FontFaceSet).add(fontFace);
}

/**
 * Load a font from a user-selected file. Adds to FontFace AND persists.
 * Returns the font name (which is what the caller should set on style.fontFamily).
 */
export async function loadFontFromFile(
  name: string,
  file: File,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Font name is required");

  const buffer = await file.arrayBuffer();
  await registerFontFace(trimmed, buffer);

  const record: StoredFont = {
    name: trimmed,
    fileName: file.name,
    buffer,
    mimeType: file.type || undefined,
    addedAt: Date.now(),
  };
  await dbTxn("readwrite", (store) => store.put(record) as IDBRequest<unknown> as IDBRequest<IDBValidKey>);
  return trimmed;
}

/**
 * Restore all previously-saved fonts. Called once on app boot.
 * Safe to call multiple times — duplicate registrations are no-ops.
 */
export async function restoreFontsFromIndexedDB(): Promise<string[]> {
  try {
    const records = await dbTxn<StoredFont[]>("readonly", (store) =>
      store.getAll(),
    );
    const loaded: string[] = [];
    for (const record of records) {
      try {
        await registerFontFace(record.name, record.buffer);
        loaded.push(record.name);
      } catch (err) {
        console.warn(`[font-manager] Failed to restore font "${record.name}":`, err);
      }
    }
    return loaded;
  } catch (err) {
    console.warn("[font-manager] Could not open font store:", err);
    return [];
  }
}

/**
 * Return metadata for all saved fonts (no buffers — UI only needs names).
 */
export async function listSavedFonts(): Promise<
  Array<{ name: string; fileName: string; addedAt: number }>
> {
  try {
    const records = await dbTxn<StoredFont[]>("readonly", (store) =>
      store.getAll(),
    );
    return records.map((r) => ({
      name: r.name,
      fileName: r.fileName,
      addedAt: r.addedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Remove a saved font. Note: we can't unregister a FontFace from
 * document.fonts after it's been added, so it remains usable until
 * the page reloads. We do clear it from persistence though, so it
 * won't come back on the next boot.
 */
export async function removeFont(name: string): Promise<void> {
  await dbTxn("readwrite", (store) => store.delete(name) as IDBRequest<unknown> as IDBRequest<undefined>);
  // Best-effort: walk document.fonts and remove any matching faces.
  const fonts = document.fonts as FontFaceSet & {
    delete: (face: FontFace) => boolean;
  };
  fonts.forEach((face) => {
    if (face.family === name || face.family === `"${name}"`) {
      try { fonts.delete(face); } catch { /* ignore */ }
    }
  });
}

/**
 * Default font presets shipped with the app (built-in CSS fonts).
 * The Captions tab UI shows them as cards.
 */
export const BUILTIN_FONT_PRESETS = [
  { name: "Inter", label: "Inter", weight: 700, fallback: "sans-serif" },
  { name: "Roboto", label: "Roboto", weight: 700, fallback: "sans-serif" },
  { name: "Montserrat", label: "Montserrat", weight: 700, fallback: "sans-serif" },
  { name: "Bebas Neue", label: "Bebas Neue", weight: 400, fallback: "sans-serif" },
  { name: "Impact", label: "Impact", weight: 400, fallback: "sans-serif" },
  { name: "Pacifico", label: "Pacifico", weight: 400, fallback: "cursive" },
  { name: "Anuphan", label: "Anuphan (TH)", weight: 700, fallback: "sans-serif" },
  { name: "DB Adman X", label: "DB Adman X (TH)", weight: 700, fallback: "sans-serif" },
] as const;
