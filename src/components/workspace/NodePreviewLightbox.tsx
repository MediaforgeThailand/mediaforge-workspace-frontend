/**
 * Full-viewport lightbox that pops up when the user double-clicks a
 * node (or hits the `A` shortcut while a node is selected).
 *
 * Picks the right kind of media to show based on the node type and
 * its data — works uniformly for any node so the user has one
 * "go-large" gesture to inspect output:
 *
 *   - assetNode              → previewUrl   (image / video / audio)
 *   - elementNode (saved)    → reference_images[0] / thumbnail_url
 *   - elementNode (creator)  → walks own input edges for refs
 *   - any tool node          → currently-selected generation's URL
 *   - textNode               → big text pane
 *   - groupNode              → contact sheet of every child
 *
 * Closing: click backdrop, hit Esc, or press `A` again.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@xyflow/react";

export interface PreviewPayload {
  type: "image" | "video" | "audio" | "text" | "grid";
  /** image / video / audio source URL */
  url?: string;
  /** plain-text payload (textNode, chat output, video-to-prompt) */
  text?: string;
  /** Multi-image preview (group node = contact sheet). */
  urls?: string[];
  label?: string;
  caption?: string;
}

interface Props {
  preview: PreviewPayload;
  onClose: () => void;
}

const NodePreviewLightbox = ({ preview, onClose }: Props) => {
  // Close on Esc OR `A` (toggle — same key opens/closes via the global
  // `A` shortcut). The `A` branch DOES NOT fire while the user is
  // typing into a text input/contenteditable somewhere on the page —
  // otherwise typing the letter "a" anywhere would slam the lightbox
  // shut. Esc still works regardless because Esc is universally a
  // "cancel" key with no typing-related side effects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key.toLowerCase() === "a") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName ?? "";
        const isTyping =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target?.isContentEditable === true;
        // Modifier keys mean the user is doing Ctrl+A / Cmd+A etc. —
        // never our toggle. Skip.
        if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar — label + close */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 border-b border-white/5 bg-zinc-950/70 px-4 py-2.5 text-sm text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 truncate">
          <span className="font-medium">{preview.label ?? "Preview"}</span>
          {preview.caption && (
            <span className="ml-2 text-[11px] text-zinc-500">
              {preview.caption}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — clicking the actual media doesn't bubble to backdrop */}
      <div
        className={cn(
          "max-h-[86vh] max-w-[90vw] overflow-auto",
          preview.type === "text" && "w-[min(720px,90vw)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {preview.type === "image" && preview.url && (
          <img
            src={preview.url}
            alt={preview.label ?? "preview"}
            className="max-h-[86vh] max-w-[90vw] rounded-md object-contain shadow-2xl shadow-black"
            draggable={false}
          />
        )}

        {preview.type === "video" && preview.url && (
          <video
            src={preview.url}
            controls
            autoPlay
            className="max-h-[86vh] max-w-[90vw] rounded-md shadow-2xl shadow-black"
          />
        )}

        {preview.type === "audio" && preview.url && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900 p-6">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Audio
            </div>
            <audio src={preview.url} controls autoPlay className="w-[480px] max-w-[80vw]" />
          </div>
        )}

        {preview.type === "text" && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-[13px] leading-relaxed text-zinc-100 whitespace-pre-wrap">
            {preview.text || (
              <span className="italic text-zinc-500">(empty text)</span>
            )}
          </div>
        )}

        {preview.type === "grid" && Array.isArray(preview.urls) && (
          <div className="grid w-[min(900px,90vw)] grid-cols-3 gap-3">
            {preview.urls.length === 0 ? (
              <div className="col-span-3 flex h-32 items-center justify-center text-xs text-zinc-500">
                <ImageOff className="mr-2 h-4 w-4" /> Empty group
              </div>
            ) : (
              preview.urls.map((u, i) => (
                <img
                  key={u + i}
                  src={u}
                  alt=""
                  className="aspect-square w-full rounded border border-zinc-800 object-cover"
                  draggable={false}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div
        className="absolute inset-x-0 bottom-0 border-t border-white/5 bg-zinc-950/70 px-4 py-2 text-center text-[11px] text-zinc-500"
        onClick={(e) => e.stopPropagation()}
      >
        Esc · A · click to close
      </div>
    </div>,
    document.body,
  );
};

export default NodePreviewLightbox;

/* ── Helper: build a PreviewPayload from any node ─────────────── */

export function getNodePreview(
  node: Node,
  allNodes: ReadonlyArray<Node>,
): PreviewPayload | null {
  const d = (node.data ?? {}) as Record<string, unknown>;
  const labelOf = (fallback?: string): string =>
    (d.label as string) ||
    ((d.params as Record<string, unknown> | undefined)?.nodeName as string) ||
    fallback ||
    (node.type ?? "node");

  // ── AssetNode — direct media file ──
  if (node.type === "assetNode") {
    const url =
      (d.previewUrl as string | undefined) ??
      (d.storagePath as string | undefined);
    if (!url) return null;
    const ft = (d.fieldType as string | undefined) ?? "image";
    const previewType: PreviewPayload["type"] =
      ft === "video" ? "video" : ft === "audio" ? "audio" : "image";
    return {
      type: previewType,
      url,
      label: labelOf("asset"),
      caption: (d.fileName as string | undefined) ?? undefined,
    };
  }

  // ── ElementNode — saved or creator-mode refs ──
  if (node.type === "elementNode") {
    const refs = Array.isArray(d.reference_images)
      ? (d.reference_images as unknown[]).filter(
          (u): u is string => typeof u === "string" && !!u,
        )
      : [];
    const frontal = (d.frontal_image_url as string | undefined) ?? undefined;
    const thumb = (d.thumbnail_url as string | undefined) ?? undefined;
    const all = [thumb, frontal, ...refs].filter(
      (u): u is string => typeof u === "string" && !!u,
    );
    if (all.length === 1) {
      return { type: "image", url: all[0], label: labelOf("element") };
    }
    if (all.length > 1) {
      return {
        type: "grid",
        urls: all,
        label: labelOf("element"),
        caption: `${all.length} references`,
      };
    }
    return null;
  }

  // ── TextNode — big text pane ──
  if (node.type === "textNode") {
    return {
      type: "text",
      text: (d.content as string | undefined) ?? "",
      label: labelOf("text"),
    };
  }

  // ── GroupNode — contact sheet of children ──
  if (node.type === "groupNode") {
    const childUrls: string[] = [];
    for (const child of allNodes) {
      if (child.parentId !== node.id) continue;
      const cd = (child.data ?? {}) as Record<string, unknown>;
      const url =
        (cd.previewUrl as string | undefined) ??
        (cd.thumbnail_url as string | undefined) ??
        (Array.isArray(cd.generations) && cd.generations.length > 0
          ? ((cd.generations as Array<{ url?: string }>)[
              typeof cd.selectedGenIndex === "number"
                ? (cd.selectedGenIndex as number)
                : 0
            ]?.url as string | undefined)
          : undefined) ??
        (Array.isArray(cd.reference_images)
          ? ((cd.reference_images as unknown[])[0] as string | undefined)
          : undefined);
      if (url) childUrls.push(url);
    }
    return {
      type: "grid",
      urls: childUrls,
      label: labelOf("group"),
      caption: `${childUrls.length} item(s)`,
    };
  }

  // ── Tool node — last/selected generation ──
  const gens = Array.isArray(d.generations)
    ? (d.generations as Array<Record<string, unknown>>)
    : [];
  if (gens.length > 0) {
    const idx =
      typeof d.selectedGenIndex === "number"
        ? (d.selectedGenIndex as number)
        : 0;
    const g = gens[idx] ?? gens[0];
    const gType = (g.type as string | undefined) ?? "image";
    if (gType === "text") {
      return {
        type: "text",
        text: (g.text as string | undefined) ?? "",
        label: labelOf(),
        caption: `Generation ${idx + 1} / ${gens.length}`,
      };
    }
    const url = g.url as string | undefined;
    if (!url) return null;
    return {
      type: gType === "video" ? "video" : gType === "audio" ? "audio" : "image",
      url,
      label: labelOf(),
      caption: `Generation ${idx + 1} / ${gens.length}`,
    };
  }

  return null;
}
