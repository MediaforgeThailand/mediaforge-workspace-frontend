import { useEffect, useMemo, useRef, useState } from "react";
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
  Layers,
  List,
  Music,
  Play,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AssetSource = "generated" | "uploaded" | "element";
type AssetType = "image" | "video" | "audio" | "model3d";
type LibraryTab = "board" | "recent";

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
  workspaceId: string | null;
  canvasId: string;
  createdAt?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function genFieldType(
  gen: { type?: string; url?: string; model_url?: string },
): AssetType | null {
  if (gen.model_url) return "model3d";
  const t = (gen.type ?? "").toLowerCase();
  if (t === "image" || t === "video" || t === "audio") return t;
  if (t === "model3d" || t === "model_3d") return "model3d";
  const url = gen.url ?? "";
  if (/\.(glb|gltf|usdz|obj|fbx)(\?|#|$)/i.test(url)) return "model3d";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/i.test(url)) return "audio";
  return null;
}

const AllAssetsDialog = ({ open, onClose }: Props) => {
  const { t } = useLanguage();
  const allGraphs = useWorkspaceStore((s) => s.graphs);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const canvases = useWorkspaceStore((s) => s.canvases);
  const current = useWorkspaceStore((s) => s.current);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<LibraryTab>("board");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [draggingExternal, setDraggingExternal] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const canvasMetaById = useMemo(
    () => new Map(canvases.map((canvas) => [canvas.id, canvas] as const)),
    [canvases],
  );

  const boardOptions = useMemo(() => {
    const idsWithGraphs = new Set(
      Object.values(allGraphs)
        .map((graph) => graph?.workspaceId ?? canvasMetaById.get(graph?.id ?? "")?.workspaceId)
        .filter((id): id is string => Boolean(id)),
    );
    const options = workspaces
      .filter((workspace) => idsWithGraphs.size === 0 || idsWithGraphs.has(workspace.id))
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name || "Untitled space",
      }));
    if (current?.workspaceId && !options.some((option) => option.id === current.workspaceId)) {
      options.unshift({
        id: current.workspaceId,
        name:
          workspaces.find((workspace) => workspace.id === current.workspaceId)?.name ||
          current.name ||
          "Current space",
      });
    }
    return options;
  }, [allGraphs, canvasMetaById, current, workspaces]);

  const assets = useMemo<DialogAsset[]>(() => {
    const out: DialogAsset[] = [];
    const seenUrls = new Set<string>();

    for (const canvasId of Object.keys(allGraphs)) {
      const graph = allGraphs[canvasId];
      const canvasMeta = canvasMetaById.get(canvasId);
      const workspaceId = graph?.workspaceId ?? canvasMeta?.workspaceId ?? null;
      for (const n of graph?.nodes ?? []) {
        const d = (n.data ?? {}) as Record<string, unknown>;

        if (
          n.type === "assetNode" &&
          typeof d.previewUrl === "string" &&
          typeof d.fieldType === "string"
        ) {
          const seenKey = `${workspaceId ?? "global"}:${d.previewUrl}`;
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
                "asset",
              fileName: d.fileName as string | undefined,
              fromNodeId: n.id,
              fromNodeLabel:
                (d.label as string | undefined) ||
                (d.fileName as string | undefined) ||
                "asset",
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
          const fieldType = genFieldType(
            g as { type?: string; url?: string; model_url?: string },
          );
          if (!fieldType) continue;

          const assetUrl =
            fieldType === "model3d" && typeof g.model_url === "string"
              ? g.model_url
              : (g.url as string | undefined);
          const seenKey = `${workspaceId ?? "global"}:${assetUrl}`;
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
  }, [allGraphs, canvasMetaById]);

  const effectiveWorkspaceId =
    selectedWorkspaceId ?? current?.workspaceId ?? boardOptions[0]?.id ?? null;

  const boardAssets = useMemo(() => {
    if (!effectiveWorkspaceId) return assets;
    return assets.filter((asset) => asset.workspaceId === effectiveWorkspaceId);
  }, [assets, effectiveWorkspaceId]);

  const visibleAssets = useMemo(() => {
    const pool = activeTab === "recent" ? boardAssets.slice(0, 24) : boardAssets;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((asset) => {
      const haystack = `${asset.label} ${asset.fileName ?? ""} ${asset.fromNodeLabel}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activeTab, boardAssets, query]);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setQuery("");
    setActiveTab("board");
    setSelectedWorkspaceId(current?.workspaceId ?? boardOptions[0]?.id ?? null);
    const id = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!effectiveWorkspaceId && boardOptions.length > 0) {
      setSelectedWorkspaceId(boardOptions[0].id);
      return;
    }
    if (
      effectiveWorkspaceId &&
      boardOptions.length > 0 &&
      !boardOptions.some((board) => board.id === effectiveWorkspaceId)
    ) {
      setSelectedWorkspaceId(boardOptions[0].id);
    }
  }, [boardOptions, effectiveWorkspaceId]);

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
  }, [assets, onClose, open, selectedId]);

  if (!open) return null;

  const spawnAssets = (items: DialogAsset[]) => {
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
  };

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
          draggingExternal && "ring-2 ring-violet-500/70",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {draggingExternal && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-violet-500/12 text-violet-100">
            <div className="flex items-center gap-2 rounded-md border border-violet-400/40 bg-black/70 px-4 py-2 text-sm font-semibold">
              <UploadCloud className="h-4 w-4" />
              Drop files to upload
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
            <h2 className="shrink-0 text-[13.5px] font-semibold tracking-tight text-[#e8e8e8]">
              Media Browser
            </h2>
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
                    ? "bg-violet-500 text-white"
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
              {visibleAssets.length} files
            </span>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#a7a7a7] transition hover:bg-[#242424] hover:text-white"
              title="Close"
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-[180px] shrink-0 bg-[#202020] px-3 py-4">
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7c7c7c]">
                  Board
                </p>
                {/* Replaced the native `<select>` (which rendered the
                 *  OS's default light dropdown — un-themed, mismatched
                 *  fonts, looked broken on dark canvas) with our
                 *  shared `DropdownMenu` so the picker matches the
                 *  rest of the workspace chrome (zinc-on-dark,
                 *  rounded, hover tint). The trigger is the existing
                 *  pill; the popover is portaled by Radix so it
                 *  escapes the dialog's overflow clipping. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-[30px] w-full items-center gap-2 rounded-[4px] bg-[#262626] px-2 text-left text-[13px] font-medium text-[#dedede] outline-none transition hover:bg-[#303030] focus-visible:bg-[#303030]"
                    >
                      <Layers className="h-[13px] w-[13px] shrink-0 text-[#9a9a9a]" />
                      <span className="min-w-0 flex-1 truncate">
                        {boardOptions.find(
                          (board) => board.id === effectiveWorkspaceId,
                        )?.name ?? "Main Board"}
                      </span>
                      <ChevronDown className="h-[13px] w-[13px] shrink-0 text-[#8d8d8d]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={4}
                    /* z-[1600] beats the dialog backdrop's z-[1500].
                     *  The shared `DropdownMenuContent` defaults to
                     *  `z-50`, which Radix's Portal still respects
                     *  even though it appends to <body> — so without
                     *  this override the popover opened behind the
                     *  dialog and looked like the trigger did
                     *  nothing on click. */
                    className="z-[1600] min-w-[200px] max-h-[280px] overflow-y-auto rounded-[6px] bg-[#1c1c1c] p-1 shadow-[0_14px_30px_rgba(0,0,0,.55)]"
                  >
                    {boardOptions.length === 0 ? (
                      <DropdownMenuItem
                        className="flex h-[30px] cursor-pointer items-center gap-2 rounded-[3px] px-2 text-[13px] text-[#dedede] focus:bg-[#2a2a2a]"
                        onSelect={() => {
                          setSelectedWorkspaceId(null);
                          setSelectedId(null);
                        }}
                      >
                        <Layers className="h-[13px] w-[13px] shrink-0 text-[#9a9a9a]" />
                        Main Board
                      </DropdownMenuItem>
                    ) : (
                      boardOptions.map((board) => {
                        const isActive = board.id === effectiveWorkspaceId;
                        return (
                          <DropdownMenuItem
                            key={board.id}
                            className={cn(
                              "flex h-[30px] cursor-pointer items-center gap-2 rounded-[3px] px-2 text-[13px] focus:bg-[#2a2a2a]",
                              isActive
                                ? "bg-violet-500/15 text-violet-100 focus:bg-violet-500/20"
                                : "text-[#dedede]",
                            )}
                            onSelect={() => {
                              setSelectedWorkspaceId(board.id);
                              setSelectedId(null);
                            }}
                          >
                            <Layers
                              className={cn(
                                "h-[13px] w-[13px] shrink-0",
                                isActive ? "text-violet-300" : "text-[#9a9a9a]",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">{board.name}</span>
                            {isActive && (
                              <Check className="h-[13px] w-[13px] shrink-0 text-violet-300" />
                            )}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div>
                <p className="mb-3 text-[12px] font-semibold text-[#969696]">Asset</p>
                <SidebarItem
                  active={activeTab === "board"}
                  icon={Folder}
                  label="Board Files"
                  count={boardAssets.length}
                  onClick={() => setActiveTab("board")}
                />
                <SidebarItem
                  active={activeTab === "recent"}
                  icon={Clock3}
                  label="Recent"
                  count={Math.min(boardAssets.length, 24)}
                  onClick={() => setActiveTab("recent")}
                />
              </div>
            </aside>

            <main className="ws-scroll-hide min-w-0 flex-1 overflow-y-auto bg-[#151515] p-5">
              {visibleAssets.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px] font-medium text-[#777]">
                  {boardAssets.length === 0 ? "No board files yet" : "No matching assets"}
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
}) => (
  <li
    draggable
    onDragStart={onDragStart}
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    title={`${asset.label} - ${asset.fieldType}`}
    className={cn(
      "group cursor-pointer overflow-hidden rounded-[6px] border bg-[#1b1b1b] transition",
      selected
        ? "border-violet-500 shadow-[0_0_0_1px_rgba(168,85,247,.85)]"
        : "border-[#3a3a3a] hover:border-[#666]",
    )}
  >
    <div className="relative flex h-[104px] items-center justify-center overflow-hidden bg-[#181818]">
      <AssetPreview asset={asset} />
      {asset.fieldType === "video" && (
        <Play className="absolute bottom-2 left-2 h-[14px] w-[14px] text-white drop-shadow" />
      )}
      {selected && (
        <div className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-violet-500 text-white">
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
}) => (
  <li
    draggable
    onDragStart={onDragStart}
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    className={cn(
      "flex h-10 cursor-pointer items-center gap-3 rounded-[5px] border px-2 transition",
      selected
        ? "border-violet-500 bg-violet-500/10"
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
    <span className="text-[12px] font-medium capitalize text-[#838383]">{kindLabel(asset.fieldType)}</span>
  </li>
);

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

function kindLabel(type: AssetType) {
  if (type === "model3d") return "3D";
  return type;
}

export default AllAssetsDialog;
