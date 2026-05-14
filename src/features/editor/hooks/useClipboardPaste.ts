import { useEffect } from "react";
import { useProjectStore } from "../stores/project-store";
import { useTimelineStore } from "../stores/timeline-store";
import { toast } from "../stores/notification-store";

/**
 * useClipboardPaste — bridges the browser `paste` event to MediaForge's
 * timeline so users can drag content from outside the app (a screenshot from
 * the OS clipboard, an image copied from a webpage, a snippet of text) into
 * a new clip via Ctrl/Cmd+V.
 *
 * Behaviour by clipboard payload (checked in order):
 *  1. Image (PNG / JPG / GIF / WebP / etc.) → import as MediaItem, then place
 *     a new clip on a new image/video track at the playhead.
 *  2. Video (limited browser support today, kept for forward-compat) → same
 *     pipeline as image but on a video track.
 *  3. Text (`text/plain`) → creates a new text clip on an existing or new
 *     Text track at the playhead.
 *  4. Otherwise → fall through. The in-app clipboard handler (driven by the
 *     keyboard-shortcut manager) already responds to Ctrl/Cmd+V for clip
 *     duplication, so this hook never blocks that path.
 *
 * Guards:
 *  - Skip when focus is inside an `<input>`, `<textarea>`, or any
 *    `[contenteditable]` element. Native paste should win in those cases.
 *  - Skip when `clipboardData` is missing (synthetic events / tests).
 *
 * This hook uses the `paste` event's synchronous `clipboardData.items` so it
 * works without `navigator.clipboard.read()` permission prompts.
 */
export function useClipboardPaste(): void {
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      // Bail when the user is typing — native paste handles input surfaces.
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const insideInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        !!target?.isContentEditable ||
        !!active?.isContentEditable ||
        !!target?.closest?.('[contenteditable="true"]') ||
        !!active?.closest?.('[contenteditable="true"]');
      if (insideInput) return;

      const cd = e.clipboardData;
      if (!cd) return;

      const items = Array.from(cd.items || []);
      if (items.length === 0) return;

      // First pass: find image/video file items.
      const fileItem = items.find(
        (it) =>
          it.kind === "file" &&
          (it.type.startsWith("image/") || it.type.startsWith("video/")),
      );

      if (fileItem) {
        const blob = fileItem.getAsFile();
        if (!blob) return;

        e.preventDefault();
        // Don't let the keyboard-shortcut paste handler (in-app clip clone)
        // also run on the same event — we are explicitly importing OS data.
        e.stopPropagation();

        const ext = (() => {
          const m = blob.type.match(/^(image|video)\/(\w+)/);
          if (!m) return "bin";
          // image/svg+xml → svg, image/png → png, image/jpeg → jpg
          const sub = m[2].toLowerCase();
          if (sub === "jpeg") return "jpg";
          if (sub === "svg+xml") return "svg";
          return sub;
        })();
        const filename = `Pasted ${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.${ext}`;
        const file = new File([blob], filename, {
          type: blob.type,
          lastModified: Date.now(),
        });

        const store = useProjectStore.getState();
        try {
          const importResult = await store.importMedia(file);
          if (!importResult.success || !importResult.actionId) {
            toast.error("Could not paste — import failed");
            return;
          }
          const playhead = useTimelineStore.getState().playheadPosition;
          await store.addClipToNewTrack(importResult.actionId, playhead);
          toast.success("Pasted from clipboard");
        } catch (err) {
          console.error("[ClipboardPaste] import failed", err);
          toast.error("Could not paste image");
        }
        return;
      }

      // Second pass: plain text → create a text clip.
      const textItem = items.find(
        (it) => it.kind === "string" && it.type === "text/plain",
      );
      if (textItem) {
        // getAsString is async/callback-based; promisify.
        const text: string = await new Promise((resolve) => {
          textItem.getAsString((s) => resolve(s || ""));
        });
        const trimmed = text.trim();
        if (!trimmed) return;

        e.preventDefault();
        e.stopPropagation();

        const store = useProjectStore.getState();
        const playhead = useTimelineStore.getState().playheadPosition;
        const tracks = store.project.timeline.tracks;

        // Try to reuse an existing text track first.
        let textTrack = tracks.find((t) => t.type === "text");
        if (!textTrack) {
          const before = store.project.timeline.tracks;
          const trackResult = await store.addTrack("text", 0);
          if (!trackResult.success) {
            toast.error("Could not paste text — track add failed");
            return;
          }
          const after = useProjectStore.getState().project.timeline.tracks;
          textTrack = after.find(
            (t) => t.type === "text" && !before.some((bt) => bt.id === t.id),
          );
        }
        if (!textTrack) {
          toast.error("Could not paste text — no text track");
          return;
        }

        try {
          // 5-second default duration matches `tools.addText` keyboard path.
          useProjectStore
            .getState()
            .createTextClip(textTrack.id, playhead, trimmed, 5);
          toast.success("Pasted text");
        } catch (err) {
          console.error("[ClipboardPaste] createTextClip failed", err);
          toast.error("Could not create text clip");
        }
      }
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, []);
}
