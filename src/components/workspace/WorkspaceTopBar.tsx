/**
 * Workspace Top Bar — canvas name (editable), back link, save/run hints.
 * Placeholder buttons only at this stage.
 */

import { ChevronLeft, Save, FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useLanguage } from "@/contexts/LanguageContext";
import GenerateIcon from "@/components/GenerateIcon";

/** Tool node types that support the generation history feature. */
const TOOL_NODE_TYPES = new Set([
  "imageGenNode", "videoGenNode",
  "removeBackgroundNode", "mergeAudioNode",
]);

/** Picsum / sample URLs used only for the dev-seed button below. */
const IMAGE_URLS = [
  "https://picsum.photos/seed/mf-a/640/400",
  "https://picsum.photos/seed/mf-b/500/700",
  "https://picsum.photos/seed/mf-c/900/300",
];
const VIDEO_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const WorkspaceTopBar = () => {
  const current = useWorkspaceStore((s) => s.current);
  const renameCanvas = useWorkspaceStore((s) => s.renameCanvas);
  const addGeneration = useWorkspaceStore((s) => s.addGeneration);
  const { t } = useLanguage();

  if (!current) return null;

  /**
   * Dev helper: seed 1–3 mock generations onto every tool node on the
   * current canvas. Lets us preview the result-bar / history-dialog UX
   * before the backend execution path is wired.
   */
  const seedDemoResults = () => {
    const toolNodes = current.nodes.filter((n) => TOOL_NODE_TYPES.has(n.type ?? ""));
    if (toolNodes.length === 0) return;
    for (const n of toolNodes) {
      const t = n.type ?? "";
      const isVideo = t === "videoGenNode" || t === "mergeAudioNode";
      if (isVideo) {
        addGeneration(n.id, { id: crypto.randomUUID(), type: "video", url: VIDEO_URL, createdAt: Date.now() });
      } else {
        for (let i = 0; i < IMAGE_URLS.length; i++) {
          addGeneration(n.id, { id: crypto.randomUUID(), type: "image", url: IMAGE_URLS[i], createdAt: Date.now() + i });
        }
      }
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-zinc-950 px-3 text-zinc-200">
      <Link
        to="/app/workspace"
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("workspace.topbar.back")}
      </Link>

      <div className="h-5 w-px bg-zinc-800" />

      <input
        value={current.name}
        onChange={(e) => renameCanvas(current.id, e.target.value)}
        className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-sm font-medium outline-none focus:bg-zinc-900"
        placeholder={t("workspace.topbar.canvas_name")}
      />

      <div className="text-[11px] text-zinc-500">
        {current.nodes.length} {current.nodes.length === 1 ? t("workspace.topbar.node_singular") : t("workspace.topbar.node_plural")} ·{" "}
        {current.edges.length} {current.edges.length === 1 ? t("workspace.topbar.link_singular") : t("workspace.topbar.link_plural")}
      </div>

      <button
        type="button"
        onClick={seedDemoResults}
        className="flex items-center gap-1 rounded border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-950/70"
        title={t("workspace.topbar.seed_demo_tip")}
      >
        <FlaskConical className="h-3.5 w-3.5" /> {t("workspace.topbar.seed_demo")}
      </button>

      <button
        type="button"
        disabled
        className="flex items-center gap-1 rounded bg-white/[0.04] px-2 py-1 text-xs text-zinc-500"
        title={t("workspace.topbar.save_not_wired")}
      >
        <Save className="h-3.5 w-3.5" /> {t("workspace.topbar.save")}
      </button>

      <button
        type="button"
        disabled
        className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
        title={t("workspace.topbar.run_not_wired")}
      >
        <GenerateIcon className="h-3.5 w-3.5" /> {t("workspace.topbar.run")}
      </button>
    </header>
  );
};

export default WorkspaceTopBar;
