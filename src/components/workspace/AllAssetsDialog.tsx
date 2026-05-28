import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Box,
  ChevronDown,
  Check,
  Clock3,
  Film,
  Folder,
  Grid2X2,
  Image as ImageIcon,
  List,
  Music,
  Play,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PROJECT_NAME, useWorkspaceStore } from "@/store/useWorkspaceStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/hooks/useSignedUrl";

type AssetSource = "generated" | "uploaded" | "element";
type AssetType = "image" | "video" | "audio" | "model3d";
type LibraryTab = "project" | "recent";

export interface DialogAsset {
  id: string;
  source: AssetSource;
  fieldType: AssetType;
  url: string;
  posterUrl?: string;
  label: string;
  fileName?: string;
  fromNodeId: string;
  fromNodeLabel: string;
  projectId: string | null;
  workspaceId: string | null;
  canvasId: string;
  createdAt?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function dateMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function genFieldType(gen: Record<string, unknown>): AssetType | null {
  const modelUrl = firstString(
    gen.model_url,
    gen.modelUrl,
    gen.glb_url,
    gen.gltf_url,
    gen.mesh_url,
  );
  if (modelUrl) return "model3d";
  const t = firstString(
    gen.type,
    gen.kind,
    gen.mediaType,
    gen.mimeType,
    gen.contentType,
  )?.toLowerCase() ?? "";
  if (t === "image" || t === "video" || t === "audio") return t;
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  if (t.includes("image")) return "image";
  if (t.includes("3d") || t.includes("model")) return "model3d";
  const url = firstString(
    gen.url,
    gen.output_url,
    gen.outputUrl,
    gen.asset_url,
    gen.media_url,
    gen.mediaUrl,
    gen.image_url,
    gen.imageUrl,
    gen.video_url,
    gen.videoUrl,
    gen.audio_url,
    gen.audioUrl,
    gen.file_url,
    gen.fileUrl,
    gen.download_url,
    gen.downloadUrl,
  ) ?? "";
  if (/\.(glb|gltf|usdz|obj|fbx)(\?|#|$)/i.test(url)) return "model3d";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/i.test(url)) return "audio";
  return null;
}

function collectStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return firstString(
      record.url,
      record.output_url,
      record.outputUrl,
      record.asset_url,
      record.media_url,
      record.mediaUrl,
      record.image_url,
      record.imageUrl,
      record.video_url,
      record.videoUrl,
      record.audio_url,
      record.audioUrl,
      record.file_url,
      record.fileUrl,
      record.download_url,
      record.downloadUrl,
    ) ?? [];
  });
}

function outputUrlsFromRecord(record: Record<string, unknown>): string[] {
  const urls = [
    ...collectStringArray(record.url),
    ...collectStringArray(record.output_url),
    ...collectStringArray(record.outputUrl),
    ...collectStringArray(record.asset_url),
    ...collectStringArray(record.media_url),
    ...collectStringArray(record.mediaUrl),
    ...collectStringArray(record.image_url),
    ...collectStringArray(record.imageUrl),
    ...collectStringArray(record.video_url),
    ...collectStringArray(record.videoUrl),
    ...collectStringArray(record.audio_url),
    ...collectStringArray(record.audioUrl),
    ...collectStringArray(record.file_url),
    ...collectStringArray(record.fileUrl),
    ...collectStringArray(record.download_url),
    ...collectStringArray(record.downloadUrl),
    ...collectStringArray(record.urls),
    ...collectStringArray(record.images),
    ...collectStringArray(record.videos),
    ...collectStringArray(record.audios),
    ...collectStringArray(record.files),
    ...collectStringArray(record.output),
  ];
  return [...new Set(urls.filter(Boolean))];
}

async function resolveAssetUrl(rawUrl: string): Promise<string> {
  const normalized = rawUrl.trim();
  if (!normalized) return rawUrl;
  if (/^(data:|blob:)/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return getSignedUrl(normalized);
  const path = normalized.replace(/^\/+/, "");
  if (/^(ai-media|user_assets)\//i.test(path)) return getSignedUrl(`/${path}`);
  return getSignedUrl(path);
}

const AllAssetsDialog = ({ open, onClose }: Props) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const allGraphs = useWorkspaceStore((s) => s.graphs);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const current = useWorkspaceStore((s) => s.current);
  const projects = useWorkspaceStore((s) => s.projects);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<LibraryTab>("recent");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [draggingExternal, setDraggingExternal] = useState(false);
  const [remoteAssets, setRemoteAssets] = useState<DialogAsset[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /* Project selector state. Each Space (`workspace`) belongs to a
   *  Project; up until now the Board sidebar showed every space
   *  across every project, which the user reported was overwhelming
   *  on accounts with many projects. We default the Project dropdown
   *  to the currently-open project (current.projectId or activeProjectId)
   *  so the user lands on the spaces they're actually in, then filter
   *  all assets by `asset.projectId === selectedProjectId`.
   *
   *  `effectiveProjectId` falls back through current → active → first
   *  available so we never end up showing "no spaces" because nothing
   *  was selected yet. */
  const effectiveProjectId =
    selectedProjectId ??
    current?.projectId ??
    activeProjectId ??
    projects[0]?.id ??
    null;

  const canvasMetaById = useMemo(
    () => new Map(canvases.map((canvas) => [canvas.id, canvas] as const)),
    [canvases],
  );

  const workspaceProjectById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.projectId] as const)),
    [workspaces],
  );

  const localizeProjectName = useCallback(
    (name: string | null | undefined) => {
      const trimmed = name?.trim();
      if (!trimmed) return t("workspace.allAssets.untitledProject");
      if (trimmed === DEFAULT_PROJECT_NAME) return t("workspace.allAssets.defaultProject");
      return trimmed;
    },
    [t],
  );

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: localizeProjectName(project.name),
        color: project.color ?? null,
      })),
    [projects, localizeProjectName],
  );

  const activeProjectName =
    projectOptions.find((p) => p.id === effectiveProjectId)?.name ?? t("workspace.allAssets.allProjects");

  const graphAssets = useMemo<DialogAsset[]>(() => {
    const out: DialogAsset[] = [];
    const seenUrls = new Set<string>();

    for (const canvasId of Object.keys(allGraphs)) {
      const graph = allGraphs[canvasId];
      const canvasMeta = canvasMetaById.get(canvasId);
      const workspaceId = graph?.workspaceId ?? canvasMeta?.workspaceId ?? null;
      const projectId =
        graph?.projectId ??
        canvasMeta?.projectId ??
        (workspaceId ? workspaceProjectById.get(workspaceId) ?? null : null);
      for (const n of graph?.nodes ?? []) {
        const d = (n.data ?? {}) as Record<string, unknown>;

        if (
          n.type === "assetNode" &&
          typeof d.previewUrl === "string" &&
          typeof d.fieldType === "string"
        ) {
          const seenKey = `${projectId ?? workspaceId ?? "global"}:${d.previewUrl}`;
          if (!seenUrls.has(seenKey)) {
            seenUrls.add(seenKey);
            out.push({
              id: `u_${canvasId}_${n.id}`,
              source: "uploaded",
              fieldType: d.fieldType as AssetType,
              url: d.previewUrl,
              posterUrl: typeof d.posterUrl === "string" ? d.posterUrl : undefined,
              label:
                (d.label as string | undefined) ||
                (d.fileName as string | undefined) ||
                t("workspace.allAssets.asset"),
              fileName: d.fileName as string | undefined,
              fromNodeId: n.id,
              fromNodeLabel:
                (d.label as string | undefined) ||
                (d.fileName as string | undefined) ||
                t("workspace.allAssets.asset"),
              projectId,
              workspaceId,
              canvasId,
              createdAt:
                typeof d.uploadedAt === "number"
                  ? d.uploadedAt
                  : typeof d.createdAt === "number"
                    ? d.createdAt
                    : typeof d.addedAt === "number"
                      ? d.addedAt
                      : graph?.updatedAt,
            });
          }
        }

        const generations = Array.isArray(d.generations)
          ? (d.generations as Array<Record<string, unknown>>)
          : [];

        for (let i = 0; i < generations.length; i += 1) {
          const g = generations[i] ?? {};
          const fieldType = genFieldType(g);
          if (!fieldType) continue;

          const assetUrl =
            fieldType === "model3d" && typeof g.model_url === "string"
              ? g.model_url
              : (g.url as string | undefined);
          const seenKey = `${projectId ?? workspaceId ?? "global"}:${assetUrl}`;
          if (!assetUrl || seenUrls.has(seenKey)) continue;

          seenUrls.add(seenKey);
          const posterUrl =
            fieldType === "model3d" &&
            typeof g.url === "string" &&
            g.url !== assetUrl
              ? g.url
              : undefined;
          const labelBase =
            (d.label as string | undefined) ||
            ((d.params as Record<string, unknown> | undefined)
              ?.nodeName as string | undefined) ||
            n.type ||
            "output";

          out.push({
            id: `g_${canvasId}_${n.id}_${(g.id as string | undefined) ?? i}`,
            source: "generated",
            fieldType,
            url: assetUrl,
            posterUrl,
            label: labelBase,
            fromNodeId: n.id,
            fromNodeLabel: labelBase,
            projectId,
            workspaceId,
            canvasId,
            createdAt: typeof g.createdAt === "number" ? g.createdAt : graph?.updatedAt,
          });
        }
      }
    }

    return out.sort((a, b) => {
      if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [allGraphs, canvasMetaById, t, workspaceProjectById]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !user) {
      setRemoteAssets([]);
      return;
    }

    const loadProjectAssets = async () => {
      const next: DialogAsset[] = [];
      const seen = new Set<string>();
      const addAsset = (asset: DialogAsset) => {
        const key = `${asset.fieldType}:${asset.url.split("?")[0]}`;
        if (seen.has(key)) return;
        seen.add(key);
        next.push(asset);
      };

      const jobSelect =
        "id, status, node_type, provider, model, request, result, created_at, project_id, workspace_id, canvas_id, node_id";
      let jobsQuery = supabase
        .from("workspace_generation_jobs")
        .select(jobSelect)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500);
      jobsQuery = effectiveProjectId
        ? jobsQuery.eq("project_id", effectiveProjectId)
        : jobsQuery.eq("user_id", user.id);

      const { data: jobs, error: jobsError } = await jobsQuery;
      if (jobsError) {
        console.warn("[AllAssetsDialog] workspace_generation_jobs load failed:", jobsError.message);
      }

      for (const row of jobs ?? []) {
        const result = asRecord(row.result);
        const outputs = asRecord(result.outputs);
        const providerMeta = asRecord(result.provider_meta);
        const modelUrl = firstString(
          result.model_url,
          result.modelUrl,
          providerMeta.model_url,
          outputs.model_url,
          outputs.glb_url,
          outputs.gltf_url,
          outputs.mesh_url,
          outputs.model,
        );
        const mediaUrls = modelUrl ? [modelUrl] : outputUrlsFromRecord(result).concat(outputUrlsFromRecord(outputs));
        const modelLabel =
          firstString(row.model, row.node_type, row.provider) ?? t("workspace.allAssets.generation");
        const request = asRecord(row.request);
        const params = asRecord(request.params);
        const prompt = firstString(params.prompt, params.system_prompt, result.prompt);
        const createdAt = dateMs(row.created_at) ?? Date.now();
        const rowProjectId = typeof row.project_id === "string" ? row.project_id : null;
        const rowWorkspaceId = typeof row.workspace_id === "string" ? row.workspace_id : null;
        const rowCanvasId =
          typeof row.canvas_id === "string"
            ? row.canvas_id
            : `standalone:${rowProjectId ?? effectiveProjectId ?? user.id}`;
        const rowNodeId = typeof row.node_id === "string" ? row.node_id : String(row.id);

        for (let index = 0; index < mediaUrls.length; index += 1) {
          const rawUrl = mediaUrls[index];
          if (!rawUrl) continue;
          const fieldType = modelUrl
            ? "model3d"
            : genFieldType({
                ...result,
                ...outputs,
                url: rawUrl,
                type: firstString(result.type, row.node_type, row.provider),
              });
          if (!fieldType) continue;
          const url = await resolveAssetUrl(rawUrl);
          const posterUrl =
            fieldType === "model3d"
              ? firstString(
                  providerMeta.rendered_image,
                  result.rendered_image,
                  result.preview_image,
                  outputs.rendered_image,
                  outputs.preview_image,
                  outputs.thumbnail_url,
                  outputs.poster,
                  outputs.output_image,
                )
              : firstString(
                  result.thumbnail_url,
                  result.thumbnailUrl,
                  result.poster,
                  outputs.thumbnail_url,
                  outputs.poster,
                );
          addAsset({
            id: `job_${row.id}_${index}`,
            source: "generated",
            fieldType,
            url,
            posterUrl: posterUrl ? await resolveAssetUrl(posterUrl) : undefined,
            label: prompt || modelLabel,
            fileName: cleanAssetName(rawUrl) ?? modelLabel,
            fromNodeId: rowNodeId,
            fromNodeLabel: modelLabel,
            projectId: rowProjectId ?? effectiveProjectId,
            workspaceId: rowWorkspaceId,
            canvasId: rowCanvasId,
            createdAt,
          });
        }
      }

      const { data: uploads, error: uploadsError } = await (supabase as any)
        .from("user_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (uploadsError) {
        console.warn("[AllAssetsDialog] user_assets load failed:", uploadsError.message);
      }

      for (const row of (uploads ?? []) as Array<Record<string, unknown>>) {
        const metadata = asRecord(row.metadata);
        const projectId = firstString(row.project_id, metadata.project_id) ?? effectiveProjectId;
        if (effectiveProjectId && projectId && projectId !== effectiveProjectId) continue;
        const rawUrl = firstString(
          row.file_url,
          row.url,
          row.public_url,
          row.thumbnail_url,
          metadata.file_url,
          metadata.url,
          metadata.storage_path,
        );
        if (!rawUrl) continue;
        const url = await resolveAssetUrl(rawUrl);
        const fieldType = genFieldType({
          url,
          type: firstString(row.file_type, row.mime_type, row.type, metadata.mime_type, metadata.content_type),
        });
        if (!fieldType) continue;
        addAsset({
          id: `upload_${String(row.id ?? rawUrl)}`,
          source: "uploaded",
          fieldType,
          url,
          posterUrl:
            fieldType === "video" || fieldType === "model3d"
              ? await resolveAssetUrl(
                  firstString(row.thumbnail_url, metadata.thumbnail_url, metadata.poster_url) ?? rawUrl,
                )
              : undefined,
          label:
            cleanAssetName(
              firstString(row.name, row.file_name, row.filename, metadata.name, metadata.file_name),
            ) ??
            cleanAssetName(rawUrl) ??
            t("workspace.allAssets.asset"),
          fileName:
            cleanAssetName(
              firstString(row.file_name, row.filename, metadata.file_name, metadata.filename),
            ) ?? cleanAssetName(rawUrl),
          fromNodeId: String(row.id ?? rawUrl),
          fromNodeLabel: t("workspace.allAssets.upload"),
          projectId,
          workspaceId: null,
          canvasId: `upload:${projectId ?? user.id}`,
          createdAt: dateMs(row.created_at) ?? Date.now(),
        });
      }

      const { data: editorProjects, error: editorProjectsError } = await (supabase as any)
        .from("editor_projects")
        .select("id, name, thumbnail, created_at, updated_at, data")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (editorProjectsError) {
        console.warn(
          "[AllAssetsDialog] editor_projects load failed:",
          editorProjectsError.message,
        );
      }

      for (const row of (editorProjects ?? []) as Array<Record<string, unknown>>) {
        const projectData = asRecord(row.data);
        const mediaLibrary = asRecord(projectData.mediaLibrary);
        const mediaItems = Array.isArray(mediaLibrary.items)
          ? (mediaLibrary.items as Array<Record<string, unknown>>)
          : [];
        const editorProjectId = firstString(row.id, projectData.id) ?? "editor-project";
        const editorProjectName =
          firstString(row.name, projectData.name) ?? t("workspace.allAssets.editingProject");
        const rowCreatedAt =
          dateMs(row.updated_at) ?? dateMs(row.created_at) ?? dateMs(projectData.modifiedAt);

        for (let index = 0; index < mediaItems.length; index += 1) {
          const item = asRecord(mediaItems[index]);
          const metadata = asRecord(item.metadata);
          const filmstrip = Array.isArray(item.filmstripThumbnails)
            ? (item.filmstripThumbnails as Array<Record<string, unknown>>)
            : [];
          const firstFilmstrip = filmstrip[0] ? asRecord(filmstrip[0]) : {};
          const rawUrl = firstString(
            item.originalUrl,
            item.url,
            item.publicUrl,
            item.src,
            item.file_url,
            item.fileUrl,
            item.storage_path,
            item.storagePath,
            item.thumbnailUrl,
            firstFilmstrip.url,
          );
          if (!rawUrl || /^blob:/i.test(rawUrl)) continue;
          const fieldType =
            genFieldType({
              url: rawUrl,
              type: firstString(
                item.type,
                metadata.mimeType,
                metadata.mime_type,
                metadata.contentType,
                metadata.content_type,
              ),
            }) ??
            (firstString(item.type) === "video"
              ? "video"
              : firstString(item.type) === "audio"
                ? "audio"
                : firstString(item.type) === "image"
                  ? "image"
                  : null);
          if (!fieldType) continue;

          const posterRaw = firstString(
            item.thumbnailUrl,
            firstFilmstrip.url,
            row.thumbnail,
          );
          const itemId = firstString(item.id) ?? `${editorProjectId}_${index}`;
          const displayName =
            cleanAssetName(firstString(item.name, item.fileName, item.filename)) ??
            cleanAssetName(rawUrl) ??
            t("workspace.allAssets.projectAsset", { name: editorProjectName });
          addAsset({
            id: `editor_${editorProjectId}_${itemId}`,
            source: "uploaded",
            fieldType,
            url: await resolveAssetUrl(rawUrl),
            posterUrl:
              posterRaw && posterRaw !== rawUrl
                ? await resolveAssetUrl(posterRaw)
                : undefined,
            label: displayName,
            fileName: displayName,
            fromNodeId: itemId,
            fromNodeLabel: editorProjectName,
            projectId: effectiveProjectId,
            workspaceId: null,
            canvasId: `editor:${editorProjectId}`,
            createdAt:
              dateMs(item.createdAt) ??
              dateMs(item.updatedAt) ??
              dateMs(item.modifiedAt) ??
              rowCreatedAt ??
              Date.now(),
          });
        }
      }

      const collectStorageBucket = async (
        bucket: "ai-media" | "user_assets",
        prefix: string,
        depth = 0,
      ): Promise<void> => {
        const { data, error } = await supabase.storage.from(bucket).list(prefix, {
          limit: 200,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (error) {
          console.warn(`[AllAssetsDialog] ${bucket} list failed:`, error.message);
          return;
        }

        for (const obj of data ?? []) {
          const path = `${prefix}/${obj.name}`;
          if (!obj.id) {
            if (depth < 3) await collectStorageBucket(bucket, path, depth + 1);
            continue;
          }
          const fieldType = genFieldType({
            url: path,
            type: typeof obj.metadata?.mimetype === "string" ? obj.metadata.mimetype : undefined,
          });
          if (!fieldType) continue;
          const displayName = cleanAssetName(obj.name) ?? obj.name;
          addAsset({
            id: `storage_${bucket}_${path}`,
            source: "uploaded",
            fieldType,
            url: await resolveAssetUrl(`${bucket}/${path}`),
            label: displayName,
            fileName: displayName,
            fromNodeId: path,
            fromNodeLabel:
              bucket === "user_assets"
                ? t("workspace.allAssets.editorUpload")
                : t("workspace.allAssets.upload"),
            projectId: effectiveProjectId,
            workspaceId: null,
            canvasId: `storage:${bucket}`,
            createdAt: dateMs(obj.created_at) ?? Date.now(),
          });
        }
      };

      await Promise.all([
        collectStorageBucket("ai-media", user.id),
        collectStorageBucket("user_assets", user.id),
      ]);

      if (!cancelled) {
        setRemoteAssets(
          next.sort((a, b) => {
            if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
            if (a.createdAt) return -1;
            if (b.createdAt) return 1;
            return a.label.localeCompare(b.label);
          }),
        );
      }
    };

    void loadProjectAssets();
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, open, t, user]);

  const assets = useMemo<DialogAsset[]>(() => {
    const out: DialogAsset[] = [];
    const seen = new Set<string>();
    for (const asset of [...remoteAssets, ...graphAssets]) {
      const key = `${asset.fieldType}:${asset.url.split("?")[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(asset);
    }
    return out.sort((a, b) => {
      if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [graphAssets, remoteAssets]);

  const projectAssets = useMemo(() => {
    if (!effectiveProjectId) return assets;
    return assets.filter((asset) => asset.projectId === effectiveProjectId);
  }, [assets, effectiveProjectId]);

  const visibleAssets = useMemo(() => {
    const pool = activeTab === "recent" ? projectAssets.slice(0, 24) : projectAssets;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((asset) => {
      const haystack = `${asset.label} ${asset.fileName ?? ""} ${asset.fromNodeLabel}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activeTab, projectAssets, query]);

  const spawnAssets = useCallback((items: DialogAsset[]) => {
    if (items.length === 0) return;
    window.dispatchEvent(
      new CustomEvent("workspace-spawn-assets", {
        detail: {
          assets: items.map((asset) => ({
            fieldType: asset.fieldType,
            url: asset.url,
            label: asset.label,
            fileName: asset.fileName,
            posterUrl: asset.posterUrl,
          })),
        },
      }),
    );
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setQuery("");
    setActiveTab("recent");
    setSelectedProjectId(
      current?.projectId ?? activeProjectId ?? projects[0]?.id ?? null,
    );
    const id = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [activeProjectId, current?.projectId, open, projects]);

  useEffect(() => {
    if (selectedId && !visibleAssets.some((asset) => asset.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleAssets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Enter" && selectedId) {
        const asset = assets.find((item) => item.id === selectedId);
        if (asset) spawnAssets([asset]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [assets, onClose, open, selectedId, spawnAssets]);

  if (!open) return null;

  const onAssetDragStart = (event: React.DragEvent, asset: DialogAsset) => {
    event.dataTransfer.setData(
      "application/reactflow-asset-reuse",
      JSON.stringify({
        fieldType: asset.fieldType,
        url: asset.url,
        label: asset.label,
        fileName: asset.fileName,
        posterUrl: asset.posterUrl,
      }),
    );
    event.dataTransfer.effectAllowed = "move";
    setTimeout(() => onClose(), 0);
  };

  const onExternalDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDraggingExternal(false);
    if (event.dataTransfer.files?.length) {
      window.dispatchEvent(
        new CustomEvent("workspace-upload-files", {
          detail: { files: Array.from(event.dataTransfer.files) },
        }),
      );
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/68"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDraggingExternal(true);
        }
      }}
      onDragLeave={() => setDraggingExternal(false)}
      onDrop={onExternalDrop}
    >
      <div
        className={cn(
          "relative flex h-[600px] w-[900px] max-w-[calc(100vw-64px)] overflow-hidden rounded-[7px]",
          "border border-[#3a3a3a] bg-[#171717] text-[#d7d7d7] shadow-[0_24px_80px_rgba(0,0,0,.55)]",
          draggingExternal && "ring-2 ring-yellow-500/70",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {draggingExternal && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-yellow-500/12 text-yellow-100">
            <div className="flex items-center gap-2 rounded-md border border-yellow-400/40 bg-black/70 px-4 py-2 text-sm font-semibold">
              <UploadCloud className="h-4 w-4" />
              {t("workspace.allAssets.dropToUpload")}
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header tightened from 64px → 48px to match every other
           *  dialog header in the workspace. The fixed `w-[112px]`
           *  on the title forced the search field off the natural
           *  baseline because the title's font-size (14px) and the
           *  search field's font-size (13px) sat in different
           *  vertical anchors at 64px tall. New layout: shorter
           *  bar, items center-aligned via the flex container, no
           *  fixed-width title slot — the title takes its natural
           *  width, gap-3 separates from the next control. */}
          <header className="flex h-[48px] shrink-0 items-center gap-3 px-4">
            {/* Project picker — replaces the static "Media Browser"
             *  title because the user wants the dialog to scope to a
             *  single project at a time (otherwise the Board sidebar
             *  below dumps every space from every project, which is
             *  too much on accounts with many projects). The active
             *  project name shows on the trigger; the popover lists
             *  the user's projects with their saved colour chip. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-[30px] shrink-0 items-center gap-2 rounded-[5px] bg-[#1f1f1f] px-2.5 text-left text-[13.5px] font-semibold tracking-tight text-[#e8e8e8] outline-none transition hover:bg-[#262626] focus-visible:bg-[#262626]"
                  title={t("workspace.allAssets.switchProject")}
                >
                  {projectOptions.find((p) => p.id === effectiveProjectId)
                    ?.color ? (
                    <span
                      className="h-[10px] w-[10px] shrink-0 rounded-full"
                      style={{
                        background: projectOptions.find((p) => p.id === effectiveProjectId)
                          ?.color as string,
                      }}
                    />
                  ) : null}
                  <span className="max-w-[200px] truncate">{activeProjectName}</span>
                  <ChevronDown className="h-[13px] w-[13px] shrink-0 text-[#8d8d8d]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="z-[1600] min-w-[220px] max-h-[320px] overflow-y-auto rounded-[6px] bg-[#1c1c1c] p-1 shadow-[0_14px_30px_rgba(0,0,0,.55)]"
              >
                {projectOptions.length === 0 ? (
                  <DropdownMenuItem
                    disabled
                    className="flex h-[30px] items-center px-2 text-[13px] text-[#9a9a9a]"
                  >
                    {t("workspace.allAssets.noProjects")}
                  </DropdownMenuItem>
                ) : (
                  projectOptions.map((project) => {
                    const isActive = project.id === effectiveProjectId;
                    return (
                      <DropdownMenuItem
                        key={project.id}
                        className={cn(
                          "flex h-[30px] cursor-pointer items-center gap-2 rounded-[3px] px-2 text-[13px] focus:bg-[#2a2a2a]",
                          isActive
                            ? "bg-yellow-500/15 text-yellow-100 focus:bg-yellow-500/20"
                            : "text-[#dedede]",
                        )}
                        onSelect={() => {
                          setSelectedProjectId(project.id);
                          setSelectedId(null);
                        }}
                      >
                        {project.color ? (
                          <span
                            className="h-[10px] w-[10px] shrink-0 rounded-full"
                            style={{ background: project.color }}
                          />
                        ) : (
                          <span className="h-[10px] w-[10px] shrink-0 rounded-full bg-[#3a3a3a]" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        {isActive && (
                          <Check className="h-[13px] w-[13px] shrink-0 text-yellow-300" />
                        )}
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative h-[28px] w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#9a9a9a]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("workspace.allAssets.searchPlaceholder")}
                className="h-full w-full rounded-[4px] bg-[#181818] pl-8 pr-2 text-[13px] font-medium leading-none text-zinc-100 outline-none placeholder:text-[#777] focus:bg-[#1f1f1f]"
              />
            </div>
            <div className="flex h-[28px] items-center rounded-[4px] bg-[#181818] p-[2px]">
              <button
                type="button"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "grid h-[24px] w-[28px] place-items-center rounded-[3px] transition",
                  viewMode === "grid"
                    ? "bg-[#f4ff00] text-black"
                    : "bg-transparent text-[#9b9b9b] hover:text-white",
                )}
              >
                <Grid2X2 className="h-[14px] w-[14px]" />
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "grid h-[24px] w-[28px] place-items-center rounded-[3px] transition",
                  viewMode === "list"
                    ? "bg-[#333] text-white"
                    : "bg-transparent text-[#9b9b9b] hover:text-white",
                )}
              >
                <List className="h-[14px] w-[14px]" />
              </button>
            </div>
            <span className="ml-auto shrink-0 text-[11.5px] font-medium leading-none text-[#8f8f8f]">
              {t("workspace.allAssets.fileCount", { n: visibleAssets.length })}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#a7a7a7] transition hover:bg-[#242424] hover:text-white"
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-[180px] shrink-0 bg-[#202020] px-3 py-4">
              <div>
                <p className="mb-3 text-[12px] font-semibold text-[#969696]">
                  {t("workspace.allAssets.asset")}
                </p>
                <SidebarItem
                  active={activeTab === "recent"}
                  icon={Clock3}
                  label={t("workspace.allAssets.recent")}
                  count={Math.min(projectAssets.length, 24)}
                  onClick={() => setActiveTab("recent")}
                />
                <SidebarItem
                  active={activeTab === "project"}
                  icon={Folder}
                  label={t("workspace.allAssets.projectFiles")}
                  count={projectAssets.length}
                  onClick={() => setActiveTab("project")}
                />
              </div>
            </aside>

            <main className="ws-scroll-hide min-w-0 flex-1 overflow-y-auto bg-[#151515] p-5">
              {visibleAssets.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px] font-medium text-[#777]">
                  {projectAssets.length === 0
                    ? t("workspace.allAssets.noProjectFiles")
                    : t("workspace.allAssets.noMatchingAssets")}
                </div>
              ) : viewMode === "grid" ? (
                <ul className="grid grid-cols-4 gap-3">
                  {visibleAssets.map((asset) => (
                    <AssetGridCard
                      key={asset.id}
                      asset={asset}
                      selected={asset.id === selectedId}
                      onClick={() => setSelectedId(asset.id)}
                      onDoubleClick={() => spawnAssets([asset])}
                      onDragStart={(event) => onAssetDragStart(event, asset)}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="space-y-1">
                  {visibleAssets.map((asset) => (
                    <AssetListRow
                      key={asset.id}
                      asset={asset}
                      selected={asset.id === selectedId}
                      onClick={() => setSelectedId(asset.id)}
                      onDoubleClick={() => spawnAssets([asset])}
                      onDragStart={(event) => onAssetDragStart(event, asset)}
                    />
                  ))}
                </ul>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const SidebarItem = ({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-[28px] w-full items-center gap-2 rounded-[4px] px-2 text-left text-[13px] font-semibold transition",
      active
        ? "bg-[#424242] text-[#ededed]"
        : "text-[#c7c7c7] hover:bg-[#303030] hover:text-white",
    )}
  >
    <Icon className="h-[13px] w-[13px] shrink-0" />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="text-[12px] font-medium text-[#838383] tabular-nums">{count}</span>
  </button>
);

const AssetGridCard = ({
  asset,
  selected,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  asset: DialogAsset;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (event: React.DragEvent) => void;
}) => {
  const { t } = useLanguage();
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`${asset.label} - ${kindLabel(asset.fieldType, t)}`}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-[6px] border bg-[#1b1b1b] transition",
        selected
          ? "border-yellow-500 shadow-[0_0_0_1px_rgba(238,255,0,.85)]"
          : "border-[#3a3a3a] hover:border-[#666]",
      )}
    >
      <div className="relative flex h-[104px] items-center justify-center overflow-hidden bg-[#181818]">
        <AssetPreview asset={asset} />
        {asset.fieldType === "video" && (
          <Play className="absolute bottom-2 left-2 h-[14px] w-[14px] text-white drop-shadow" />
        )}
        {selected && (
          <div className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#f4ff00] text-black">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      <div className="flex h-[30px] items-center gap-1.5 border-t border-[#303030] px-2">
        <AssetKindIcon type={asset.fieldType} className="h-[12px] w-[12px] shrink-0 text-[#8d8d8d]" />
        <span className="min-w-0 truncate text-[11px] font-semibold text-[#d7d7d7]">
          {asset.fileName || asset.label}
        </span>
      </div>
    </li>
  );
};

const AssetListRow = ({
  asset,
  selected,
  onClick,
  onDoubleClick,
  onDragStart,
}: {
  asset: DialogAsset;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (event: React.DragEvent) => void;
}) => {
  const { t } = useLanguage();
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-3 rounded-[5px] border px-2 transition",
        selected
          ? "border-yellow-500 bg-yellow-500/10"
          : "border-transparent bg-[#1b1b1b] hover:border-[#444]",
      )}
    >
      <div className="h-7 w-10 overflow-hidden rounded-[3px] bg-[#111]">
        <AssetPreview asset={asset} compact />
      </div>
      <AssetKindIcon type={asset.fieldType} className="h-[13px] w-[13px] text-[#969696]" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#dfdfdf]">
        {asset.fileName || asset.label}
      </span>
      <span className="text-[12px] font-medium text-[#838383]">
        {kindLabel(asset.fieldType, t)}
      </span>
    </li>
  );
};

const AssetPreview = ({
  asset,
  compact = false,
}: {
  asset: DialogAsset;
  compact?: boolean;
}) => {
  const previewUrl = asset.fieldType === "model3d" && asset.posterUrl ? asset.posterUrl : asset.url;
  const mediaClass = compact ? "h-full w-full object-cover" : "h-full w-full object-cover";

  if (asset.fieldType === "image" || (asset.fieldType === "model3d" && asset.posterUrl)) {
    return <img src={previewUrl} alt={asset.label} className={mediaClass} draggable={false} />;
  }

  if (asset.fieldType === "video") {
    return (
      <video
        src={asset.url}
        muted
        playsInline
        preload="metadata"
        className={mediaClass}
        onMouseEnter={(event) => {
          event.currentTarget.play().catch(() => {});
        }}
        onMouseLeave={(event) => {
          event.currentTarget.pause();
          event.currentTarget.currentTime = 0;
        }}
      />
    );
  }

  const Icon = asset.fieldType === "audio" ? Music : Box;
  return (
    <div className="grid h-full w-full place-items-center bg-[#101010]">
      <Icon className={compact ? "h-4 w-4 text-[#858585]" : "h-8 w-8 text-[#858585]"} />
    </div>
  );
};

const AssetKindIcon = ({
  type,
  className,
}: {
  type: AssetType;
  className?: string;
}) => {
  const Icon =
    type === "image" ? ImageIcon : type === "video" ? Film : type === "audio" ? Music : Box;
  return <Icon className={className} />;
};

function kindLabel(type: AssetType, t: ReturnType<typeof useLanguage>["t"]) {
  if (type === "model3d") return "3D";
  if (type === "image") return t("workspace.allAssets.kindImage");
  if (type === "video") return t("workspace.allAssets.kindVideo");
  return t("workspace.allAssets.kindAudio");
}

export default AllAssetsDialog;
