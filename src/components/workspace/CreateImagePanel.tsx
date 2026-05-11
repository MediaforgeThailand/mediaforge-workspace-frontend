import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Minus, Plus,
  Video, Image as ImageIcon, Box, Music, ChevronRight,
  FileText,
  X, ChevronDown, Layers, Check, Upload, Clipboard,
  SlidersHorizontal, Trash2,
} from "lucide-react";
import { ReactFlowProvider, useReactFlow, type Node } from "@xyflow/react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import PromptMentionTextarea from "@/components/flow/nodes/PromptMentionTextarea";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import sampleRefOne from "@/assets/showcase-cat-astronaut.jpg";
import sampleRefTwo from "@/assets/mock-packshot-perfume.jpg";
import sampleRefThree from "@/assets/pro-trend-space-cat.jpg";
import {
  cleanModelDisplayName,
  orderModelsByRecommendation,
  recommendationRankForModel,
} from "./modelDisplay";

type BottomTab = "video" | "image" | "3d" | "audio";
type MaybePromise<T> = T | Promise<T>;

function usePanelCopy() {
  const { language, t } = useLanguage();
  return {
    video: t("createImagePanel.video"),
    image: t("createImagePanel.image"),
    audio: t("createImagePanel.audio"),
    models: t("createImagePanel.models"),
    recommended: t("createImagePanel.recommended"),
    allModels: t("createImagePanel.allModels"),
    all: t("createImagePanel.all"),
    startEndFrame: t("createImagePanel.startEndFrame"),
    textWithReference: t("createImagePanel.textWithReference"),
    imageHistory: t("createImagePanel.imageHistory"),
    setStartEndFrame: t("createImagePanel.setStartEndFrame"),
    setStartFrame: t("createImagePanel.setStartFrame"),
    startFrame: t("createImagePanel.startFrame"),
    endFrame: t("createImagePanel.endFrame"),
    addVisualReference: t("createImagePanel.addVisualReference"),
    creations: t("createImagePanel.creations"),
    uploads: t("createImagePanel.uploads"),
    uploadImages: t("createImagePanel.uploadImages"),
    uploadVideos: t("createImagePanel.uploadVideos"),
    uploadAssets: t("createImagePanel.uploadAssets"),
    dropFiles: t("createImagePanel.dropFiles"),
    noAssets: t("createImagePanel.noAssets"),
    autoModel: t("createImagePanel.autoModel"),
    gptModel: t("createImagePanel.gptModel"),
    googleVideoModel: t("createImagePanel.googleVideoModel"),
    seedanceModel: t("createImagePanel.seedanceModel"),
    klingModel: t("createImagePanel.klingModel"),
    threeDModel: t("createImagePanel.threeDModel"),
    voiceModel: t("createImagePanel.voiceModel"),
    googlePremiumImage: t("createImagePanel.googlePremiumImage"),
    googleImage: t("createImagePanel.googleImage"),
    byteDanceImage: t("createImagePanel.byteDanceImage"),
    fluxImage: t("createImagePanel.fluxImage"),
    recraftImage: t("createImagePanel.recraftImage"),
    imageModel: t("createImagePanel.imageModel"),
    removeReference: t("createImagePanel.removeReference"),
    closeReferences: t("createImagePanel.closeReferences"),
    deleteAsset: t("createImagePanel.deleteAsset"),
    closeModels: t("createImagePanel.closeModels"),
    newBadge: t("createImagePanel.newBadge"),
    defaultImageTitle: t("createImagePanel.defaultImageTitle"),
    defaultVideoTitle: t("createImagePanel.defaultVideoTitle"),
    modelCaption: t("createImagePanel.modelCaption"),
    imagePromptLabel: t("createImagePanel.imagePromptLabel"),
    imagePromptPlaceholder: t("createImagePanel.imagePromptPlaceholder"),
    videoPromptLabel: t("createImagePanel.videoPromptLabel"),
    videoPromptPlaceholder: t("createImagePanel.videoPromptPlaceholder"),
    imageReferenceHint: t("createImagePanel.imageReferenceHint"),
    videoReferenceHint: t("createImagePanel.videoReferenceHint"),
    createForFree: t("createImagePanel.createForFree"),
    creating: t("createImagePanel.creating"),
    generate: t("createImagePanel.generate"),
    generating: t("createImagePanel.generating"),
    clickToReplace:
      language === "th" ? "คลิกเพื่อเปลี่ยน" : "Click to replace",
  };
}

interface CreateImagePanelReference {
  id: string;
  url: string;
  mime?: string;
  name?: string;
  source?: "generation" | "user_asset" | "upload";
  assetId?: string;
  storageBucket?: "ai-media" | "user_assets";
  storagePath?: string;
}

interface LocalPickerUpload extends CreateImagePanelReference {
  file: File;
  localObjectUrl: string;
  source: "upload";
}

interface CreateImagePanelModel {
  id: string;
  label: string;
  settings?: ModelSettingTag[];
}

interface CreateImagePanelProps {
  title?: string;
  modelCaption?: string;
  prompt?: string;
  promptLabel?: string;
  promptPlaceholder?: string;
  onPromptChange?: (prompt: string) => void;
  showPromptInput?: boolean;
  modelLabel?: string;
  modelInitial?: string;
  modelValue?: string;
  modelOptions?: CreateImagePanelModel[];
  onModelChange?: (model: string) => void;
  references?: CreateImagePanelReference[];
  maxReferences?: number;
  showReferences?: boolean;
  referenceTitle?: string;
  referenceBadge?: string;
  referenceHint?: string;
  referenceAccept?: string;
  referenceAssets?: CreateImagePanelReference[];
  onAddReferences?: () => void;
  onReferenceFiles?: (files: File[]) => MaybePromise<void>;
  onSelectReferenceAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onDeleteReferenceAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onRemoveReference?: (id: string) => void;
  mentionOptions?: CreateImagePanelReference[];
  settings?: CreateVideoPanelSetting[];
  textControls?: CreateVideoPanelTextControl[];
  extraControls?: React.ReactNode;
  onCreate?: () => void;
  createLabel?: string;
  costQuote?: CreatePanelCostQuote | null;
  runningLabel?: string;
  running?: boolean;
  showQuantity?: boolean;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  bottom?: BottomTab;
  onBottomChange?: (tab: BottomTab) => void;
}

type VideoInputMode = "frames" | "reference";

interface CreateVideoPanelFrameSlot {
  id: "start" | "end";
  label: string;
  historyLabel?: string;
  refItem?: CreateImagePanelReference | null;
  uploading?: boolean;
  onUpload?: () => void;
  onHistoryFiles?: (files: File[]) => MaybePromise<void>;
  onSelectHistoryAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onRemove?: () => void;
}

interface CreateVideoPanelReferenceSlot {
  id: string;
  label: string;
  accept: "image" | "video";
  refItem?: CreateImagePanelReference | null;
  uploading?: boolean;
  onFiles?: (files: File[]) => MaybePromise<void>;
  onSelectAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onRemove?: () => void;
}

export interface CreateVideoPanelSetting {
  id: string;
  label: string;
  value: string;
  kind?: "select" | "toggle" | "readonly";
  options?: Array<{ value: string; label: string }>;
  checked?: boolean;
  onChange?: (value: string) => void;
  onToggle?: (checked: boolean) => void;
}

export interface CreateVideoPanelTextControl {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
}

interface CreateVideoPanelProps {
  title?: string;
  modelCaption?: string;
  prompt?: string;
  promptLabel?: string;
  promptPlaceholder?: string;
  onPromptChange?: (prompt: string) => void;
  showPromptInput?: boolean;
  modelLabel?: string;
  modelInitial?: string;
  modelValue?: string;
  modelOptions?: CreateImagePanelModel[];
  onModelChange?: (model: string) => void;
  mode?: VideoInputMode;
  onModeChange?: (mode: VideoInputMode) => void;
  supportsFrameMode?: boolean;
  supportsReferenceMode?: boolean;
  frameSlots?: CreateVideoPanelFrameSlot[];
  referenceSlots?: CreateVideoPanelReferenceSlot[];
  references?: CreateImagePanelReference[];
  maxReferences?: number;
  referenceTitle?: string;
  referenceBadge?: string;
  referenceHint?: string;
  referenceAccept?: string;
  referenceAssets?: CreateImagePanelReference[];
  onAddReferences?: () => void;
  onReferenceFiles?: (files: File[]) => MaybePromise<void>;
  onSelectReferenceAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onDeleteReferenceAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onRemoveReference?: (id: string) => void;
  mentionOptions?: CreateImagePanelReference[];
  settings?: CreateVideoPanelSetting[];
  textControls?: CreateVideoPanelTextControl[];
  extraControls?: React.ReactNode;
  onCreate?: () => void;
  createLabel?: string;
  costQuote?: CreatePanelCostQuote | null;
  runningLabel?: string;
  running?: boolean;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  bottom?: BottomTab;
  onBottomChange?: (tab: BottomTab) => void;
}

interface ModelSettingTag {
  label: string;
  icon?: "reference" | "frames" | "audio" | "resolution" | "duration" | "multi";
}

export interface CreatePanelCostQuote {
  fullCost: number;
  modelCost: number;
  finalCost: number;
  modelDiscountPercent: number;
  packageDiscountPercent: number;
  packageDiscountLabel?: string | null;
  totalDiscountPercent: number;
}

function CostDiscountLine({ quote }: { quote?: CreatePanelCostQuote | null }) {
  if (!quote || quote.finalCost <= 0) return null;
  const hasDiscount = quote.modelDiscountPercent > 0 || quote.packageDiscountPercent > 0;
  if (!hasDiscount) return null;
  const packageLabel = quote.packageDiscountLabel || "Team";
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[10px] leading-[13px] text-neutral-400">
      <span className="line-through opacity-70">{quote.fullCost.toLocaleString()}</span>
      <span className="font-semibold text-white">{quote.finalCost.toLocaleString()} credits</span>
      {quote.modelDiscountPercent > 0 && (
        <span className="font-medium text-emerald-200">
          Model -{quote.modelDiscountPercent}%
        </span>
      )}
      {quote.packageDiscountPercent > 0 && (
        <span className="font-medium text-sky-200">
          {packageLabel} -{quote.packageDiscountPercent}%
        </span>
      )}
      {quote.totalDiscountPercent > 0 && (
        <span className="text-neutral-500">Total -{quote.totalDiscountPercent}%</span>
      )}
    </div>
  );
}

export const CreateImagePanel: React.FC<CreateImagePanelProps> = ({
  title,
  modelCaption,
  prompt: controlledPrompt,
  promptLabel,
  promptPlaceholder,
  onPromptChange,
  showPromptInput = true,
  modelLabel = "Nano Banana Pro",
  modelInitial = "G",
  modelValue,
  modelOptions = [],
  onModelChange,
  references = [],
  maxReferences = 10,
  showReferences = true,
  referenceTitle,
  referenceHint,
  referenceAccept = "image/*",
  referenceAssets = [],
  onAddReferences,
  onReferenceFiles,
  onSelectReferenceAsset,
  onDeleteReferenceAsset,
  onRemoveReference,
  mentionOptions = [],
  settings = [],
  textControls = [],
  extraControls,
  onCreate,
  createLabel,
  costQuote,
  runningLabel,
  running = false,
  showQuantity = true,
  quantity: controlledQuantity,
  onQuantityChange,
  bottom: controlledBottom,
  onBottomChange,
}) => {
  const copy = usePanelCopy();
  const resolvedTitle = title ?? copy.defaultImageTitle;
  const resolvedModelCaption = modelCaption ?? copy.modelCaption;
  const resolvedPromptLabel = promptLabel ?? copy.imagePromptLabel;
  const resolvedPromptPlaceholder = promptPlaceholder ?? copy.imagePromptPlaceholder;
  const resolvedReferenceTitle = referenceTitle ?? copy.addVisualReference;
  const resolvedReferenceHint = referenceHint ?? copy.imageReferenceHint;
  const resolvedCreateLabel = createLabel ?? copy.createForFree;
  const resolvedRunningLabel = runningLabel ?? copy.creating;
  const [bottomState, setBottomState] = useState<BottomTab>("image");
  const [modelOpen, setModelOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [qtyState, setQtyState] = useState(1);
  const [promptState, setPromptState] = useState("");
  const prompt = controlledPrompt ?? promptState;
  const bottom = controlledBottom ?? bottomState;
  const qty = controlledQuantity ?? qtyState;
  const selectedModelId = modelValue ?? modelOptions[0]?.id ?? "selected";

  const updatePrompt = (nextPrompt: string) => {
    setPromptState(nextPrompt);
    onPromptChange?.(nextPrompt);
  };

  const updateBottom = (nextBottom: BottomTab) => {
    setBottomState(nextBottom);
    onBottomChange?.(nextBottom);
  };

  const updateQuantity = (nextQuantity: number) => {
    const clamped = Math.min(4, Math.max(1, nextQuantity));
    setQtyState(clamped);
    onQuantityChange?.(clamped);
  };

  const openReferencePicker = () => {
    setReferenceOpen(true);
    if (!onReferenceFiles && !onSelectReferenceAsset) {
      onAddReferences?.();
    }
  };

  const addDroppedReferenceFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) onReferenceFiles?.(list);
  };

  const handleReferencePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addDroppedReferenceFiles(files);
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addDroppedReferenceFiles(event.dataTransfer.files);
  };

  const handleCreate = () => {
    setReferenceOpen(false);
    setModelOpen(false);
    onCreate?.();
  };

  return (
    <div className="standalone-create-panel flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-[#121314] rounded-[20px] border border-white/[0.02]">
      {/* ===== HEADER ===== */}
      <header className="flex h-[56px] shrink-0 items-center px-[20px]">
        <h1 className="flex min-w-0 flex-1 items-center text-[16px] font-semibold leading-[24px] tracking-[-0.12px] text-white">
          <span className="standalone-panel-title line-clamp-1">{resolvedTitle}</span>
        </h1>
      </header>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div className="flex flex-1 min-h-0 flex-col gap-[12px] overflow-y-auto px-[12px] pb-[12px]">
        {/* Model Selector */}
        <button
          type="button"
          onClick={() => setModelOpen(true)}
          className="standalone-model-card group relative inline-flex min-h-[50px] w-full shrink-0 items-center gap-[10px] overflow-hidden rounded-[14px] border border-white/[0.02] bg-[#16181a] py-[6px] pl-[8px] pr-[10px] transition-colors hover:bg-[#1c1f22]"
        >
          <div className="h-[34px] w-[34px] rounded-[10px] bg-white flex items-center justify-center text-[15px] leading-[20px] font-bold">
            {modelInitial}
          </div>
          <div className="flex-1 flex flex-col items-start min-w-0">
            <span className="text-[12px] leading-[16px] text-neutral-400">{resolvedModelCaption}</span>
            <span className="text-[14px] leading-[20px] font-semibold text-white">{cleanModelDisplayName(modelLabel)}</span>
          </div>
          <ChevronRight className="h-[16px] w-[16px] text-neutral-500" />
        </button>
        <ModelsPopover
          open={modelOpen}
          onClose={() => setModelOpen(false)}
          models={buildModels(modelOptions, modelLabel, selectedModelId, copy)}
          selectedIds={[selectedModelId]}
          onToggle={(id) => {
            onModelChange?.(id);
            setModelOpen(false);
          }}
        />
        <ReferencePicker
          open={referenceOpen}
          onClose={() => setReferenceOpen(false)}
          references={references}
          assets={referenceAssets}
          accept={referenceAccept}
          onFiles={onReferenceFiles}
          onSelectAsset={onSelectReferenceAsset}
          onDeleteAsset={onDeleteReferenceAsset}
        />

        {/* Prompt box */}
        <section className="shrink-0 rounded-[16px] border border-white/[0.02] bg-[#16181a] p-[7px]">
          <div className="mb-[6px] flex items-center px-[2px]">
            <span className="standalone-section-title text-[14px] font-semibold leading-[20px] text-white">{resolvedPromptLabel}</span>
          </div>

          {/* Visual references box (PINK glow border) */}
          {showReferences && (
          <div className="relative rounded-[8px] overflow-hidden mt-[4px]">
            <div
              role="button"
              tabIndex={0}
              onClick={openReferencePicker}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openReferencePicker();
              }}
              onPaste={handleReferencePaste}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={handleReferenceDrop}
              className={clsx(
                "flex items-center gap-[12px] px-[12px] py-[8px] rounded-[8px] border border-[#f4ff00]/95 bg-[#f4ff00]/[0.08] shadow-[inset_0_-8px_24px_0_rgba(238,255,0,0.18),inset_0_2px_6px_0_rgba(238,255,0,0.18),inset_0_-4px_8px_0_rgba(238,255,0,0.3)] transition-all outline-none focus:ring-1 focus:ring-[#f4ff00]/70",
                onAddReferences || onReferenceFiles || onSelectReferenceAsset ? "cursor-pointer" : "cursor-default",
              )}
            >
              <div className="flex -space-x-[8px]">
                {references.length > 0 ? (
                  references.slice(0, 3).map((reference) => (
                    reference.mime?.startsWith("video/") ? (
                      <div
                        key={reference.id}
                        className="grid h-[40px] w-[40px] place-items-center rounded-[4px] bg-[#16181a] ring-2 ring-[#121314]"
                      >
                        <Video className="h-[18px] w-[18px] text-white/80" />
                      </div>
                    ) : (
                      <img
                        key={reference.id}
                        src={reference.url}
                        alt=""
                        className="h-[40px] w-[40px] rounded-[4px] object-cover ring-2 ring-[#121314]"
                      />
                    )
                  ))
                ) : (
                  DEFAULT_REFERENCE_THUMBS.map((src) => (
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="h-[40px] w-[40px] rounded-[4px] object-cover ring-2 ring-[#121314]"
                    />
                  ))
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <span className="standalone-reference-title truncate text-[14px] leading-[20px] font-semibold text-white">{resolvedReferenceTitle}</span>
                </div>
                <p className="standalone-reference-hint text-[12px] leading-[16px] text-neutral-400 mt-[2px]">{resolvedReferenceHint}</p>
              </div>
              <span className="text-[12px] leading-[16px] text-neutral-300 self-start">
                {references.length}/{maxReferences}
              </span>
            </div>
          </div>
          )}

          {showReferences && references.length > 0 && (
            <div className="mt-[8px] flex flex-wrap gap-[8px]">
              {references.map((reference, index) => (
                <SelectedReferenceThumb
                  key={reference.id}
                  reference={reference}
                  index={index}
                  onRemove={onRemoveReference}
                />
              ))}
            </div>
          )}

          {showPromptInput && (
            <StandalonePromptMentionTextarea
              value={prompt}
              onChange={updatePrompt}
              placeholder={resolvedPromptPlaceholder}
              mentionOptions={mentionOptions}
              className="mt-[7px] min-h-[70px] max-h-[190px] rounded-[10px] border-white/[0.06] bg-[#121314] px-[10px] py-[8px] text-[13px] leading-[20px] text-white placeholder:text-neutral-500 focus:border-[#f4ff00]/50"
            />
          )}
        </section>

        {settings.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-[6px]">
            {settings.map((setting) => (
              <VideoSettingCard key={setting.id} setting={setting} />
            ))}
          </div>
        )}

        {textControls.map((control) => (
          <VideoTextControlCard key={control.id} control={control} />
        ))}

        {extraControls && (
          <div className="flex shrink-0 flex-col gap-[10px]">
            {extraControls}
          </div>
        )}
      </div>

      {/* ===== FOOTER ===== */}
      <div className="flex w-full flex-row items-center justify-between gap-[16px] px-[12px] pb-[12px]">
        {/* Quantity stepper */}
        {showQuantity && (
        <div className="flex h-[48px] items-center gap-[8px] px-[12px] rounded-[16px] bg-[#16181a] border border-white/[0.02]">
          <button onClick={() => updateQuantity(qty - 1)}
                  className="h-[28px] w-[28px] flex items-center justify-center rounded-[8px] hover:bg-white/[0.06] text-white">
            <Minus className="h-[16px] w-[16px]" />
          </button>
          <span className="text-[14px] leading-[20px] font-semibold text-white tabular-nums min-w-[36px] text-center">
            {qty}<span className="text-neutral-500">/4</span>
          </span>
          <button onClick={() => updateQuantity(qty + 1)}
                  className="h-[28px] w-[28px] flex items-center justify-center rounded-[8px] hover:bg-white/[0.06] text-white">
            <Plus className="h-[16px] w-[16px]" />
          </button>
        </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <CostDiscountLine quote={costQuote} />
          <button
            onClick={handleCreate}
            disabled={running}
            className="standalone-generate-button ci-gloss-button group relative flex h-[48px] w-full items-center justify-center gap-[6px] overflow-hidden rounded-full border px-[8px] text-[15px] font-semibold leading-[20px] transition-all active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="pointer-events-none absolute inset-x-4 top-0 h-[16px] rounded-b-full bg-white/30 blur-[10px]" />
            <span className="pointer-events-none absolute -right-8 top-1/2 h-20 w-28 -translate-y-1/2 rounded-full bg-sky-200/25 blur-2xl" />
            <span className="relative">{running ? resolvedRunningLabel : resolvedCreateLabel}</span>
          </button>
        </div>
      </div>

      {/* ===== BOTTOM NAV ===== */}
      <div className="hidden items-center justify-around border-t border-white/[0.04] px-[18px] py-[6px] md:flex">
        {[
          { id: "video", icon: Video, label: copy.video },
          { id: "image", icon: ImageIcon, label: copy.image },
          { id: "3d", icon: Box, label: "3D" },
          { id: "audio", icon: Music, label: copy.audio },
        ].map(({ id, icon: Icon, label }) => {
          const active = bottom === id;
          return (
            <button
              key={id}
              onClick={() => updateBottom(id as BottomTab)}
              title={label}
              aria-label={label}
              className={clsx(
                "grid h-[34px] w-[34px] place-items-center rounded-full transition-all",
                active
                  ? "bg-white text-black shadow-[0_6px_18px_-10px_rgba(255,255,255,.75)]"
                  : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const CreateVideoPanel: React.FC<CreateVideoPanelProps> = ({
  title,
  modelCaption,
  prompt: controlledPrompt,
  promptLabel,
  promptPlaceholder,
  onPromptChange,
  showPromptInput = true,
  modelLabel = "Kling 2.6 Pro",
  modelInitial = "K",
  modelValue,
  modelOptions = [],
  onModelChange,
  mode: controlledMode,
  onModeChange,
  supportsFrameMode = true,
  supportsReferenceMode = true,
  frameSlots = [],
  referenceSlots = [],
  references = [],
  maxReferences = 4,
  referenceTitle,
  referenceHint,
  referenceAccept = "image/*,video/*",
  referenceAssets = [],
  onAddReferences,
  onReferenceFiles,
  onSelectReferenceAsset,
  onDeleteReferenceAsset,
  onRemoveReference,
  mentionOptions = [],
  settings = [],
  textControls = [],
  extraControls,
  onCreate,
  createLabel,
  costQuote,
  runningLabel,
  running = false,
  quantity: controlledQuantity,
  onQuantityChange,
  bottom: controlledBottom,
  onBottomChange,
}) => {
  const copy = usePanelCopy();
  const resolvedTitle = title ?? copy.defaultVideoTitle;
  const resolvedModelCaption = modelCaption ?? copy.modelCaption;
  const resolvedPromptLabel = promptLabel ?? copy.videoPromptLabel;
  const resolvedPromptPlaceholder = promptPlaceholder ?? copy.videoPromptPlaceholder;
  const resolvedReferenceTitle = referenceTitle ?? copy.addVisualReference;
  const resolvedReferenceHint = referenceHint ?? copy.videoReferenceHint;
  const resolvedCreateLabel = createLabel ?? copy.generate;
  const resolvedRunningLabel = runningLabel ?? copy.generating;
  const [modelOpen, setModelOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceSlotId, setReferenceSlotId] = useState<string | null>(null);
  const [historySlot, setHistorySlot] = useState<CreateVideoPanelFrameSlot | null>(null);
  const [modeState, setModeState] = useState<VideoInputMode>("frames");
  const [bottomState, setBottomState] = useState<BottomTab>("video");
  const [qtyState, setQtyState] = useState(1);
  const [promptState, setPromptState] = useState("");
  const prompt = controlledPrompt ?? promptState;
  const mode = controlledMode ?? modeState;
  const bottom = controlledBottom ?? bottomState;
  const qty = controlledQuantity ?? qtyState;
  const selectedModelId = modelValue ?? modelOptions[0]?.id ?? "selected";
  const activeMode =
    mode === "reference"
      ? supportsReferenceMode
        ? "reference"
        : supportsFrameMode
          ? "frames"
          : "reference"
      : supportsFrameMode
        ? "frames"
        : supportsReferenceMode
          ? "reference"
          : "frames";
  const visibleFrameSlots = frameSlots.filter(Boolean);
  const visibleReferenceSlots = referenceSlots.filter(Boolean);
  const showPromptSection = showPromptInput || activeMode === "reference";
  const activeReferenceSlot =
    visibleReferenceSlots.find((slot) => slot.id === referenceSlotId) ?? null;
  const referenceAcceptsImage = referenceAccept.includes("image");
  const referenceAcceptsVideo = referenceAccept.includes("video");

  const updatePrompt = (nextPrompt: string) => {
    setPromptState(nextPrompt);
    onPromptChange?.(nextPrompt);
  };

  const updateMode = (nextMode: VideoInputMode) => {
    if (nextMode === "frames" && !supportsFrameMode) return;
    if (nextMode === "reference" && !supportsReferenceMode) return;
    setModeState(nextMode);
    onModeChange?.(nextMode);
  };

  const updateBottom = (nextBottom: BottomTab) => {
    setBottomState(nextBottom);
    onBottomChange?.(nextBottom);
  };

  const updateQuantity = (nextQuantity: number) => {
    const clamped = Math.min(4, Math.max(1, nextQuantity));
    setQtyState(clamped);
    onQuantityChange?.(clamped);
  };

  const openReferencePicker = () => {
    setReferenceOpen(true);
    if (!onReferenceFiles && !onSelectReferenceAsset) {
      onAddReferences?.();
    }
  };

  const openReferenceSlotPicker = (slot: CreateVideoPanelReferenceSlot) => {
    setReferenceSlotId(slot.id);
  };

  const addReferenceSlotFiles = (
    slot: CreateVideoPanelReferenceSlot,
    files: FileList | File[] | null | undefined,
  ) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) slot.onFiles?.(list);
  };

  const addDroppedReferenceFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) onReferenceFiles?.(list);
  };

  const handleReferencePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addDroppedReferenceFiles(files);
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addDroppedReferenceFiles(event.dataTransfer.files);
  };

  const handleCreate = () => {
    setReferenceOpen(false);
    setHistorySlot(null);
    setModelOpen(false);
    onCreate?.();
  };

  return (
    <div className="standalone-create-panel flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-[20px] border border-white/[0.02] bg-[#121314]">
      <header className="flex h-[56px] shrink-0 items-center px-[20px]">
        <h1 className="flex min-w-0 flex-1 items-center text-[16px] font-semibold leading-[24px] tracking-[-0.12px] text-white">
          <span className="standalone-panel-title line-clamp-1">{resolvedTitle}</span>
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[12px] pb-[10px]">
        <div className="grid shrink-0 grid-cols-2 gap-[8px] rounded-[14px] border border-white/[0.02] bg-[#16181a] p-[4px]">
          <VideoModeCard
            active={activeMode === "frames"}
            mode="frames"
            label={copy.startEndFrame}
            disabled={!supportsFrameMode}
            onClick={() => updateMode("frames")}
          />
          <VideoModeCard
            active={activeMode === "reference"}
            mode="reference"
            label={copy.textWithReference}
            disabled={!supportsReferenceMode}
            onClick={() => updateMode("reference")}
          />
        </div>

        <button
          type="button"
          onClick={() => setModelOpen(true)}
          className="standalone-model-card group relative inline-flex min-h-[54px] w-full shrink-0 items-center gap-[10px] overflow-hidden rounded-[14px] border border-white/[0.02] bg-[#16181a] py-[6px] pl-[8px] pr-[10px] transition-colors hover:bg-[#1c1f22]"
        >
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-white text-[15px] font-bold leading-[20px]">
            {modelInitial}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="text-[12px] leading-[16px] text-neutral-400">{resolvedModelCaption}</span>
            <span className="truncate text-[14px] font-semibold leading-[20px] text-white">{cleanModelDisplayName(modelLabel)}</span>
          </div>
          <ChevronRight className="h-[16px] w-[16px] text-neutral-500" />
        </button>

        <ModelsPopover
          open={modelOpen}
          onClose={() => setModelOpen(false)}
          models={buildModels(modelOptions, modelLabel, selectedModelId, copy)}
          selectedIds={[selectedModelId]}
          onToggle={(id) => {
            onModelChange?.(id);
            setModelOpen(false);
          }}
        />
        <ReferencePicker
          open={referenceOpen}
          onClose={() => setReferenceOpen(false)}
          references={references}
          assets={referenceAssets}
          accept={referenceAccept}
          onFiles={onReferenceFiles}
          onSelectAsset={onSelectReferenceAsset}
          onDeleteAsset={onDeleteReferenceAsset}
        />
        <ReferencePicker
          open={!!activeReferenceSlot}
          onClose={() => setReferenceSlotId(null)}
          title={activeReferenceSlot?.label ?? copy.addVisualReference}
          references={activeReferenceSlot?.refItem ? [activeReferenceSlot.refItem] : []}
          assets={referenceAssets.filter((asset) =>
            activeReferenceSlot?.accept === "video"
              ? asset.mime?.startsWith("video/")
              : !asset.mime?.startsWith("video/"),
          )}
          accept={activeReferenceSlot?.accept === "video" ? "video/*" : "image/*"}
          onFiles={activeReferenceSlot?.onFiles}
          onSelectAsset={activeReferenceSlot?.onSelectAsset}
          onDeleteAsset={onDeleteReferenceAsset}
          closeOnSelect
        />
        <ReferencePicker
          open={!!historySlot}
          onClose={() => setHistorySlot(null)}
          title={copy.imageHistory}
          references={historySlot?.refItem ? [historySlot.refItem] : []}
          assets={referenceAssets.filter((asset) => !asset.mime?.startsWith("video/"))}
          accept="image/*"
          onFiles={historySlot?.onHistoryFiles}
          onSelectAsset={historySlot?.onSelectHistoryAsset}
          onDeleteAsset={onDeleteReferenceAsset}
          closeOnSelect
        />

        {activeMode === "frames" && visibleFrameSlots.length > 0 && (
          <section className="shrink-0 rounded-[16px] border border-white/[0.035] bg-[#151719] p-[9px] shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
            <h2 className="mb-[8px] text-[13px] font-semibold leading-[18px] text-white">
              {visibleFrameSlots.length > 1 ? copy.setStartEndFrame : copy.setStartFrame}
            </h2>
            <div className={clsx("grid gap-[8px]", visibleFrameSlots.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {visibleFrameSlots.map((slot) => (
                <FrameReferenceSlot
                  key={slot.id}
                  slot={slot}
                  onHistory={() => setHistorySlot(slot)}
                />
              ))}
            </div>
          </section>
        )}

        {showPromptSection && (
        <section className="shrink-0 rounded-[16px] border border-white/[0.02] bg-[#16181a] p-[7px]">
          <div className="mb-[6px] flex items-center px-[2px]">
            <span className="standalone-section-title text-[14px] font-semibold leading-[20px] text-white">{resolvedPromptLabel}</span>
          </div>

          {activeMode === "reference" && (
            <>
              {visibleReferenceSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-[8px]">
                  {visibleReferenceSlots.map((slot) => (
                    <MotionReferenceSlot
                      key={slot.id}
                      slot={slot}
                      onOpen={() => openReferenceSlotPicker(slot)}
                      onFiles={(files) => addReferenceSlotFiles(slot, files)}
                    />
                  ))}
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-[8px]">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={openReferencePicker}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      openReferencePicker();
                    }}
                    onPaste={handleReferencePaste}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={handleReferenceDrop}
                    className={clsx(
                      "flex items-center gap-[12px] rounded-[8px] border border-[#f4ff00]/95 bg-[#f4ff00]/[0.08] px-[12px] py-[8px] shadow-[inset_0_-8px_24px_0_rgba(238,255,0,0.18),inset_0_2px_6px_0_rgba(238,255,0,0.18),inset_0_-4px_8px_0_rgba(238,255,0,0.3)] transition-all outline-none focus:ring-1 focus:ring-[#f4ff00]/70",
                      onAddReferences || onReferenceFiles || onSelectReferenceAsset ? "cursor-pointer" : "cursor-default",
                    )}
                  >
                    <div className="flex -space-x-[8px]">
                      {references.length > 0 ? (
                        references.slice(0, 3).map((reference) => (
                          reference.mime?.startsWith("video/") ? (
                            <div
                              key={reference.id}
                              className="grid h-[40px] w-[40px] place-items-center rounded-[4px] bg-[#16181a] ring-2 ring-[#121314]"
                            >
                              <Video className="h-[18px] w-[18px] text-white/80" />
                            </div>
                          ) : (
                            <img
                              key={reference.id}
                              src={reference.url}
                              alt=""
                              className="h-[40px] w-[40px] rounded-[4px] object-cover ring-2 ring-[#121314]"
                            />
                          )
                        ))
                      ) : referenceAcceptsImage ? (
                        DEFAULT_REFERENCE_THUMBS.map((src) => (
                          <img
                            key={src}
                            src={src}
                            alt=""
                            className="h-[40px] w-[40px] rounded-[4px] object-cover ring-2 ring-[#121314]"
                          />
                        ))
                      ) : referenceAcceptsVideo ? (
                        <div className="grid h-[40px] w-[40px] place-items-center rounded-[4px] bg-[#16181a] ring-2 ring-[#121314]">
                          <Video className="h-[18px] w-[18px] text-white/80" />
                        </div>
                      ) : (
                        <div className="h-[40px] w-[40px] rounded-[4px] bg-white/[0.06] ring-2 ring-[#121314]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-[8px]">
                        <span className="standalone-reference-title truncate text-[14px] font-semibold leading-[20px] text-white">{resolvedReferenceTitle}</span>
                      </div>
                      <p className="standalone-reference-hint mt-[2px] truncate text-[12px] leading-[16px] text-neutral-400">{resolvedReferenceHint}</p>
                    </div>
                    <span className="self-start text-[12px] leading-[16px] text-neutral-300">
                      {references.length}/{maxReferences}
                    </span>
                  </div>
                </div>
              )}

              {visibleReferenceSlots.length === 0 && references.length > 0 && (
                <div className="mt-[8px] flex flex-wrap gap-[8px]">
                  {references.map((reference, index) => (
                    <SelectedReferenceThumb
                      key={reference.id}
                      reference={reference}
                      index={index}
                      onRemove={onRemoveReference}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {showPromptInput && (
            <StandalonePromptMentionTextarea
              value={prompt}
              onChange={updatePrompt}
              placeholder={resolvedPromptPlaceholder}
              mentionOptions={mentionOptions}
              className="mt-[7px] min-h-[70px] max-h-[190px] rounded-[10px] border-white/[0.06] bg-[#121314] px-[10px] py-[8px] text-[13px] leading-[20px] text-white placeholder:text-neutral-500 focus:border-[#f4ff00]/50"
            />
          )}
        </section>
        )}

        {settings.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-[6px]">
            {settings.map((setting) => (
              <VideoSettingCard key={setting.id} setting={setting} />
            ))}
          </div>
        )}

        {textControls.map((control) => (
          <VideoTextControlCard key={control.id} control={control} />
        ))}

        {extraControls && (
          <div className="flex shrink-0 flex-col gap-[10px]">
            {extraControls}
          </div>
        )}
      </div>

      <div className="flex w-full flex-row items-center justify-between gap-[12px] border-t border-white/[0.03] bg-[#141618] px-[12px] py-[10px]">
        <div className="flex h-[42px] items-center gap-[8px] rounded-[14px] border border-white/[0.05] bg-[#16181a] px-[10px]">
          <button
            type="button"
            onClick={() => updateQuantity(qty - 1)}
            className="grid h-[26px] w-[26px] place-items-center rounded-[8px] text-white transition hover:bg-white/[0.06]"
          >
            <Minus className="h-[15px] w-[15px]" />
          </button>
          <span className="min-w-[34px] text-center text-[14px] font-semibold leading-[20px] text-white tabular-nums">
            {qty}<span className="text-neutral-500">/4</span>
          </span>
          <button
            type="button"
            onClick={() => updateQuantity(qty + 1)}
            className="grid h-[26px] w-[26px] place-items-center rounded-[8px] text-white transition hover:bg-white/[0.06]"
          >
            <Plus className="h-[15px] w-[15px]" />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <CostDiscountLine quote={costQuote} />
          <button
            type="button"
            onClick={handleCreate}
            disabled={running}
            className="standalone-generate-button ci-gloss-button group relative flex h-[42px] w-full items-center justify-center gap-[6px] overflow-hidden rounded-full border px-[8px] text-[14px] font-semibold leading-[20px] transition-all active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="pointer-events-none absolute inset-x-4 top-0 h-[16px] rounded-b-full bg-white/30 blur-[10px]" />
            <span className="pointer-events-none absolute -right-8 top-1/2 h-20 w-28 -translate-y-1/2 rounded-full bg-sky-200/25 blur-2xl" />
            <span className="relative">{running ? resolvedRunningLabel : resolvedCreateLabel}</span>
          </button>
        </div>
      </div>

      <div className="hidden items-center justify-around border-t border-white/[0.04] px-[18px] py-[6px] md:flex">
        {[
          { id: "video", icon: Video, label: copy.video },
          { id: "image", icon: ImageIcon, label: copy.image },
          { id: "3d", icon: Box, label: "3D" },
          { id: "audio", icon: Music, label: copy.audio },
        ].map(({ id, icon: Icon, label }) => {
          const active = bottom === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => updateBottom(id as BottomTab)}
              title={label}
              aria-label={label}
              className={clsx(
                "grid h-[34px] w-[34px] place-items-center rounded-full transition-all",
                active
                  ? "bg-white text-black shadow-[0_6px_18px_-10px_rgba(255,255,255,.75)]"
                  : "text-neutral-400 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

function VideoModeCard({
  active,
  disabled,
  mode,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  mode: VideoInputMode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "video-mode-card group relative flex h-[70px] min-w-0 flex-col items-center justify-center gap-[6px] overflow-hidden rounded-[12px] text-[13px] font-semibold leading-[18px] transition-all",
        disabled
          ? "cursor-not-allowed bg-white/[0.015] text-neutral-600 ring-1 ring-inset ring-white/[0.03]"
          : active
            ? "create-tab-active text-white ring-1 ring-inset ring-[#f4ff00]/30"
            : "bg-transparent text-neutral-300 ring-1 ring-inset ring-white/[0.05] hover:bg-white/[0.04]",
      )}
    >
      <VideoModeIcon mode={mode} active={active} disabled={disabled} />
      <span className="video-mode-card-label max-w-full truncate px-[4px]">{label}</span>
    </button>
  );
}

function VideoModeIcon({
  mode,
  active,
  disabled,
}: {
  mode: VideoInputMode;
  active: boolean;
  disabled?: boolean;
}) {
  const isFrames = mode === "frames";
  const Icon = isFrames ? ImageIcon : FileText;
  return (
    <div
      className={clsx(
        "relative grid h-[30px] w-[34px] translate-y-[4px] place-items-center overflow-hidden rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,.22)] transition-transform",
        disabled
          ? "bg-[linear-gradient(135deg,#3a3d42_0%,#25272b_54%,#16181a_100%)] opacity-70 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]"
          : isFrames
            ? "bg-[linear-gradient(135deg,#f8ff66_0%,#d7e600_48%,#f4ff00_100%)]"
            : "bg-[linear-gradient(135deg,#f4ff00_0%,#9fb800_48%,#f8ff66_100%)]",
        active && !disabled && "scale-105 shadow-[0_0_18px_rgba(238,255,0,.35),inset_0_1px_0_rgba(255,255,255,.28)]",
      )}
    >
      <div className={clsx("absolute inset-x-0 top-0 h-1/2 blur-[6px]", disabled ? "bg-white/5" : "bg-white/20")} />
      <Icon className={clsx("relative h-[17px] w-[17px] drop-shadow-[0_1px_3px_rgba(0,0,0,.45)]", disabled ? "text-neutral-400" : "text-white")} />
      {isFrames ? (
        <span className={clsx("absolute -right-[3px] bottom-[4px] h-[13px] w-[13px] rounded-[4px] border bg-black/30 backdrop-blur-sm", disabled ? "border-white/10" : "border-white/35")} />
      ) : (
        <span className={clsx("absolute right-[5px] top-[4px] h-[6px] w-[6px] rounded-full", disabled ? "bg-neutral-500" : "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.9)]")} />
      )}
    </div>
  );
}

function FrameReferenceSlot({
  slot,
  onHistory,
}: {
  slot: CreateVideoPanelFrameSlot;
  onHistory?: () => void;
}) {
  const copy = usePanelCopy();
  const refItem = slot.refItem;
  const isVideo = refItem?.mime?.startsWith("video/");
  const frameLabel = slot.id === "start" ? copy.startFrame : copy.endFrame;
  const canUpload = Boolean(slot.onUpload);
  const addFrameFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) slot.onHistoryFiles?.(list);
  };
  const handleFramePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    addFrameFiles(files);
  };
  const handleFrameDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFrameFiles(event.dataTransfer.files);
  };
  return (
    <div
      tabIndex={0}
      onPaste={handleFramePaste}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleFrameDrop}
      className="group relative flex min-h-[82px] flex-col overflow-hidden rounded-[12px] border border-white/[0.055] bg-[linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))] p-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_22px_-18px_rgba(0,0,0,.9)] outline-none transition hover:border-[#f4ff00]/45 hover:bg-[linear-gradient(180deg,rgba(244,255,0,.055),rgba(255,255,255,.012))] focus:border-[#f4ff00]/45"
    >
      <div className="pointer-events-none absolute inset-x-[10px] top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-70" />
      <button
        type="button"
        onClick={slot.onUpload}
        disabled={!canUpload}
        className={clsx(
          "relative flex min-h-[54px] flex-1 overflow-hidden rounded-[10px] outline-none transition",
          refItem
            ? "items-center gap-[9px] px-[8px] text-left"
            : "flex-col items-center justify-center gap-[8px] px-[6px] text-center",
          canUpload
            ? "cursor-pointer hover:bg-white/[0.035]"
            : "cursor-default",
        )}
      >
        {refItem ? (
          <>
            {isVideo ? (
              <div className="grid h-[46px] w-[54px] shrink-0 place-items-center rounded-[9px] bg-black/55 ring-1 ring-white/[0.08]">
                <Video className="h-[18px] w-[18px] text-white/80" />
              </div>
            ) : (
              <img src={refItem.url} alt="" className="h-[46px] w-[54px] shrink-0 rounded-[9px] object-cover ring-1 ring-white/[0.08]" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-medium uppercase leading-[13px] tracking-[0.04em] text-[#f4ff00]">
                {frameLabel}
              </span>
              <span className="block truncate text-[12px] font-semibold leading-[16px] text-white">
                {refItem.name ?? slot.label}
              </span>
              <span className="mt-[1px] block text-[10px] leading-[13px] text-neutral-500">
                {copy.clickToReplace}
              </span>
            </span>
            {slot.onRemove && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  slot.onRemove?.();
                }}
                className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full bg-black/45 text-white opacity-0 ring-1 ring-white/[0.08] backdrop-blur transition hover:bg-white hover:text-black group-hover:opacity-100"
              >
                <Trash2 className="h-[12px] w-[12px]" />
              </span>
            )}
          </>
        ) : (
          <>
            <span className="relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,.2),transparent_42%),linear-gradient(135deg,rgba(238,255,0,.34),rgba(244,255,0,.16))] text-white ring-1 ring-[#f4ff00]/25">
              {slot.uploading ? (
                <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
              ) : (
                <>
                  <ImageIcon className="h-[16px] w-[16px]" />
                  <span className="absolute -bottom-[4px] -right-[4px] grid h-[15px] w-[15px] place-items-center rounded-full bg-[#16181a] text-white ring-1 ring-white/[0.12]">
                    <Plus className="h-[10px] w-[10px]" />
                  </span>
                </>
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase leading-[13px] tracking-[0.04em] text-[#f4ff00]">
                {frameLabel}
              </span>
            </span>
          </>
        )}
      </button>

      {slot.historyLabel && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHistory?.();
          }}
          className="mx-auto mt-[4px] inline-flex h-[21px] min-w-[58px] items-center justify-center rounded-full border border-white/[0.06] bg-black/[0.18] px-[10px] text-center text-[10px] font-semibold leading-none text-neutral-400 transition hover:border-[#f4ff00]/35 hover:bg-[#f4ff00]/10 hover:text-white"
        >
          {slot.historyLabel}
        </button>
      )}
    </div>
  );
}

function MotionReferenceSlot({
  slot,
  onOpen,
  onFiles,
}: {
  slot: CreateVideoPanelReferenceSlot;
  onOpen: () => void;
  onFiles: (files: FileList | File[] | null | undefined) => void;
}) {
  const refItem = slot.refItem;
  const isVideo = slot.accept === "video";
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFiles(files);
  };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onFiles(event.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      onPaste={handlePaste}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleDrop}
      className="group relative flex min-h-[76px] items-center gap-[10px] overflow-hidden rounded-[12px] border border-[#f4ff00]/55 bg-[#f4ff00]/[0.06] p-[8px] outline-none shadow-[inset_0_-8px_22px_rgba(238,255,0,0.12),inset_0_1px_6px_rgba(255,255,255,0.04)] transition hover:border-[#f4ff00]/80 hover:bg-[#f4ff00]/[0.1] focus:ring-1 focus:ring-[#f4ff00]/60"
    >
      <div className="grid h-[56px] w-[64px] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-black/35 ring-1 ring-white/[0.08]">
        {refItem ? (
          refItem.mime?.startsWith("video/") ? (
            <Video className="h-[20px] w-[20px] text-white/85" />
          ) : (
            <img src={refItem.url} alt="" className="h-full w-full object-cover" />
          )
        ) : slot.uploading ? (
          <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
        ) : isVideo ? (
          <Video className="h-[20px] w-[20px] text-white/70" />
        ) : (
          <ImageIcon className="h-[20px] w-[20px] text-white/70" />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[20px] text-white">
        {slot.label}
      </span>
      {slot.onRemove && refItem && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            slot.onRemove?.();
          }}
          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-black/45 text-white opacity-0 ring-1 ring-white/[0.08] backdrop-blur transition hover:bg-white hover:text-black group-hover:opacity-100"
        >
          <Trash2 className="h-[13px] w-[13px]" />
        </button>
      )}
    </div>
  );
}

function VideoSettingCard({ setting }: { setting: CreateVideoPanelSetting }) {
  const kind = setting.kind ?? "select";
  const displayValue =
    setting.options?.find((option) => option.value === setting.value)?.label ??
    setting.value;
  const content = (
    <>
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-white/[0.045] text-neutral-300">
        <SlidersHorizontal className="h-[14px] w-[14px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="standalone-setting-label text-[11px] leading-[14px] text-neutral-400">{setting.label}</span>
        <span className="standalone-setting-value max-w-full truncate text-[13px] font-semibold leading-[16px] text-white">{displayValue}</span>
      </span>
    </>
  );

  if (kind === "toggle") {
    return (
      <button
        type="button"
        onClick={() => setting.onToggle?.(!setting.checked)}
        className="standalone-setting-card flex min-h-[44px] items-center gap-[7px] rounded-[12px] border border-white/[0.02] bg-[#16181a] px-[7px] py-[6px] text-left transition hover:bg-[#1b1d1f]"
      >
        {content}
        <VideoSwitch checked={!!setting.checked} />
      </button>
    );
  }

  if (kind === "readonly" || !setting.options?.length) {
    return (
      <div className="standalone-setting-card flex min-h-[44px] items-center gap-[7px] rounded-[12px] border border-white/[0.02] bg-[#16181a] px-[7px] py-[6px] text-left">
        {content}
      </div>
    );
  }

  return <VideoSettingSelectCard setting={setting} content={content} />;
}

function VideoSettingSelectCard({
  setting,
  content,
}: {
  setting: CreateVideoPanelSetting;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const safeOptions = setting.options ?? [];

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = buttonRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 10;
      const estimatedHeight = Math.min(220, safeOptions.length * 32 + 8);
      const openUp = rect.bottom + 6 + estimatedHeight > window.innerHeight - viewportPadding;
      const top = openUp
        ? Math.max(viewportPadding, rect.top - estimatedHeight - 6)
        : rect.bottom + 6;
      const width = Math.max(168, rect.width);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );

      setMenuStyle({
        left,
        top,
        width,
        maxHeight: Math.min(220, window.innerHeight - top - viewportPadding),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, safeOptions.length]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        className={clsx(
          "standalone-setting-card relative flex min-h-[44px] cursor-pointer items-center gap-[7px] rounded-[12px] border px-[7px] py-[6px] text-left transition",
          open
            ? "border-[#f4ff00]/35 bg-[#1b1d1f] shadow-[0_0_0_1px_rgba(238,255,0,.18),0_14px_30px_-22px_rgba(238,255,0,.8)]"
            : "border-white/[0.02] bg-[#16181a] hover:bg-[#1b1d1f]",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={setting.label}
      >
        {content}
        <ChevronDown
          className={clsx(
            "h-[13px] w-[13px] shrink-0 text-neutral-500 transition-transform",
            open && "rotate-180 text-neutral-300",
          )}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            className="fixed z-[10000] overflow-y-auto rounded-[12px] border border-white/[0.08] bg-[#1b1d1f]/95 p-[4px] text-white shadow-[0_18px_50px_-24px_rgba(0,0,0,.9),0_0_0_1px_rgba(238,255,0,.08)] backdrop-blur-xl"
          >
            {safeOptions.map((option) => {
              const selected = option.value === setting.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setting.onChange?.(option.value);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex min-h-[30px] w-full items-center justify-between gap-[8px] rounded-[9px] px-[9px] py-[6px] text-left text-[12px] font-semibold leading-[16px] transition-colors",
                    selected
                      ? "bg-[#f4ff00]/15 text-white ring-1 ring-[#f4ff00]/35"
                      : "text-neutral-300 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {selected && <Check className="h-[14px] w-[14px] shrink-0 text-[#f4ff00]" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

function VideoSwitch({ checked }: { checked: boolean }) {
  return (
    <span
      className={clsx(
        "relative h-[17px] w-[29px] shrink-0 rounded-full transition-colors",
        checked ? "bg-[#f4ff00]" : "bg-neutral-600",
      )}
    >
      <span
        className={clsx(
          "absolute top-[3px] h-[11px] w-[11px] rounded-full bg-white transition-transform",
          checked ? "translate-x-[15px]" : "translate-x-[3px]",
        )}
      />
    </span>
  );
}

function VideoTextControlCard({ control }: { control: CreateVideoPanelTextControl }) {
  const rows = control.rows ?? 2;
  const compact = rows <= 2;

  return (
    <label
      className={clsx(
        "flex shrink-0 flex-col rounded-[12px] border border-white/[0.025] bg-[#16181a]",
        compact ? "gap-[6px] px-[10px] py-[8px]" : "gap-[8px] p-[10px]",
      )}
    >
      <span className="standalone-text-control-label text-[12px] font-semibold leading-[16px] text-white">{control.label}</span>
      <textarea
        value={control.value}
        onChange={(event) => control.onChange(event.target.value)}
        placeholder={control.placeholder}
        rows={compact ? 1 : rows}
        className={clsx(
          "w-full resize-none rounded-[10px] border border-white/[0.06] bg-[#121314] text-white outline-none placeholder:text-neutral-500 focus:border-[#f4ff00]/50",
          compact
            ? "h-[38px] overflow-hidden px-[10px] py-[9px] text-[12px] leading-[18px]"
            : "min-h-[76px] px-[10px] py-[8px] text-[12px] leading-[18px]",
        )}
      />
    </label>
  );
}

const DEFAULT_REFERENCE_THUMBS = [sampleRefOne, sampleRefTwo, sampleRefThree];

const REFERENCE_MEDIA_EXT_RE = /\.(png|jpe?g|webp|gif|mp4|mov|webm|m4v)$/i;

function cleanReferenceFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .split(/[?#]/)[0]
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/^[0-9]{10,}[-_]/, "")
    .replace(/[\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function referenceFileNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return cleanReferenceFileName(decodeURIComponent(parsed.pathname));
  } catch {
    return cleanReferenceFileName(decodeURIComponent(url));
  }
}

function referenceBaseName(reference: CreateImagePanelReference, index: number): string {
  const explicit = cleanReferenceFileName(reference.name);
  if (explicit && REFERENCE_MEDIA_EXT_RE.test(explicit)) return explicit;
  const urlName = referenceFileNameFromUrl(reference.url);
  if (urlName && REFERENCE_MEDIA_EXT_RE.test(urlName)) return urlName;
  if (explicit && explicit.length <= 28) return explicit;
  if (urlName) return urlName;
  return `image-${index + 1}`;
}

function shortenReferenceName(name: string, maxChars = 10): string {
  const chars = Array.from(name);
  if (chars.length <= maxChars) return name;
  return `${chars.slice(0, maxChars).join("")}...`;
}

function referenceDisplayLabel(reference: CreateImagePanelReference, index: number, maxChars = 10): string {
  return shortenReferenceName(referenceBaseName(reference, index), maxChars);
}

function pickerReferenceKey(reference: CreateImagePanelReference): string {
  if (reference.assetId) return `asset:${reference.assetId}`;
  if (reference.storageBucket && reference.storagePath) {
    return `storage:${reference.storageBucket}/${reference.storagePath}`;
  }
  return `url:${reference.url?.split("?")[0] || reference.id}`;
}

function standaloneMentionLabel(reference: CreateImagePanelReference, index: number): string {
  return referenceDisplayLabel(reference, index, 10);
}

export function StandalonePromptMentionTextarea({
  value,
  onChange,
  placeholder,
  mentionOptions,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mentionOptions: CreateImagePanelReference[];
  className?: string;
}) {
  return (
    <ReactFlowProvider>
      <StandalonePromptMentionTextareaInner
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        mentionOptions={mentionOptions}
        className={className}
      />
    </ReactFlowProvider>
  );
}

function StandalonePromptMentionTextareaInner({
  value,
  onChange,
  placeholder,
  mentionOptions,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mentionOptions: CreateImagePanelReference[];
  className?: string;
}) {
  const { setNodes } = useReactFlow();
  const mentionNodes = useMemo<Node[]>(
    () =>
      mentionOptions.map((reference, index) => {
        const fieldType = reference.mime?.startsWith("video/")
          ? "video"
          : reference.mime?.startsWith("audio/")
            ? "audio"
            : "image";
        return {
          id: reference.id,
          type: "assetNode",
          position: { x: 0, y: 0 },
          data: {
            label: standaloneMentionLabel(reference, index),
            previewUrl: reference.url,
            storagePath: reference.url,
            fieldType,
          },
        };
      }),
    [mentionOptions],
  );

  useEffect(() => {
    setNodes(mentionNodes);
    return () => setNodes([]);
  }, [mentionNodes, setNodes]);

  return (
    <PromptMentionTextarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allowedNodeTypes={["assetNode"]}
      allowedTextVarTypes={[]}
      mentionOptionsOverride={mentionNodes.map((node) => ({
        nodeId: node.id,
        label: String(node.data?.label ?? "asset"),
        type: node.type ?? "assetNode",
        icon: node.data?.fieldType === "video" ? "video" : "image",
        previewUrl: typeof node.data?.previewUrl === "string" ? node.data.previewUrl : undefined,
      }))}
      className={className}
    />
  );
}

function SelectedReferenceThumb({
  reference,
  index,
  onRemove,
}: {
  reference: CreateImagePanelReference;
  index: number;
  onRemove?: (id: string) => void;
}) {
  const copy = usePanelCopy();
  const isVideo = reference.mime?.startsWith("video/");
  const label = referenceDisplayLabel(reference, index, 10);
  const fullLabel = referenceBaseName(reference, index);
  return (
    <div
      className="group relative h-[82px] w-[82px] overflow-hidden rounded-[8px] bg-black ring-1 ring-white/10"
      title={fullLabel}
    >
      {isVideo ? (
        <div className="grid h-full w-full place-items-center bg-[#16181a]">
          <Video className="h-[22px] w-[22px] text-white/80" />
        </div>
      ) : (
        <img src={reference.url} alt="" className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-[6px] pb-[5px] pt-[22px]">
        <span className="block truncate text-[10px] font-semibold leading-none text-white">
          {label}
        </span>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(reference.id);
          }}
          className="absolute right-[4px] top-[4px] grid h-[20px] w-[20px] place-items-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-white hover:text-black group-hover:opacity-100"
          aria-label={copy.removeReference}
        >
          <X className="h-[12px] w-[12px]" />
        </button>
      )}
    </div>
  );
}

function ReferencePicker({
  open,
  onClose,
  title,
  references,
  assets,
  accept,
  onFiles,
  onSelectAsset,
  onDeleteAsset,
  closeOnSelect = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  references: CreateImagePanelReference[];
  assets: CreateImagePanelReference[];
  accept: string;
  onFiles?: (files: File[]) => MaybePromise<void>;
  onSelectAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  onDeleteAsset?: (reference: CreateImagePanelReference) => MaybePromise<void>;
  closeOnSelect?: boolean;
}) {
  const copy = usePanelCopy();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const localUploadUrlsRef = useRef<string[]>([]);
  const uploadingLocalIdsRef = useRef<Set<string>>(new Set());
  const [tab, setTab] = useState<"creations" | "uploads">("creations");
  const [localUploads, setLocalUploads] = useState<LocalPickerUpload[]>([]);
  const [selectingLocalUploadId, setSelectingLocalUploadId] = useState<string | null>(null);
  const selectedKeys = new Set(references.map(pickerReferenceKey));
  const acceptsImages = accept.includes("image");
  const acceptsVideos = accept.includes("video");
  const pickerAssets = useMemo(() => {
    const seen = new Set<string>();
    return [...references, ...localUploads, ...assets].filter((asset) => {
      const key = pickerReferenceKey(asset);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [assets, localUploads, references]);
  const visibleAssets = useMemo(() => {
    const isCompatible = (asset: CreateImagePanelReference) => {
      const mime = asset.mime ?? "";
      if (acceptsImages && mime.startsWith("image/")) return true;
      if (acceptsVideos && mime.startsWith("video/")) return true;
      // Older rows can be missing a MIME type. Keep them usable for image-only
      // references because those rows are image assets in the existing data model.
      return acceptsImages && !mime;
    };
    const isCreation = (asset: CreateImagePanelReference) =>
      asset.source === "generation" || !asset.source;
    const isUpload = (asset: CreateImagePanelReference) =>
      asset.source === "upload" || asset.source === "user_asset";

    return pickerAssets.filter(
      (asset) => isCompatible(asset) && (tab === "creations" ? isCreation(asset) : isUpload(asset)),
    );
  }, [acceptsImages, acceptsVideos, pickerAssets, tab]);
  const uploadLabel =
    acceptsVideos && !acceptsImages
      ? copy.uploadVideos
      : acceptsVideos && acceptsImages
        ? copy.uploadAssets
        : copy.uploadImages;

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => panelRef.current?.focus(), 0);
  }, [open]);

  useEffect(
    () => () => {
      localUploadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localUploadUrlsRef.current = [];
    },
    [],
  );

  if (!open) return null;

  const localUploadFileKey = (file: File) =>
    `${file.name}:${file.size}:${file.type}:${file.lastModified}`;

  const addFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []).filter((file) =>
      (acceptsImages && file.type.startsWith("image/")) ||
      (acceptsVideos && file.type.startsWith("video/")),
    );
    if (list.length === 0) return;
    setLocalUploads((prev) => {
      const seenFiles = new Set(prev.map((upload) => localUploadFileKey(upload.file)));
      const nextUploads: LocalPickerUpload[] = [];
      for (const file of list) {
        const key = localUploadFileKey(file);
        if (seenFiles.has(key)) continue;
        seenFiles.add(key);
        const url = URL.createObjectURL(file);
        localUploadUrlsRef.current.push(url);
        nextUploads.push({
          id: `local-${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          url,
          mime: file.type,
          source: "upload" as const,
          file,
          localObjectUrl: url,
        });
      }
      return nextUploads.length > 0 ? [...nextUploads, ...prev].slice(0, 80) : prev;
    });
    setTab("uploads");
  };

  const discardLocalUpload = (upload: LocalPickerUpload) => {
    URL.revokeObjectURL(upload.localObjectUrl);
    localUploadUrlsRef.current = localUploadUrlsRef.current.filter(
      (url) => url !== upload.localObjectUrl,
    );
    setLocalUploads((prev) => prev.filter((item) => item.id !== upload.id));
  };

  const selectLocalUpload = async (upload: LocalPickerUpload) => {
    if (!onFiles || uploadingLocalIdsRef.current.has(upload.id)) return;
    uploadingLocalIdsRef.current.add(upload.id);
    setSelectingLocalUploadId(upload.id);
    try {
      await onFiles([upload.file]);
      discardLocalUpload(upload);
      if (closeOnSelect) onClose();
    } finally {
      uploadingLocalIdsRef.current.delete(upload.id);
      setSelectingLocalUploadId(null);
    }
  };

  const selectAsset = async (asset: CreateImagePanelReference) => {
    await onSelectAsset?.(asset);
    if (closeOnSelect) onClose();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      addFiles(files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(event.dataTransfer.files);
  };

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      onPaste={handlePaste}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleDrop}
      className="fixed left-3 right-3 top-16 bottom-4 z-50 flex flex-col overflow-hidden rounded-[20px] border border-white/[0.06] bg-[#1b1d1f] shadow-[0_8px_64px_0_rgba(0,0,0,0.6)] outline-none lg:left-[742px] lg:right-3 lg:top-[66px] lg:bottom-0"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <header className="flex h-[56px] shrink-0 items-center justify-between px-[20px]">
        <h2 className="text-[17px] font-semibold leading-6 text-white">{title ?? copy.addVisualReference}</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] text-neutral-300 transition hover:bg-white/[0.06] hover:text-white"
          aria-label={copy.closeReferences}
        >
          <X className="h-[16px] w-[16px]" />
        </button>
      </header>

      <div className="flex items-center gap-[6px] px-[16px] pb-[16px]">
        {(["creations", "uploads"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={clsx(
              "h-[34px] rounded-full px-[13px] text-[13px] font-semibold transition",
              tab === item
                ? "bg-white text-black"
                : "bg-white/[0.08] text-neutral-400 hover:text-white",
            )}
          >
            {item === "creations" ? copy.creations : copy.uploads}
          </button>
        ))}
      </div>

      <div className="ws-scroll-hide min-h-0 flex-1 overflow-y-auto px-[16px] pb-[18px]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-[8px]">
          {tab === "uploads" && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-[126px] flex-col items-center justify-center gap-[10px] rounded-[10px] bg-white/[0.08] text-neutral-300 ring-1 ring-white/[0.04] transition hover:bg-white/[0.12] hover:text-white"
            >
              <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white/[0.08] shadow-[0_0_24px_rgba(255,255,255,.12)]">
                <Upload className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[13px] font-semibold">{uploadLabel}</span>
              <span className="px-3 text-center text-[11px] leading-[14px] text-neutral-500">
                {copy.dropFiles}
              </span>
            </button>
          )}

          {visibleAssets.map((asset, index) => {
            const localUpload = "file" in asset ? (asset as LocalPickerUpload) : null;
            const selected = selectedKeys.has(pickerReferenceKey(asset));
            const isSelectingLocal = !!localUpload && selectingLocalUploadId === localUpload.id;
            const label = referenceDisplayLabel(asset, index, 10);
            const fullLabel = referenceBaseName(asset, index);
            return (
              <button
                key={asset.id}
                type="button"
                title={fullLabel}
                disabled={isSelectingLocal}
                onClick={() => {
                  if (localUpload) {
                    void selectLocalUpload(localUpload);
                    return;
                  }
                  void selectAsset(asset);
                }}
                className={clsx(
                  "group relative h-[126px] overflow-hidden rounded-[10px] bg-black text-left ring-1 transition",
                  isSelectingLocal && "cursor-wait opacity-70",
                  selected
                    ? "ring-[#f4ff00]"
                    : "ring-white/[0.06] hover:ring-[#f4ff00]/70",
                )}
              >
                {asset.mime?.startsWith("video/") ? (
                  <video
                    src={asset.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <img src={asset.url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-[8px] pb-[7px] pt-[30px]">
                  <span className="block truncate text-[10px] font-semibold text-white">{label}</span>
                </div>
                {selected && (
                  <span className="absolute left-[6px] top-[6px] grid h-[20px] w-[20px] place-items-center rounded-full bg-[#f4ff00] text-black">
                    <Check className="h-[13px] w-[13px]" />
                  </span>
                )}
                {isSelectingLocal && (
                  <span className="absolute inset-0 grid place-items-center bg-black/55 text-[11px] font-semibold text-white backdrop-blur-[1px]">
                    {copy.creating}
                  </span>
                )}
                {(onDeleteAsset || localUpload) && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (localUpload) {
                        URL.revokeObjectURL(localUpload.localObjectUrl);
                        localUploadUrlsRef.current = localUploadUrlsRef.current.filter(
                          (url) => url !== localUpload.localObjectUrl,
                        );
                        setLocalUploads((prev) =>
                          prev.filter((upload) => upload.id !== localUpload.id),
                        );
                        return;
                      }
                      onDeleteAsset?.(asset);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (localUpload) {
                        URL.revokeObjectURL(localUpload.localObjectUrl);
                        localUploadUrlsRef.current = localUploadUrlsRef.current.filter(
                          (url) => url !== localUpload.localObjectUrl,
                        );
                        setLocalUploads((prev) =>
                          prev.filter((upload) => upload.id !== localUpload.id),
                        );
                        return;
                      }
                      onDeleteAsset?.(asset);
                    }}
                    className="absolute right-[6px] top-[6px] grid h-[26px] w-[26px] place-items-center rounded-full border border-white/[0.10] bg-black/70 text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,.35)] backdrop-blur transition hover:border-red-300/40 hover:bg-red-500/90 hover:text-white group-hover:opacity-100"
                    aria-label={copy.deleteAsset}
                    title={copy.deleteAsset}
                  >
                    <Trash2 className="h-[13px] w-[13px]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {visibleAssets.length === 0 && (
          <div className="mt-[14px] rounded-[12px] border border-dashed border-white/[0.08] px-[14px] py-[16px] text-[13px] text-neutral-400">
            {copy.noAssets}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface Model {
  id: string;
  name: string;
  description: string;
  iconSrc?: string;
  coverSrc?: string;
  badge?: string;
  settings?: ModelSettingTag[];
  recommended?: boolean;
}

type Filter = "all-models" | "all";

interface ModelsPopoverProps {
  open: boolean;
  onClose: () => void;
  models: Model[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

const buildModels = (
  options: CreateImagePanelModel[],
  fallbackLabel: string,
  fallbackId: string,
  copy: ReturnType<typeof usePanelCopy>,
): Model[] => {
  const source =
    options.length > 0 ? options : [{ id: fallbackId, label: fallbackLabel }];
  return orderModelsByRecommendation(source).map((model) => ({
    id: model.id,
    name: cleanModelDisplayName(model.label),
    description: modelDescriptionFor(model.id, model.label, copy),
    badge: modelBadgeFor(model.id, model.label, copy),
    settings: model.settings ?? [],
    recommended: recommendationRankForModel(model.id) !== null,
  }));
};

const modelDescriptionFor = (
  id: string,
  name: string,
  copy: ReturnType<typeof usePanelCopy>,
) => {
  const haystack = `${id} ${name}`.toLowerCase();
  if (haystack.includes("auto")) return copy.autoModel;
  if (haystack.includes("gpt")) return copy.gptModel;
  if (haystack.includes("veo")) return copy.googleVideoModel;
  if (haystack.includes("seedance")) return copy.seedanceModel;
  if (haystack.includes("kling")) return copy.klingModel;
  if (haystack.includes("tripo") || haystack.includes("hyper3d")) {
    return copy.threeDModel;
  }
  if (haystack.includes("tts") || haystack.includes("elevenlabs")) {
    return copy.voiceModel;
  }
  if (haystack.includes("google cloud")) return copy.voiceModel;
  if (haystack.includes("nano") || haystack.includes("banana")) {
    return haystack.includes("pro")
      ? copy.googlePremiumImage
      : copy.googleImage;
  }
  if (haystack.includes("seedream")) return copy.byteDanceImage;
  if (haystack.includes("flux")) return copy.fluxImage;
  if (haystack.includes("recraft")) return copy.recraftImage;
  return copy.imageModel;
};

const modelBadgeFor = (id: string, name: string, copy: ReturnType<typeof usePanelCopy>) => {
  const haystack = `${id} ${name}`.toLowerCase();
  if (haystack.includes("gpt") || haystack.includes("nano") || haystack.includes("seedream")) {
    return copy.newBadge;
  }
  return undefined;
};

export const ModelsPopover: React.FC<ModelsPopoverProps> = ({
  open,
  onClose,
  models,
  selectedIds,
  onToggle,
}) => {
  const copy = usePanelCopy();
  const [filter, setFilter] = useState<Filter>("all-models");
  const recommendedModels = models.filter((model) => model.recommended);
  const recommended = recommendedModels.length > 0
    ? recommendedModels
    : models.slice(0, Math.min(3, models.length));

  if (!open || models.length === 0) return null;

  const selectModel = (id: string) => {
    onToggle(id);
    onClose();
  };

  return createPortal(
    <div
      data-state={open ? "open" : "closed"}
      className={clsx(
        "standalone-models-popover fixed left-3 right-3 top-16 bottom-4 z-50 flex flex-col overflow-hidden lg:left-[742px] lg:right-3 lg:top-[66px] lg:bottom-0",
        "bg-[#1b1d1f] border border-white/[0.04] rounded-[20px]",
        "shadow-[0_8px_64px_0_rgba(0,0,0,0.6)]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=open]:slide-in-from-left-2",
      )}
    >
      <div className="flex h-[44px] shrink-0 items-center justify-between gap-[12px] px-[16px]">
        <h3 className="text-[15px] font-semibold leading-5 text-white">{copy.models}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] hover:bg-white/[0.06] transition-colors"
          aria-label={copy.closeModels}
        >
          <X className="h-4 w-4 text-neutral-300" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {recommended.length > 0 && (
          <div className="px-[16px]">
            <p className="mb-[6px] text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              {copy.recommended}
            </p>
            <div className="ws-scroll-hide flex gap-[8px] overflow-x-auto pb-[4px]">
              {recommended.map((model, index) => (
                <RecommendedCard
                  key={model.id}
                  model={model}
                  index={index}
                  selected={selectedIds.includes(model.id)}
                  onClick={() => selectModel(model.id)}
                  showNext={index === recommended.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        <div className="inline-flex shrink-0 items-center justify-between self-stretch px-[16px] py-[8px]">
          <button
            type="button"
            data-state={filter === "all-models" ? "active" : "inactive"}
            onClick={() => setFilter("all-models")}
            className="flex h-[30px] cursor-pointer items-center justify-center rounded-full px-[12px] text-[12px] transition-colors data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-[#111113] data-[state=inactive]:bg-transparent data-[state=inactive]:font-medium data-[state=inactive]:text-neutral-400 data-[state=inactive]:hover:opacity-80"
          >
            {copy.allModels}
          </button>

          <button
            type="button"
            data-state={filter === "all" ? "active" : "inactive"}
            onClick={() => setFilter("all")}
            className="flex h-[30px] items-center gap-[4px] rounded-full px-[12px] text-[12px] font-medium text-neutral-400 hover:opacity-80"
          >
            {copy.all} <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div className="flex flex-col gap-[4px] px-[12px] pb-[12px]">
          {models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              selected={selectedIds.includes(model.id)}
              onClick={() => selectModel(model.id)}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface RecommendedCardProps {
  model: Model;
  index: number;
  selected: boolean;
  onClick: () => void;
  showNext?: boolean;
}

const RecommendedCard: React.FC<RecommendedCardProps> = ({
  model,
  index,
  selected,
  onClick,
  showNext = false,
}) => (
  <div
    onClick={onClick}
    className={clsx(
      "transition-all duration-300 ease-out shrink-0 rounded-[12px]",
      "h-[112px] w-[248px] p-[2px] cursor-pointer border-[1.5px] relative overflow-hidden",
      selected ? "border-[#f4ff00]" : "border-transparent",
    )}
  >
    <div
      className={clsx(
        "relative w-full h-full rounded-[10px] overflow-hidden",
        recommendedGradientFor(index),
      )}
    >
      {model.coverSrc && (
        <img
          src={model.coverSrc}
          alt={model.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {showNext && (
        <span className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur-md">
          <ChevronRight className="h-4 w-4 text-white" />
        </span>
      )}

      <div className="absolute bottom-[10px] left-[12px] right-[48px]">
        <h4 className="truncate text-[15px] font-bold leading-tight text-white">
          {model.name}
        </h4>
        <p className="mt-1 line-clamp-1 text-[11px] text-white/80">
          {model.description}
        </p>
      </div>
    </div>
  </div>
);

interface ModelListItemProps {
  model: Model;
  selected: boolean;
  onClick: () => void;
}

const ModelListItem: React.FC<ModelListItemProps> = ({ model, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      "group flex min-h-[46px] w-full items-center gap-[8px] rounded-[10px] p-[6px]",
      "transition-colors text-left",
      selected ? "bg-[#f4ff00]/[0.08] ring-1 ring-[#f4ff00]/40" : "hover:bg-white/[0.04]",
    )}
  >
    <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white/[0.06]">
      {model.iconSrc ? (
        <img src={model.iconSrc} alt={model.name} className="w-full h-full object-cover" />
      ) : (
        <Layers className="h-[18px] w-[18px] text-neutral-300" />
      )}
    </div>

    <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
      <div className="flex items-center gap-[8px]">
        <p className="truncate text-[13px] font-semibold leading-4 text-white">{model.name}</p>
        {model.badge && (
          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
            {model.badge}
          </span>
        )}
      </div>
      <p className="truncate text-[11px] leading-[14px] text-neutral-400">{model.description}</p>

      {model.settings && model.settings.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-[4px]">
          {model.settings.map((setting) => (
            <ModelSettingChip key={`${model.id}-${setting.label}`} setting={setting} />
          ))}
        </div>
      )}
    </div>

    {selected && (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f4ff00] text-xs font-bold text-black">
        <Check className="h-3 w-3" />
      </span>
    )}
  </button>
);

function ModelSettingChip({ setting }: { setting: ModelSettingTag }) {
  const Icon =
    setting.icon === "reference"
      ? ImageIcon
      : setting.icon === "frames"
        ? Clipboard
        : setting.icon === "audio"
          ? Music
          : setting.icon === "multi"
            ? Video
            : setting.icon === "resolution"
              ? ImageIcon
              : SlidersHorizontal;

  return (
    <span className="inline-flex h-[18px] max-w-[110px] items-center gap-[3px] rounded-[4px] bg-white/[0.06] px-[5px] text-[10px] font-medium leading-none text-neutral-400 ring-1 ring-white/[0.04]">
      <Icon className="h-[11px] w-[11px] shrink-0" />
      <span className="truncate">{setting.label}</span>
    </span>
  );
}

const recommendedGradientFor = (index: number) => {
  const gradients = [
    "bg-[radial-gradient(circle_at_20%_15%,rgba(248,255,102,.82),transparent_32%),linear-gradient(135deg,#1a1a1a,#9fb800_52%,#111113)]",
    "bg-[radial-gradient(circle_at_55%_20%,rgba(244,255,0,.86),transparent_28%),linear-gradient(135deg,#202326,#d7e600_50%,#17191b)]",
    "bg-[radial-gradient(circle_at_70%_22%,rgba(255,255,255,.72),transparent_28%),linear-gradient(135deg,#111113,#9fb800_48%,#111113)]",
  ];
  return gradients[index % gradients.length];
};
