/**
 * Workspace Asset Library — Magnific-style "All assets" surface.
 *
 * Replaces the legacy HistoryView (which only showed raw generation
 * jobs) with a unified asset browsing experience inspired directly
 * by Magnific's `/all-assets` page:
 *
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │ All projects │ All assets                                   │
 *   │ All assets ✓ │  [All|Image|Video|Audio|3D]    [filters]    │
 *   │ All spaces   │                                              │
 *   │ Uploads      │  [card] [card] [card] [card] [card]          │
 *   │              │                                              │
 *   │ PROJECTS     │  ── March 2026 ───────────────────────────   │
 *   │ ▸ Project A  │  [card] [card] [card]                        │
 *   │ ▸ Project B  │                                              │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * Data sources
 * ────────────
 *   • Generated assets ─ `workspace_generation_jobs` rows where
 *     `status = 'completed'` and `result.url` is non-null. The same
 *     RLS policy that gates HistoryView's realtime subscription
 *     (`auth.uid() = user_id`) applies here so the user only ever
 *     sees their own work.
 *   • Uploads ─ Supabase Storage bucket `ai-media`, listed under the
 *     user's own prefix (`<userId>/...`). The bucket policy already
 *     restricts list/get to that path, so we don't need to filter
 *     server-side.
 *
 * Mobile
 * ──────
 *   The inner sub-sidebar collapses behind a Filters button on
 *   narrow viewports — same pattern as Magnific's mobile view.
 *   Project list moves into the same drawer; the grid below stays
 *   3-up at lg+, 2-up at sm-md, and 1-up under 360px.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Image as ImageIcon,
  Film,
  Music,
  Box,
  Folder,
  UploadCloud,
  LayoutGrid,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
  ChevronDown,
  RefreshCcw,
  ExternalLink,
  Eye,
  Copy,
  Download,
  Trash2,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { getSignedUrl } from "@/hooks/useSignedUrl";
import { cn } from "@/lib/utils";
import NodePreviewLightbox, { type PreviewPayload } from "./NodePreviewLightbox";
import { downloadFromUrl } from "./downloadAsset";
import MediaContextMenu, {
  type MediaContextMenuItem,
} from "./MediaContextMenu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type AssetKind = "image" | "video" | "audio" | "3d";

type GenerationAsset = {
  source: "generation";
  id: string;
  kind: AssetKind;
  url: string;
  thumbnailUrl?: string;
  modelLabel?: string;
  prompt?: string;
  projectId: string | null;
  workspaceId: string | null;
  canvasId: string | null;
  nodeId: string | null;
  createdAt: string;        // ISO
  durationSec?: number;     // for video
  width?: number;           // for image
  height?: number;
  status: string;
};

type UploadAsset = {
  source: "upload";
  id: string;
  kind: AssetKind;
  url: string;
  name: string;
  projectId: string | null;
  createdAt: string;
  size?: number;
  rowId?: string;
  storageBucket?: "ai-media" | "user_assets";
  storagePath?: string;
};

type Asset = GenerationAsset | UploadAsset;

type FilterKind = "all" | AssetKind;

type SectionKind = "all" | "spaces" | "uploads";

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  "3d":  Box,
};

type FilterLabelKey =
  | "workspace.assets.filter_all"
  | "workspace.assets.filter_image"
  | "workspace.assets.filter_video"
  | "workspace.assets.filter_audio"
  | "workspace.assets.filter_3d";
type SideLabelKey =
  | "workspace.assets.all_assets"
  | "workspace.assets.spaces"
  | "workspace.assets.uploads";

const FILTER_BUTTONS: Array<{ key: FilterKind; labelKey: FilterLabelKey; icon: LucideIcon }> = [
  { key: "all",   labelKey: "workspace.assets.filter_all",   icon: LayoutGrid },
  { key: "image", labelKey: "workspace.assets.filter_image", icon: ImageIcon },
  { key: "video", labelKey: "workspace.assets.filter_video", icon: Film },
  { key: "audio", labelKey: "workspace.assets.filter_audio", icon: Music },
  { key: "3d",    labelKey: "workspace.assets.filter_3d",    icon: Box },
];

const SIDE_NAV: Array<{ key: SectionKind; labelKey: SideLabelKey; icon: LucideIcon }> = [
  { key: "all",       labelKey: "workspace.assets.all_assets", icon: LayoutGrid },
  { key: "spaces",    labelKey: "workspace.assets.spaces",     icon: Folder },
  { key: "uploads",   labelKey: "workspace.assets.uploads",    icon: UploadCloud },
];

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function inferAssetKind(url: string, typeHint?: string, hasModelUrl = false): AssetKind {
  const type = (typeHint ?? "").toLowerCase();
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (hasModelUrl || type.includes("3d") || /\.(glb|gltf|obj|fbx|usdz)$/.test(cleanUrl)) {
    return "3d";
  }
  if (type.includes("video") || /\.(mp4|webm|mov|m4v)$/.test(cleanUrl)) return "video";
  if (type.includes("audio") || /\.(mp3|wav|m4a|ogg|aac)$/.test(cleanUrl)) return "audio";
  return "image";
}

function cleanAssetName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/^[0-9]{10,}[-_]/, "")
    .trim();
  return cleaned || undefined;
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function resolveAiMediaUrl(rawUrl: string): Promise<string | null> {
  if (!rawUrl) return null;
  const normalized = rawUrl.trim().replace(/^\/+/, "");
  if (!normalized) return null;
  if (isRemoteUrl(normalized)) return getSignedUrl(normalized);

  const signFromBucket = async (bucket: "ai-media" | "user_assets", path: string) => {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path.replace(/^\/+/, ""), 60 * 60 * 24);
    return data?.signedUrl ?? null;
  };

  const aiMediaMatch = normalized.match(/^ai-media\/(.+)$/i);
  if (aiMediaMatch) return signFromBucket("ai-media", aiMediaMatch[1]);

  const userAssetMatch = normalized.match(/^user_assets\/(.+)$/i);
  if (userAssetMatch) return signFromBucket("user_assets", userAssetMatch[1]);

  return (await signFromBucket("user_assets", normalized)) ?? signFromBucket("ai-media", normalized);
}

function storagePointerFromRawUrl(rawUrl: string): Pick<UploadAsset, "storageBucket" | "storagePath"> {
  const normalized = rawUrl.trim().replace(/^\/+/, "").split("?")[0];
  const direct = normalized.match(/^(ai-media|user_assets)\/(.+)$/i);
  if (direct) {
    return {
      storageBucket: direct[1].toLowerCase() as "ai-media" | "user_assets",
      storagePath: decodeURIComponent(direct[2]),
    };
  }
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const url = new URL(rawUrl);
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/);
      if (match && (match[1] === "ai-media" || match[1] === "user_assets")) {
        return {
          storageBucket: match[1] as "ai-media" | "user_assets",
          storagePath: decodeURIComponent(match[2]),
        };
      }
    } catch {
      return {};
    }
  }
  return {};
}

export default function AssetsView({
  onOpenSidebar,
}: {
  /** Optional — when provided, renders a hamburger button in the
   *  header that opens the workspace dashboard's main sidebar
   *  drawer. Only the dashboard route passes this; standalone uses
   *  of AssetsView (none today) skip it. */
  onOpenSidebar?: () => void;
} = {}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const projects = useWorkspaceStore((s) => s.projects);
  const projectIds = useMemo(
    () => projects.map((project) => project.id).filter(Boolean),
    [projects],
  );

  // Right-panel state.
  const [section, setSection] = useState<SectionKind>("all");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  // Generation assets — live-paged from workspace_generation_jobs.
  const [genAssets, setGenAssets] = useState<GenerationAsset[]>([]);
  const [genLoading, setGenLoading] = useState(true);
  const [genHasMore, setGenHasMore] = useState(true);

  // Upload assets — paged from `ai-media` storage prefix.
  const [uploadAssets, setUploadAssets] = useState<UploadAsset[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);

  const PAGE = 60;

  /** Fetch a page of completed generations for the current user. */
  const fetchGenPage = useCallback(
    async (offset: number) => {
      if (!user) return;
      const select =
        "id, status, node_type, provider, model, request, result, created_at, project_id, workspace_id, canvas_id, node_id";
      const runQuery = (scope: "projects" | "user") => {
        let query = supabase
          .from("workspace_generation_jobs")
          .select(select)
          .eq("status", "completed")
          .order("created_at", { ascending: false });
        query =
          scope === "projects" && projectIds.length > 0
            ? query.in("project_id", projectIds)
            : query.eq("user_id", user.id);
        return query.range(offset, offset + PAGE - 1);
      };

      let { data, error } = await runQuery(projectIds.length > 0 ? "projects" : "user");
      if (!error && offset === 0 && projectIds.length > 0 && (data ?? []).length === 0) {
        const fallback = await runQuery("user");
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        toast.error(t("workspace.assets.load_failed", { error: error.message }));
        return;
      }
      const next: GenerationAsset[] = (data ?? [])
        .map((row): GenerationAsset | null => {
          const result = (row.result ?? {}) as {
            url?: string;
            type?: string;
            text?: string;
            outputs?: Record<string, unknown>;
            provider_meta?: Record<string, unknown>;
          };
          const resultRecord = result as Record<string, unknown>;
          const outputs = result.outputs ?? {};
          const providerMeta = result.provider_meta ?? {};
          const modelUrl = firstText(
            resultRecord.model_url,
            providerMeta.model_url,
            outputs.model_url,
            outputs.glb_url,
            outputs.gltf_url,
            outputs.mesh_url,
            outputs.model,
          );
          const mediaUrl = firstText(
            resultRecord.url,
            resultRecord.image_url,
            resultRecord.video_url,
            resultRecord.audio_url,
            outputs.url,
            outputs.asset_url,
            outputs.image_url,
            outputs.video_url,
            outputs.audio_url,
            outputs.output_url,
            outputs.output_image,
            outputs.output_video,
            outputs.output_audio,
            outputs.playback_url,
          );
          const url = modelUrl ?? mediaUrl;
          if (!url) return null;
          const kind = inferAssetKind(
            url,
            firstText(result.type, row.node_type, row.provider),
            Boolean(modelUrl),
          );
          const posterUrl =
            kind === "3d"
              ? firstText(
                  providerMeta.rendered_image,
                  resultRecord.rendered_image,
                  resultRecord.preview_image,
                  outputs.rendered_image,
                  outputs.preview_image,
                  outputs.thumbnail_url,
                  outputs.poster,
                  outputs.output_image,
                  mediaUrl,
                )
              : undefined;

          const params =
            (row.request as { params?: Record<string, unknown> } | null)?.params ?? {};
          const promptText =
            typeof params.prompt === "string"
              ? params.prompt
              : typeof params.system_prompt === "string"
                ? (params.system_prompt as string)
                : "";

          return {
            source: "generation",
            id: row.id as string,
            kind,
            url,
            thumbnailUrl: posterUrl && posterUrl !== url ? posterUrl : undefined,
            modelLabel: (row.model as string | null) ?? (row.node_type as string),
            prompt: promptText,
            projectId: (row.project_id as string | null) ?? null,
            workspaceId: (row.workspace_id as string | null) ?? null,
            canvasId: (row.canvas_id as string | null) ?? null,
            nodeId: (row.node_id as string | null) ?? null,
            createdAt: row.created_at as string,
            status: row.status as string,
            durationSec:
              typeof params.duration === "number"
                ? (params.duration as number)
                : typeof params.duration === "string"
                  ? Number.parseInt(params.duration as string, 10) || undefined
                  : undefined,
          };
        })
        .filter((x): x is GenerationAsset => x !== null);
      setGenAssets((prev) => (offset === 0 ? next : [...prev, ...next]));
      setGenHasMore(next.length === PAGE);
    },
    [user, t, projectIds],
  );

  /** First-load + when user switches to All / All spaces
   *  (i.e. anything that consumes the generation feed). */
  useEffect(() => {
    if (!user) {
      setGenLoading(false);
      setGenAssets([]);
      setGenHasMore(false);
      return;
    }
    if (section === "uploads") return;
    setGenLoading(true);
    setGenAssets([]);
    setGenHasMore(true);
    void fetchGenPage(0).finally(() => setGenLoading(false));
  }, [user, section, fetchGenPage]);

  /** Realtime — prepend INSERTs and patch UPDATEs. */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("workspace-assets-feed");
    const handleChange = () => {
      void fetchGenPage(0);
    };

    if (projectIds.length > 0) {
      for (const projectId of projectIds) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspace_generation_jobs",
            filter: `project_id=eq.${projectId}`,
          },
          handleChange,
        );
      }
    } else {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_generation_jobs",
          filter: `user_id=eq.${user.id}`,
        },
        handleChange,
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, projectIds, fetchGenPage]);

  /** Lazy-load uploads when the user opens the Uploads tab. */
  useEffect(() => {
    if ((section !== "uploads" && section !== "all") || !user) {
      if (!user) {
        setUploadLoading(false);
        setUploadAssets([]);
      }
      return;
    }
    setUploadLoading(true);
    void (async () => {
      try {
        const items: UploadAsset[] = [];
        const seenUrls = new Set<string>();
        const pushUpload = (asset: UploadAsset) => {
          const key = asset.url.split("?")[0];
          if (seenUrls.has(key)) return;
          seenUrls.add(key);
          items.push(asset);
        };

        const { data: userAssetRows, error: userAssetError } = await (supabase as any)
          .from("user_assets")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(240);

        if (userAssetError) {
          console.warn("[AssetsView] user_assets load failed:", userAssetError.message);
        } else {
          for (const row of (userAssetRows ?? []) as Array<Record<string, unknown>>) {
            const metadata =
              row.metadata && typeof row.metadata === "object"
                ? (row.metadata as Record<string, unknown>)
                : {};
            const rawUrl = firstText(
              row.file_url,
              row.url,
              row.public_url,
              row.thumbnail_url,
              metadata.file_url,
              metadata.url,
              metadata.storage_path,
            );
            if (!rawUrl) continue;
            const url = await resolveAiMediaUrl(rawUrl);
            if (!url) continue;
            const storagePointer = storagePointerFromRawUrl(rawUrl);
            const fileType = firstText(
              row.file_type,
              row.mime_type,
              row.type,
              metadata.mime_type,
              metadata.content_type,
            );
            pushUpload({
              source: "upload",
              id: `user-asset-${String(row.id ?? rawUrl)}`,
              rowId: typeof row.id === "string" ? row.id : row.id != null ? String(row.id) : undefined,
              ...storagePointer,
              kind: inferAssetKind(url, fileType),
              url,
              name:
                cleanAssetName(
                  firstText(
                    row.name,
                    row.file_name,
                    row.filename,
                    metadata.name,
                    metadata.file_name,
                    metadata.filename,
                  ),
                ) ??
                cleanAssetName(rawUrl) ??
                t("workspace.assets.gen_fallback"),
              projectId:
                typeof row.project_id === "string"
                  ? row.project_id
                  : typeof metadata.project_id === "string"
                    ? metadata.project_id
                    : null,
              createdAt:
                typeof row.created_at === "string"
                  ? row.created_at
                  : new Date().toISOString(),
              size:
                typeof metadata.size === "number"
                  ? metadata.size
                  : typeof row.size === "number"
                    ? row.size
                    : undefined,
            });
          }
        }

        // List the user's own folder in `ai-media`. Storage RLS
        // already restricts us to `(storage.foldername(name))[1] =
        // auth.uid()`, so we can pass `userId` as the prefix and
        // get back only files we own.
        const collectAiMediaPrefix = async (prefix: string, depth = 0): Promise<void> => {
          const { data, error } = await supabase.storage
            .from("ai-media")
            .list(prefix, {
              limit: 200,
              sortBy: { column: "created_at", order: "desc" },
            });
          if (error) throw error;

          for (const obj of data ?? []) {
            const path = `${prefix}/${obj.name}`;
            if (!obj.id) {
              if (depth < 2) await collectAiMediaPrefix(path, depth + 1);
              continue;
            }
            const url = await resolveAiMediaUrl(`ai-media/${path}`);
            if (!url) continue;
            pushUpload({
              source: "upload",
              id: path,
              kind: inferAssetKind(path),
              url,
              name: obj.name,
              projectId: null,
              createdAt: obj.created_at ?? new Date().toISOString(),
              size: (obj.metadata as { size?: number } | null)?.size,
              storageBucket: "ai-media",
              storagePath: path,
            });
          }
        };

        await collectAiMediaPrefix(user.id);
        setUploadAssets(
          items.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(t("workspace.assets.upload_list_failed", { error: msg }));
      } finally {
        setUploadLoading(false);
      }
    })();
  }, [section, user, t]);

  /** Resolve the active dataset based on the current section. */
  const baseAssets: Asset[] = useMemo(() => {
    if (section === "uploads") return uploadAssets;
    if (section === "spaces") {
      const spaceAssets = genAssets.filter((asset) => Boolean(asset.workspaceId));
      return spaceAssets.length > 0 ? spaceAssets : genAssets;
    }
    return [...genAssets, ...uploadAssets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [section, genAssets, uploadAssets]);

  /** Filter pipeline — kind → project → search. */
  const filteredAssets: Asset[] = useMemo(() => {
    let out = baseAssets;
    if (filter !== "all") out = out.filter((a) => a.kind === filter);
    if (activeProject) out = out.filter((a) => a.projectId === activeProject);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((a) => {
        if (a.source === "generation") {
          return (
            (a.prompt ?? "").toLowerCase().includes(q) ||
            (a.modelLabel ?? "").toLowerCase().includes(q)
          );
        }
        return a.name.toLowerCase().includes(q);
      });
    }
    return out;
  }, [baseAssets, filter, activeProject, searchQuery]);

  /** Bucket grid by month for the section dividers. */
  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: Asset[] }> = [];
    let cur: { label: string; items: Asset[] } | null = null;
    for (const a of filteredAssets) {
      const d = new Date(a.createdAt);
      const label = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
      if (!cur || cur.label !== label) {
        cur = { label, items: [] };
        out.push(cur);
      }
      cur.items.push(a);
    }
    return out;
  }, [filteredAssets]);

  const loading = section === "uploads" ? uploadLoading : genLoading;

  const openAssetPreview = useCallback((asset: Asset) => {
    const label =
      asset.source === "generation"
        ? asset.prompt || asset.modelLabel || t("workspace.assets.gen_fallback")
        : asset.name;
    const caption =
      asset.source === "generation"
        ? [asset.modelLabel, formatRelative(asset.createdAt, t)].filter(Boolean).join(" · ")
        : formatRelative(asset.createdAt, t);

    if (asset.kind === "3d") {
      setPreview({
        type: "model3d",
        model_url: asset.url,
        poster: asset.source === "generation" ? asset.thumbnailUrl : undefined,
        label,
        caption,
        prompt: asset.source === "generation" ? asset.prompt : undefined,
        settings:
          asset.source === "generation"
            ? [
                asset.modelLabel ? { label: asset.modelLabel } : null,
                asset.durationSec ? { label: t("workspace.assets.meta_duration"), value: `${asset.durationSec}s` } : null,
                asset.width && asset.height
                  ? { label: t("workspace.assets.meta_size"), value: `${asset.width}x${asset.height}` }
                  : null,
                { label: t("workspace.assets.meta_created"), value: formatRelative(asset.createdAt, t) },
              ].filter(Boolean) as Array<{ label: string; value?: string }>
            : [{ label: t("workspace.assets.meta_uploaded"), value: formatRelative(asset.createdAt, t) }],
      });
      return;
    }

    setPreview({
      type: asset.kind,
      url: asset.url,
      label,
      caption,
      prompt: asset.source === "generation" ? asset.prompt : undefined,
      settings:
        asset.source === "generation"
          ? [
              asset.modelLabel ? { label: asset.modelLabel } : null,
              asset.durationSec ? { label: t("workspace.assets.meta_duration"), value: `${asset.durationSec}s` } : null,
              asset.width && asset.height
                ? { label: t("workspace.assets.meta_size"), value: `${asset.width}x${asset.height}` }
                : null,
              { label: t("workspace.assets.meta_created"), value: formatRelative(asset.createdAt, t) },
            ].filter(Boolean) as Array<{ label: string; value?: string }>
          : [{ label: t("workspace.assets.meta_uploaded"), value: formatRelative(asset.createdAt, t) }],
    });
  }, [t]);

  const requestDeleteAsset = useCallback((asset: Asset) => {
    setDeleteTarget(asset);
  }, []);

  const confirmDeleteAsset = useCallback(async () => {
    if (!deleteTarget || !user) return;
    setDeletingAsset(true);
    try {
      const source =
        deleteTarget.source === "generation"
          ? "generation"
          : deleteTarget.rowId
            ? "user_asset"
            : "upload";
      const assetId =
        deleteTarget.source === "generation"
          ? deleteTarget.id
          : deleteTarget.rowId ?? deleteTarget.id.replace(/^user-asset-/, "");
      const { error, data } = await supabase.functions.invoke("workspace-run-node", {
        body: {
          action: "delete_workspace_asset",
          asset_source: source,
          asset_id: assetId,
          job_id: source === "generation" ? assetId : undefined,
          storage_bucket: deleteTarget.source === "upload" ? deleteTarget.storageBucket : undefined,
          storage_path: deleteTarget.source === "upload" ? deleteTarget.storagePath : undefined,
          url: deleteTarget.url,
        },
      });
      if (error) throw error;
      const result = (data ?? {}) as { error?: string };
      if (result.error) throw new Error(result.error);

      if (deleteTarget.source === "generation") {
        setGenAssets((items) => items.filter((item) => item.id !== deleteTarget.id));
      } else {
        setUploadAssets((items) => items.filter((item) => item.id !== deleteTarget.id));
      }
      if (preview?.url === deleteTarget.url || preview?.model_url === deleteTarget.url) {
        setPreview(null);
      }
      setDeleteTarget(null);
      toast.success(t("workspace.assets.deleteSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("workspace.assets.deleteFailed", { message }));
    } finally {
      setDeletingAsset(false);
    }
  }, [deleteTarget, preview, t, user]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden text-zinc-100">
      {/* ── Left sub-sidebar (≥ md) ─────────────────────────── */}
      <aside className="hidden h-full w-[212px] shrink-0 flex-col overflow-y-auto bg-[hsl(0_0%_7%)] md:flex">
        <SubNav
          section={section}
          setSection={(s) => {
            setSection(s);
            setActiveProject(null);
          }}
          activeProject={activeProject}
          setActiveProject={(id) => {
            setActiveProject(id);
            setSection("all");
          }}
          projects={projects}
        />
      </aside>

      {/* ── Mobile drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label={t("workspace.assets.close_filters")}
            className="absolute inset-0 bg-black/65"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-10 h-full w-[268px] max-w-[84vw] overflow-y-auto bg-[hsl(0_0%_7%)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] font-semibold text-zinc-100">{t("workspace.assets.browse")}</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                aria-label={t("workspace.assets.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SubNav
              section={section}
              setSection={(s) => {
                setSection(s);
                setActiveProject(null);
                setDrawerOpen(false);
              }}
              activeProject={activeProject}
              setActiveProject={(id) => {
                setActiveProject(id);
                setSection("all");
                setDrawerOpen(false);
              }}
              projects={projects}
            />
          </aside>
        </div>
      )}

      {/* ── Main panel ─────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          {/* Workspace sidebar toggle (mobile) — only shown when the
           *  dashboard wired in `onOpenSidebar`. Different button from
           *  the filters drawer below; this opens the OUTER sidebar
           *  (Home / All assets nav) while the filters drawer below
           *  opens the INNER sub-nav (sections + projects). */}
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label={t("workspace.assets.open_menu")}
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 hover:bg-white/[0.06] hover:text-white md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          {/* Filters drawer toggle (mobile) — opens the inner sub-nav
           *  drawer (sections / projects). Sits to the right of the
           *  hamburger above so they don't collide. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-md bg-white/[0.06] p-1.5 text-zinc-300 hover:bg-white/[0.08] md:hidden"
            aria-label={t("workspace.assets.open_filters")}
            title={t("workspace.assets.filters")}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-base font-semibold leading-snug text-zinc-100 sm:text-lg">
              {sectionTitle(section, projects, activeProject, t)}
            </h1>
            <span className="text-[11px] text-zinc-500">
              {filteredAssets.length} {filteredAssets.length === 1 ? t("workspace.assets.item_singular") : t("workspace.assets.item_plural")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Filter pills (desktop) */}
            <div className="hidden items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 sm:flex">
              {FILTER_BUTTONS.map((b) => {
                const Icon = b.icon;
                const active = filter === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setFilter(b.key)}
                    className={cn(
                      "flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] transition-colors",
                      active
                        ? "bg-white/[0.10] text-zinc-50"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                    )}
                  >
                    <Icon className="h-3 w-3" /> {t(b.labelKey)}
                  </button>
                );
              })}
            </div>
            {/* Filter pill compact (mobile) */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKind)}
              className="block rounded-md bg-white/[0.06] px-2 py-1 text-[12px] text-zinc-200 sm:hidden"
            >
              {FILTER_BUTTONS.map((b) => (
                <option key={b.key} value={b.key} className="bg-zinc-900">
                  {t(b.labelKey)}
                </option>
              ))}
            </select>
            {/* Search */}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                "rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                searchOpen && "bg-white/[0.06] text-zinc-100",
              )}
              aria-label={t("workspace.assets.search")}
            >
              <SearchIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (section === "uploads") {
                  setUploadLoading(true);
                  setUploadAssets([]);
                  // Triggers the uploads useEffect via state churn.
                  setSection("uploads");
                } else {
                  setGenLoading(true);
                  setGenAssets([]);
                  setGenHasMore(true);
                  void fetchGenPage(0).finally(() => setGenLoading(false));
                }
              }}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
              aria-label={t("workspace.assets.refresh")}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="bg-white/[0.03] px-4 py-2 sm:px-6">
            <div className="flex items-center gap-2">
              <SearchIcon className="h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("workspace.assets.search_placeholder")}
                autoFocus
                className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.05]"
                  aria-label={t("workspace.assets.clear_search")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {loading ? (
            <CenterLoader />
          ) : filteredAssets.length === 0 ? (
            <EmptyState section={section} hasFilter={filter !== "all" || !!searchQuery || !!activeProject} />
          ) : (
            <div className="flex flex-col gap-7 pb-12">
              {grouped.map((g) => (
                <section key={g.label} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                      {g.label}
                    </h2>
                    <span className="text-[11px] text-zinc-600">· {g.items.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {g.items.map((a) => (
                      <AssetCard
                        key={`${a.source}-${a.id}`}
                        asset={a}
                        onPreview={openAssetPreview}
                        onDelete={requestDeleteAsset}
                        onOpenCanvas={(asset) => {
                          const qp = new URLSearchParams();
                          if (asset.canvasId) qp.set("canvas", asset.canvasId);
                          if (asset.nodeId) qp.set("node", asset.nodeId);
                          const query = qp.toString();
                          if (asset.workspaceId) {
                            navigate(`/app/workspace/${asset.workspaceId}${query ? `?${query}` : ""}`);
                            return;
                          }
                          navigate(`/app/workspace${query ? `?${query}` : ""}`);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {section !== "uploads" && genHasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => void fetchGenPage(genAssets.length)}
                    className="rounded-md bg-white/[0.06] px-4 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-zinc-100"
                  >
                    {t("workspace.assets.load_more")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      {preview && (
        <NodePreviewLightbox
          preview={preview}
          onClose={() => setPreview(null)}
          /* Crop confirm — uploads the cropped Blob into the user's
           * own ai-media folder, then re-runs the uploads-listing
           * effect by toggling the section state so the new file
           * appears immediately. RLS guarantees the path-prefix
           * `${user.id}/...` is enforced. */
          onCropConfirmed={async (blob, filename) => {
            if (!user) {
              toast.error(t("workspace.crop.toast_signin_required"));
              return;
            }
            const ext = filename.match(/\.([^.]+)$/)?.[1] ?? "png";
            const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("ai-media")
              .upload(path, blob, {
                contentType: blob.type || "image/png",
                upsert: false,
              });
            if (upErr) {
              toast.error(t("workspace.crop.toast_save_failed", { error: upErr.message }));
              throw upErr;
            }
            toast.success(t("workspace.crop.toast_saved_library"));
            // Re-trigger the uploads listing so the new file shows
            // up. Cheapest signal: flip and restore the section.
            if (section === "uploads") {
              setSection("all");
              setTimeout(() => setSection("uploads"), 0);
            }
          }}
        />
      )}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deletingAsset && setDeleteTarget(null)}>
        <DialogContent className="w-[360px] gap-0 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#101113] p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,.64)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#F4FF00] via-[#F4FF00] to-[#f8ff66]" />
          <div className="px-5 pb-4 pt-5">
            <DialogHeader className="space-y-2 pr-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-300/20 bg-rose-500/12 text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <DialogTitle className="text-[16px] font-bold leading-tight text-white">
                  {t("workspace.assets.deleteTitle")}
                </DialogTitle>
              </div>
              <DialogDescription className="text-[13px] leading-relaxed text-zinc-400">
                {t("workspace.assets.deleteDescription")}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-white/[0.025] px-4 py-3">
            <button
              type="button"
              disabled={deletingAsset}
              onClick={() => setDeleteTarget(null)}
              className="inline-flex h-8 items-center justify-center rounded-[9px] border border-white/[0.08] px-3 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={deletingAsset}
              onClick={() => void confirmDeleteAsset()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] bg-red-500 px-3 text-[12px] font-bold text-white shadow-[0_10px_22px_rgba(239,68,68,.28)] transition hover:bg-red-400 disabled:opacity-60"
            >
              {deletingAsset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t("workspace.assets.deleteAction")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────── */

function SubNav({
  section,
  setSection,
  activeProject,
  setActiveProject,
  projects,
}: {
  section: SectionKind;
  setSection: (s: SectionKind) => void;
  activeProject: string | null;
  setActiveProject: (id: string | null) => void;
  projects: Array<{ id: string; name: string }>;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col">
      <div className="px-3 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        {t("workspace.assets.browse")}
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {SIDE_NAV.map((it) => {
          const Icon = it.icon;
          const active = section === it.key && !activeProject;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setSection(it.key)}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                active
                  ? "bg-white/[0.07] text-zinc-50"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t(it.labelKey)}
            </button>
          );
        })}
      </nav>
      {projects.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {t("workspace.assets.projects_heading")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {projects.map((p) => {
              const active = activeProject === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProject(p.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 truncate rounded-md px-2.5 text-[12.5px] transition-colors",
                    active
                      ? "bg-white/[0.07] text-zinc-50"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                  )}
                  title={p.name}
                >
                  <Folder className="h-3 w-3 shrink-0 text-zinc-500" />
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onPreview,
  onDelete,
  onOpenCanvas,
}: {
  asset: Asset;
  onPreview: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onOpenCanvas: (asset: GenerationAsset) => void;
}) {
  const { t } = useLanguage();
  const Icon = KIND_ICON[asset.kind];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Lazily play / pause on hover so the grid doesn't choke on a
  // page full of <video autoplay loop>.
  useEffect(() => {
    if (asset.kind !== "video" || !videoRef.current) return;
    if (hovered) {
      void videoRef.current.play().catch(() => undefined);
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [hovered, asset.kind]);

  const displayUrl =
    asset.kind === "3d" && asset.source === "generation" && asset.thumbnailUrl
      ? asset.thumbnailUrl
      : asset.url;
  const modelLabel =
    asset.source === "generation"
      ? asset.modelLabel || t("workspace.assets.gen_fallback")
      : asset.name;
  const durationLabel =
    asset.source === "generation" && asset.durationSec
      ? `${Math.round(asset.durationSec)}s`
      : null;
  const dateLabel = formatRelative(asset.createdAt, t);
  const contextMenuItems: MediaContextMenuItem[] = [
    {
      key: "preview",
      label: t("workspace.mediaMenu.preview"),
      icon: Eye,
      onSelect: () => onPreview(asset),
    },
    {
      key: "download",
      label: t("workspace.mediaMenu.download"),
      icon: Download,
      onSelect: () =>
        void downloadFromUrl(
          asset.url,
          asset.source === "generation"
            ? asset.prompt || t("workspace.assets.gen_fallback")
            : asset.name,
        ),
    },
    {
      key: "duplicate",
      label: t("workspace.mediaMenu.duplicate"),
      icon: Copy,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "move-board",
      label: t("workspace.mediaMenu.moveToBoard"),
      icon: Folder,
      separatorBefore: true,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "copy-board",
      label: t("workspace.mediaMenu.copyToBoard"),
      icon: Copy,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      key: "delete",
      label: t("workspace.mediaMenu.delete"),
      icon: Trash2,
      separatorBefore: true,
      danger: true,
      onSelect: () => onDelete(asset),
    },
  ];

  return (
    <div
      data-testid="asset-card"
      className="group relative h-[230px] overflow-hidden rounded-[10px] bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,.035)] transition-transform duration-150 hover:-translate-y-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
    >
      <div
        className="relative flex h-full w-full cursor-zoom-in items-center justify-center overflow-hidden"
        role="button"
        tabIndex={0}
        title={t("workspace.assets.open_download")}
        onClick={() => onPreview(asset)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPreview(asset);
          }
        }}
      >
        {asset.kind === "video" ? (
          <video
            ref={videoRef}
            src={displayUrl}
            className="pointer-events-none h-full w-auto max-w-full object-contain"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : asset.kind === "audio" ? (
          <div className="grid h-full w-full place-items-center text-zinc-500">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.06]">
              <Music className="h-6 w-6" />
            </span>
          </div>
        ) : asset.kind === "3d" ? (
          displayUrl ? (
            <img
              src={displayUrl}
              alt=""
              className="pointer-events-none h-full w-auto max-w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-zinc-700">
              <Box className="h-10 w-10" />
            </div>
          )
        ) : (
          <img
            src={displayUrl}
            alt=""
            className="pointer-events-none h-full w-auto max-w-full object-contain"
            loading="lazy"
          />
        )}

        {/* Hover actions */}
        <div className="absolute right-1.5 top-1.5 flex translate-y-1 items-center gap-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(asset);
            }}
            className="grid h-7 w-7 place-items-center rounded-full border border-white/[0.10] bg-black/62 text-white shadow-[0_8px_20px_rgba(0,0,0,.35)] backdrop-blur transition hover:border-rose-300/40 hover:bg-rose-500 hover:text-white"
            title={t("workspace.assets.deleteAsset")}
            aria-label={t("workspace.assets.deleteAsset")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/62 text-white backdrop-blur transition hover:bg-white hover:text-zinc-950"
            title={t("workspace.assets.open_download")}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {asset.source === "generation" && (asset.workspaceId || asset.canvasId) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCanvas(asset);
              }}
              className="grid h-7 w-7 place-items-center rounded-full bg-black/62 text-white backdrop-blur transition hover:bg-white hover:text-zinc-950"
              title={t("workspace.assets.open_in_space")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/58 via-black/16 to-transparent px-2 pb-1.5 pt-10 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex max-w-full flex-wrap items-end gap-x-2 gap-y-0.5 text-[8px] font-semibold leading-[10px] text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,.85)]">
          <span className="max-w-[120px] truncate">{modelLabel}</span>
          {durationLabel && <span className="shrink-0">{durationLabel}</span>}
          <span className="shrink-0">{dateLabel}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <Icon className="h-2.5 w-2.5" />
            {t(asset.kind === "3d" ? "workspace.assets.kind_3d" : `workspace.assets.kind_${asset.kind}`)}
          </span>
        </div>
      </div>
      {contextMenu && (
        <MediaContextMenu
          position={contextMenu}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function CenterLoader() {
  const { t } = useLanguage();
  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("workspace.assets.loading")}
    </div>
  );
}

function EmptyState({
  section,
  hasFilter,
}: {
  section: SectionKind;
  hasFilter: boolean;
}) {
  const { t } = useLanguage();
  const msg = hasFilter
    ? t("workspace.assets.no_filter_match")
    : section === "uploads"
      ? t("workspace.assets.no_uploads")
      : t("workspace.assets.no_generations");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-500">
      <ImageIcon className="h-8 w-8 text-zinc-600" />
      <div className="text-sm">{t("workspace.assets.no_assets")}</div>
      <div className="max-w-xs text-xs text-zinc-600">{msg}</div>
    </div>
  );
}

function sectionTitle(
  section: SectionKind,
  projects: Array<{ id: string; name: string }>,
  activeProject: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (activeProject) {
    return projects.find((p) => p.id === activeProject)?.name ?? t("workspace.assets.project_fallback");
  }
  switch (section) {
    case "all":       return t("workspace.assets.all_assets");
    case "spaces":    return t("workspace.assets.spaces");
    case "uploads":   return t("workspace.assets.uploads");
  }
}

function formatRelative(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return t("workspace.assets.relative_just_now");
  if (diffMin < 60) return t("workspace.assets.relative_minutes", { n: diffMin });
  const h = Math.floor(diffMin / 60);
  if (h < 24) return t("workspace.assets.relative_hours", { n: h });
  const days = Math.floor(h / 24);
  if (days < 7) return t("workspace.assets.relative_days", { n: days });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
