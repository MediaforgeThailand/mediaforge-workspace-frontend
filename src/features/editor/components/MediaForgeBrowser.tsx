/**
 * MediaForgeBrowser — a small panel for browsing the user's MediaForge
 * `user_assets` Supabase bucket and pulling assets into the local project.
 *
 * Mounted inside the AssetsPanel "Media" tab as a collapsible section.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  KeyRound,
} from "lucide-react";
import {
  fetchAssetBlob,
  isSignedIn,
  listUserAssets,
  setManualJwt,
  type MediaForgeAsset,
} from "../services/supabase-client";
import { useProjectStore } from "../stores/project-store";
import { toast } from "../stores/notification-store";
import { useI18n } from "../services/i18n";
import { Input } from "@/components/openreel-ui";

const FILTER_ORDER: Array<{ id: "all" | "video" | "audio" | "image"; label: string }> = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Image" },
];

export const MediaForgeBrowser: React.FC = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<MediaForgeAsset[]>([]);
  const [filter, setFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [pulling, setPulling] = useState<string | null>(null);
  const [showJwtInput, setShowJwtInput] = useState(false);
  const [jwtInput, setJwtInput] = useState("");
  const { importMedia } = useProjectStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const ok = await isSignedIn();
      setSignedIn(ok);
      if (!ok) {
        setAssets([]);
        return;
      }
      const items = await listUserAssets({
        category: filter === "all" ? undefined : filter,
        limit: 200,
      });
      setAssets(items);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handlePull = useCallback(
    async (asset: MediaForgeAsset) => {
      if (!asset.publicUrl) return;
      setPulling(asset.path);
      try {
        const blob = await fetchAssetBlob(asset.publicUrl);
        if (!blob) {
          toast.error("Failed to fetch", asset.name);
          return;
        }
        const file = new File([blob], asset.name, {
          type: blob.type || asset.mime || "application/octet-stream",
        });
        const r = await importMedia(file);
        if (r.success) {
          toast.success("Imported from MediaForge", asset.name);
        }
      } finally {
        setPulling(null);
      }
    },
    [importMedia],
  );

  const handleApplyJwt = useCallback(() => {
    const trimmed = jwtInput.trim();
    if (!trimmed) return;
    setManualJwt(trimmed);
    toast.success("MediaForge token applied");
    setShowJwtInput(false);
    setJwtInput("");
    void refresh();
  }, [jwtInput, refresh]);

  return (
    <div className="border-t border-border bg-background-tertiary/40 mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-2.5 flex items-center gap-2 text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {signedIn ? (
          <Cloud size={13} className="text-emerald-400" />
        ) : (
          <CloudOff size={13} className="text-text-muted" />
        )}
        <span>MediaForge</span>
        {signedIn ? (
          <span className="ml-auto text-[10px] text-emerald-400">connected</span>
        ) : (
          <span className="ml-auto text-[10px] text-text-muted">offline</span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2.5">
          {!signedIn && (
            <div className="rounded-lg border border-border bg-background-secondary p-3 text-[11px] text-text-secondary space-y-2">
              <p>
                Sign in to MediaForge in another tab to browse your assets, or
                paste a JWT for local dev.
              </p>
              <button
                onClick={() => setShowJwtInput((v) => !v)}
                className="text-primary text-[11px] font-medium hover:underline flex items-center gap-1"
              >
                <KeyRound size={11} />
                {showJwtInput ? "Cancel" : "Paste JWT"}
              </button>
              {showJwtInput && (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={jwtInput}
                    onChange={(e) => setJwtInput(e.target.value)}
                    placeholder="paste access_token JWT"
                    className="text-[10px] h-7 flex-1 font-mono"
                  />
                  <button
                    onClick={handleApplyJwt}
                    className="px-2 py-1 text-[10px] bg-primary text-black rounded hover:brightness-110"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}

          {signedIn && (
            <>
              <div className="flex items-center gap-1">
                {FILTER_ORDER.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      filter === f.id
                        ? "bg-primary text-black"
                        : "bg-background-secondary text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="ml-auto p-1 rounded hover:bg-background-elevated text-text-muted hover:text-text-primary"
                  title={t("import")}
                >
                  {loading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                </button>
              </div>

              {assets.length === 0 && !loading && (
                <p className="text-[10px] text-text-muted px-1 py-2">
                  No assets in this folder.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {assets.map((a) => {
                  const isPulling = pulling === a.path;
                  return (
                    <button
                      key={a.path}
                      onClick={() => handlePull(a)}
                      disabled={isPulling}
                      className="group relative flex flex-col rounded-md border border-border hover:border-primary bg-background-secondary overflow-hidden text-left"
                    >
                      <div className="aspect-video bg-background-tertiary flex items-center justify-center">
                        {/\.(jpe?g|png|gif|webp)$/i.test(a.name) && a.publicUrl ? (
                          <img
                            src={a.publicUrl}
                            alt={a.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Cloud size={14} className="text-text-muted" />
                        )}
                      </div>
                      <div className="px-1.5 py-1 flex items-center gap-1">
                        <span
                          className="text-[10px] text-text-primary truncate flex-1"
                          title={a.name}
                        >
                          {a.name}
                        </span>
                        {isPulling ? (
                          <Loader2 size={10} className="animate-spin text-primary" />
                        ) : (
                          <Plus
                            size={10}
                            className="text-text-muted group-hover:text-primary"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaForgeBrowser;
