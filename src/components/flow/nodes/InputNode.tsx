import { memo, useCallback, useRef, useState, type DragEvent } from "react";
import { type NodeProps, useReactFlow, useEdges } from "@xyflow/react";
import { ImagePlus, Loader2, Film, X, AlertTriangle, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BaseNodeWrapper from "./BaseNodeWrapper";
import { GroupHeader, getTone } from "./primitives";
import { useLanguage } from "@/contexts/LanguageContext";

export interface InputNodeData {
  label: string;
  nodeName?: string;
  fieldLabel: string;
  fieldType: "image" | "text" | "video";
  required: boolean;
  accept?: string;
  placeholder?: string;
  previewUrl?: string;
  fileName?: string;
  uploading?: boolean;
  storagePath?: string;
  creatorAsset?: boolean;
  config?: Record<string, unknown>;
}

const InputNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as InputNodeData;
  const { user } = useAuth();
  const { setNodes } = useReactFlow();
  const { t } = useLanguage();
  const edges = useEdges();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exampleInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExampleDragOver, setIsExampleDragOver] = useState(false);
  const [isUploadingExamples, setIsUploadingExamples] = useState(false);

  // Check if this input node has any outgoing connections
  const isConnected = edges.some((e) => e.source === id);

  const updateNodeData = useCallback(
    (updates: Partial<InputNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...updates } } : n,
        ),
      );
    },
    [id, setNodes],
  );

  const updateNodeConfig = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const currentData = (n.data as Record<string, unknown>) ?? {};
          const currentConfig = (currentData.config as Record<string, unknown>) ?? {};
          return {
            ...n,
            data: {
              ...currentData,
              config: {
                ...currentConfig,
                ...patch,
              },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (!user) { toast.error(t("inputNode.loginRequired")); return; }
      const isVideo = file.type.startsWith("video/");
      const expectedVideo = d.fieldType === "video";
      if (isVideo && !expectedVideo) { toast.error(t("inputNode.imagesOnly")); return; }
      if (!isVideo && expectedVideo) { toast.error(t("inputNode.videosOnly")); return; }
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { toast.error(t("inputNode.mediaOnly")); return; }

      const localPreview = URL.createObjectURL(file);
      updateNodeData({ previewUrl: localPreview, fileName: file.name, uploading: true });

      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("ai-media")
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (uploadErr) {
        toast.error(t("inputNode.uploadFailed", { filename: file.name }));
        updateNodeData({ previewUrl: undefined, fileName: undefined, uploading: false });
        URL.revokeObjectURL(localPreview);
        return;
      }

      const { data: signedData } = await supabase.storage
        .from("ai-media")
        .createSignedUrl(storagePath, 60 * 60 * 24);

      updateNodeData({
        previewUrl: signedData?.signedUrl || localPreview,
        storagePath,
        fileName: file.name,
        uploading: false,
      });
      URL.revokeObjectURL(localPreview);
    },
    [user, d.fieldType, updateNodeData, t],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const clearFile = useCallback(() => {
    updateNodeData({ previewUrl: undefined, fileName: undefined, storagePath: undefined, uploading: false });
  }, [updateNodeData]);

  const isCreator = !!d.creatorAsset;
  const accent = isCreator ? "amber" : "blue";
  const tagLabel = isCreator ? t("inputNode.creatorBadge") : t("inputNode.inputBadge");
  const IconComp = d.fieldType === "video" ? Film : ImagePlus;
  const config = (d.config as Record<string, unknown>) ?? {};
  const exampleImageUrls = (config.example_image_urls as string[]) ?? [];
  const isMediaInput = !isCreator && (d.fieldType === "image" || d.fieldType === "video");

  const handleExampleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!user) {
        toast.error(t("inputNode.loginRequired"));
        return;
      }

      const incomingFiles = Array.from(files);
      const invalidFiles = incomingFiles.filter((file) => !file.type.startsWith("image/"));
      if (invalidFiles.length > 0) {
        toast.error(t("inputNode.referenceImagesOnly"));
      }

      const imageFiles = incomingFiles.filter((file) => file.type.startsWith("image/"));
      const remainingSlots = 3 - exampleImageUrls.length;

      if (remainingSlots <= 0) {
        toast.error(t("inputNode.maxReferenceImages"));
        return;
      }

      if (imageFiles.length === 0) {
        return;
      }

      setIsUploadingExamples(true);
      const nextUrls = [...exampleImageUrls];

      for (const file of imageFiles.slice(0, remainingSlots)) {
        const ext = file.name.split(".").pop() || "png";
        const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from("flow-assets")
          .upload(storagePath, file, { contentType: file.type, upsert: true });

        if (error) {
          toast.error(t("inputNode.uploadFailed", { filename: file.name }));
          continue;
        }

        const { data: publicData } = supabase.storage
          .from("flow-assets")
          .getPublicUrl(storagePath);

        if (publicData.publicUrl) {
          nextUrls.push(publicData.publicUrl);
        }
      }

      updateNodeConfig({ example_image_urls: nextUrls });
      setIsUploadingExamples(false);
      setIsExampleDragOver(false);
    },
    [exampleImageUrls, updateNodeConfig, user, t],
  );

  const handleExampleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) {
        void handleExampleUpload(files);
      }
      e.target.value = "";
    },
    [handleExampleUpload],
  );

  const handleExampleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsExampleDragOver(false);
      if (e.dataTransfer.files?.length) {
        void handleExampleUpload(e.dataTransfer.files);
      }
    },
    [handleExampleUpload],
  );

  const removeExampleImage = useCallback(
    (index: number) => {
      updateNodeConfig({
        example_image_urls: exampleImageUrls.filter((_, currentIndex) => currentIndex !== index),
      });
    },
    [exampleImageUrls, updateNodeConfig],
  );

  const accentTone = getTone(accent);

  return (
    <BaseNodeWrapper
      title={d.nodeName || d.label || t("inputNode.defaultTitle")}
      badge={tagLabel}
      accent={accent}
      icon={IconComp}
      outputs={[{ id: "default", label: d.fieldType === "video" ? t("inputNode.videoPort") : t("inputNode.imagePort"), color: accent, dim: !isConnected && !d.creatorAsset }]}
      selected={selected}
      width={260}
      onTitleChange={(name) => updateNodeData({ nodeName: name })}
      footerLeft={d.fileName ? d.fileName.slice(0, 22) : t("inputNode.noMedia")}
      footerRight={d.required ? t("inputNode.required") : t("inputNode.optional")}
    >
      {/* Unconnected warning */}
      {!isConnected && !d.creatorAsset && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/8 border border-rose-500/25">
          <AlertTriangle className="w-3 h-3 text-rose-300 shrink-0" />
          <span className="text-[10px] text-rose-200 font-medium leading-tight">{t("nodeNotConnected")}</span>
        </div>
      )}

      {/* Source media section */}
      <div>
        <GroupHeader label={t("inputNode.sourceMedia")} accent={accent} />
        <div className="mt-1.5">
          {d.previewUrl ? (
            <div className="relative rounded-xl overflow-hidden border group" style={{ borderColor: accentTone.bd }}>
              {d.fieldType === "video" ? (
                <video
                  src={d.previewUrl}
                  muted
                  playsInline
                  className={cn("w-full object-cover max-h-64", d.uploading && "opacity-50")}
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
              ) : (
                <img
                  src={d.previewUrl}
                  alt={d.fileName || t("inputNode.previewAlt")}
                  className={cn("w-full object-cover max-h-64", d.uploading && "opacity-50")}
                />
              )}
              {d.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
              {!d.uploading && (
                <button
                  onClick={clearFile}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 backdrop-blur-md text-white/85 hover:text-white border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <div className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/65 to-transparent flex items-end px-2 pb-1">
                <p className="text-[9.5px] text-white/85 font-mono truncate">
                  {d.uploading ? t("inputNode.uploading") : d.fileName || d.fieldType}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-xl border-[1.5px] border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 py-5",
                isDragOver ? "border-white/30 bg-white/[0.05]" : "hover:bg-white/[0.04]"
              )}
              style={
                !isDragOver
                  ? { borderColor: accentTone.bd, background: `${accentTone.bg}` }
                  : undefined
              }
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
            >
              <Upload className="w-5 h-5" style={{ color: accentTone.c }} />
              <p className="text-[11px] font-medium text-white/75">
                {isDragOver ? t("inputNode.dropHere") : t("inputNode.clickOrDropFile")}
              </p>
              <p className="text-[9.5px] text-white/40 font-mono tracking-[0.04em]">
                {d.fieldType === "video" ? t("inputNode.videoFormats") : t("inputNode.imageFormats")}
              </p>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={d.accept || (d.fieldType === "video" ? "video/*" : "image/*")}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Reference examples (consumer media inputs only) */}
      {isMediaInput && (
        <div>
          <div className="flex items-center justify-between">
            <GroupHeader label={t("nodeRefExamples")} accent={accent} />
            <span className="text-[9px] text-white/35 font-mono shrink-0 -mt-1">{exampleImageUrls.length}/3</span>
          </div>
          <div
            className={cn(
              "mt-1.5 rounded-lg border border-dashed p-2 transition-all cursor-pointer",
              isExampleDragOver ? "border-violet-400/50 bg-violet-500/10" : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]"
            )}
            onClick={() => exampleInputRef.current?.click()}
            onDrop={handleExampleDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsExampleDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsExampleDragOver(false); }}
          >
            {exampleImageUrls.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {exampleImageUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative aspect-square overflow-hidden rounded-md border border-white/[0.08] group/example">
                    <img src={url} alt={t("inputNode.referenceAlt", { index: index + 1 })} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeExampleImage(index); }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white/80 flex items-center justify-center opacity-0 group-hover/example:opacity-100 transition-opacity"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                ))}
                {exampleImageUrls.length < 3 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); exampleInputRef.current?.click(); }}
                    className="aspect-square rounded-md border-[1.5px] border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-center transition-colors"
                  >
                    {isUploadingExamples ? (
                      <Loader2 className="w-3.5 h-3.5 text-violet-300 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5 text-violet-300/70" />
                    )}
                  </button>
                )}
                {exampleImageUrls.length < 3 && (
                  <div className="aspect-square rounded-md border border-dashed border-white/[0.06] bg-white/[0.015]" />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 py-2">
                <ImagePlus className="w-4 h-4 text-violet-300/70" />
                <p className="text-[10px] font-medium text-white/60">
                  {isUploadingExamples ? t("inputNode.uploadingRefs") : t("inputNode.clickOrDropRefImages")}
                </p>
                <p className="text-[9px] text-white/30">{t("inputNode.referenceExamplesMax")}</p>
              </div>
            )}
          </div>
          <input
            ref={exampleInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleExampleFileChange}
          />
        </div>
      )}

      {/* End-user view section */}
      <div>
        <GroupHeader label={t("inputNode.endUserView")} accent={accent} />
        <div className="mt-1.5 space-y-1.5">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5">
            <p className="text-[9.5px] text-white/35 mb-0.5 font-mono uppercase tracking-[0.06em]">
              {isCreator ? t("inputNode.creatorAsset") : t("inputNode.userSees")}
            </p>
            <input
              type="text"
              value={d.fieldLabel || ""}
              onChange={(e) => { e.stopPropagation(); updateNodeData({ fieldLabel: e.target.value }); }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder={isCreator ? t("inputNode.preSetAsset") : t("inputNode.uploadYourImage")}
              className="w-full bg-transparent text-[11px] text-white/80 font-medium focus:outline-none placeholder:text-white/20 nodrag"
            />
          </div>

          {/* Required toggle */}
          {!isCreator && (
            <label
              className="flex items-center justify-between px-1 cursor-pointer select-none nodrag"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className="text-[10.5px] text-white/70">{t("nodeRequiredToggle")}</span>
              <input
                type="checkbox"
                checked={d.required === true}
                onChange={(e) => { e.stopPropagation(); updateNodeData({ required: e.target.checked }); }}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 cursor-pointer"
                style={{ accentColor: accentTone.c }}
              />
            </label>
          )}
        </div>
      </div>
    </BaseNodeWrapper>
  );
});

InputNode.displayName = "InputNode";
export default InputNode;
