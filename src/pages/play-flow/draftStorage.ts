/**
 * Persists a guest user's PlayFlow configuration (text values + uploaded
 * media as data URLs) to sessionStorage so it survives the redirect to
 * /auth and back. Files are re-hydrated as Blobs so handleSubmit can
 * upload them once the user is authenticated.
 *
 * Scoped per flowId so different flows don't trample each other.
 */

const STORAGE_KEY = "mediaforge:playflow:draft";

export interface PlayFlowDraft {
  flowId: string;
  formValues: Record<string, unknown>;
  /** nodeId → { name, type, dataUrl } */
  fileUploads: Record<string, { name: string; type: string; dataUrl: string }>;
  savedAt: number;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });

export const dataUrlToFile = async (
  dataUrl: string,
  name: string,
  type: string,
): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: type || blob.type });
};

export async function savePlayFlowDraft(
  flowId: string,
  formValues: Record<string, unknown>,
  fileUploads: Record<string, File | null>,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const fileEntries: PlayFlowDraft["fileUploads"] = {};
    for (const [nodeId, file] of Object.entries(fileUploads)) {
      if (!file) continue;
      // 6 MB cap per file to stay well within sessionStorage limits.
      if (file.size > 6 * 1024 * 1024) continue;
      try {
        fileEntries[nodeId] = {
          name: file.name,
          type: file.type,
          dataUrl: await fileToDataUrl(file),
        };
      } catch {
        /* skip unreadable file */
      }
    }
    const draft: PlayFlowDraft = {
      flowId,
      formValues,
      fileUploads: fileEntries,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    // QuotaExceeded or serialization issue — best-effort only.
    console.warn("[playflow:draft] save failed", err);
  }
}

export function readPlayFlowDraft(flowId: string): PlayFlowDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as PlayFlowDraft;
    if (draft.flowId !== flowId) return null;
    // Drop drafts older than 30 minutes
    if (Date.now() - draft.savedAt > 30 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearPlayFlowDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
