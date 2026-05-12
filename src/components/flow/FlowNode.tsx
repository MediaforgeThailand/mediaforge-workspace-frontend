import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import {
  ImagePlus, Video, Type, ListFilter, Sparkles, Film, Mic,
  MessageSquare, Scissors, Maximize, Combine, Music, Clapperboard,
  FileText, Image, Volume2, Lock, Settings, ChevronDown,
  Plus, Minus, Move, Camera, Coins, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import GenerateIcon from "@/components/GenerateIcon";

/* ─── Icon map ─── */
const ICON_MAP: Record<string, typeof Sparkles> = {
  "input/image_upload": ImagePlus,
  "input/video_upload": Video,
  "input/text_input": Type,
  "input/select": ListFilter,
  "ai/image_gen": Sparkles,
  "ai/kling_2_6_i2v": Film,
  "ai/kling_2_6_camera": Camera,
  "ai/kling_3_0_i2v": Film,
  "ai/voice_gen": Mic,
  "ai/text_gen": MessageSquare,
  "ai/chat_ai": MessageSquare,
  "ai/bg_remove": Scissors,
  "ai/upscale": Maximize,
  "transform/video_concat": Combine,
  "transform/audio_mix": Music,
  "transform/video_audio_merge": Clapperboard,
  "transform/prompt_builder": FileText,
  "output/image": Image,
  "output/video": Video,
  "output/audio": Volume2,
};

const FUNCTIONAL_NODES = new Set([
  "input/image_upload", "input/video_upload", "input/text_input", "input/select",
  "ai/image_gen", "ai/kling_2_6_i2v", "ai/kling_2_6_camera", "ai/kling_3_0_i2v",
  "ai/voice_gen", "ai/chat_ai",
  "transform/prompt_builder",
  "output/image", "output/video", "output/audio",
]);

/* ─── Model → API ID mapping ─── */
const MODEL_API_MAP: Record<string, Record<string, string>> = {
  "ai/image_gen": {
    "Banana Pro": "nano-banana-pro",
    "Banana 2": "nano-banana-2",
  },
  "ai/voice_gen": {
    "Kore": "Kore",
    "Puck": "Puck",
    "Charon": "Charon",
    "Fenrir": "Fenrir",
    "Aoede": "Aoede",
    "Leda": "Leda",
    "Orus": "Orus",
    "Zephyr": "Zephyr",
  },
};

/* ─── Kling node definitions ─── */
interface KlingNodeDef {
  title: string;
  apiModel: string;
  apiMode: string;
  inputs: { id: string; label: string; color: string }[];
  outputs: { id: string; label: string }[];
  params: {
    key: string;
    label: string;
    type: "textarea" | "stepper" | "selector";
    options?: string[];
    default?: string | number;
    min?: number;
    max?: number;
    step?: number;
  }[];
}

const KLING_NODE_DEFS: Record<string, KlingNodeDef> = {
  "ai/kling_2_6_i2v": {
    title: "Kling 2.6 Image to Video",
    apiModel: "kling-2-6-pro",
    apiMode: "pro",
    inputs: [
      { id: "start_frame", label: "start_frame", color: "blue" },
      { id: "end_frame", label: "end_frame", color: "gray" },
    ],
    outputs: [
      { id: "video", label: "VIDEO" },
    ],
    params: [
      { key: "prompt", label: "prompt", type: "textarea", default: "" },
      { key: "negative_prompt", label: "negative_prompt", type: "textarea", default: "" },
      { key: "cfg_scale", label: "cfg_scale", type: "stepper", default: 0.5, min: 0, max: 1, step: 0.1 },
      { key: "aspect_ratio", label: "aspect_ratio", type: "selector", options: ["16:9", "9:16", "1:1"], default: "16:9" },
      { key: "duration", label: "duration", type: "selector", options: ["5", "10"], default: "5" },
    ],
  },
  "ai/kling_2_6_camera": {
    title: "Kling 2.6 I2V (Camera Control)",
    apiModel: "kling-v1-std",
    apiMode: "pro",
    inputs: [
      { id: "start_frame", label: "start_frame", color: "blue" },
      { id: "camera_control", label: "camera_control", color: "gray" },
    ],
    outputs: [
      { id: "video", label: "VIDEO" },
    ],
    params: [
      { key: "prompt", label: "prompt", type: "textarea", default: "" },
      { key: "negative_prompt", label: "negative_prompt", type: "textarea", default: "" },
      { key: "cfg_scale", label: "cfg_scale", type: "stepper", default: 0.5, min: 0, max: 1, step: 0.1 },
      { key: "aspect_ratio", label: "aspect_ratio", type: "selector", options: ["16:9", "9:16", "1:1"], default: "16:9" },
    ],
  },
  "ai/kling_3_0_i2v": {
    title: "Kling 3.0 Image to Video",
    apiModel: "kling-v3-pro",
    apiMode: "pro",
    inputs: [
      { id: "start_frame", label: "start_frame", color: "blue" },
      { id: "end_frame", label: "end_frame", color: "gray" },
    ],
    outputs: [
      { id: "video", label: "VIDEO" },
    ],
    params: [
      { key: "prompt", label: "prompt", type: "textarea", default: "" },
      { key: "negative_prompt", label: "negative_prompt", type: "textarea", default: "" },
      { key: "cfg_scale", label: "cfg_scale", type: "stepper", default: 0.5, min: 0, max: 1, step: 0.1 },
      { key: "aspect_ratio", label: "aspect_ratio", type: "selector", options: ["16:9", "9:16", "1:1"], default: "16:9" },
      { key: "duration", label: "duration", type: "selector", options: ["5", "10"], default: "5" },
    ],
  },
};

export { MODEL_API_MAP, KLING_NODE_DEFS };

const CATEGORY_CONFIG: Record<string, { label: string; border: string; glow: string }> = {
  input: { label: "INPUT", border: "border-blue-500/25", glow: "shadow-[0_0_20px_-4px_rgba(59,130,246,0.15)]" },
  ai: { label: "AI", border: "border-yellow-500/25", glow: "shadow-[0_0_20px_-4px_rgba(238,255,0,0.15)]" },
  transform: { label: "TRANSFORM", border: "border-amber-500/25", glow: "shadow-[0_0_20px_-4px_rgba(245,158,11,0.15)]" },
  output: { label: "OUTPUT", border: "border-emerald-500/25", glow: "shadow-[0_0_20px_-4px_rgba(16,185,129,0.15)]" },
};

/* ─── Options per node type (non-Kling AI nodes) ─── */
interface NodeOptions {
  models: string[];
  defaultModel: string;
  aspects: string[];
  defaultAspect: string;
  maxQuantity: number;
}

const NODE_OPTIONS: Record<string, NodeOptions> = {
  "ai/image_gen": {
    models: Object.keys(MODEL_API_MAP["ai/image_gen"]),
    defaultModel: "Banana Pro",
    aspects: [],
    defaultAspect: "",
    maxQuantity: 4,
  },
  "ai/voice_gen": {
    models: Object.keys(MODEL_API_MAP["ai/voice_gen"]),
    defaultModel: "Kore",
    aspects: [],
    defaultAspect: "",
    maxQuantity: 1,
  },
  "ai/text_gen": {
    models: ["GPT-5", "Gemini 2.5 Flash"],
    defaultModel: "GPT-5",
    aspects: [],
    defaultAspect: "",
    maxQuantity: 1,
  },
  "ai/chat_ai": {
    models: ["Gemini 2.5 Flash", "Gemini 2.5 Pro", "GPT-5 Mini", "GPT-5"],
    defaultModel: "Gemini 2.5 Flash",
    aspects: [],
    defaultAspect: "",
    maxQuantity: 1,
  },
};

/* ─── Dropdown Chip ─── */
const DropdownChip = ({ value, options, onChange, prefix }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  prefix?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors",
          "border border-white/[0.06] hover:border-white/15",
          "bg-white/[0.08] text-white/70"
        )}
      >
        {prefix}
        {value}
        <ChevronDown className={cn("w-2.5 h-2.5 opacity-50 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[120px] max-h-[200px] overflow-y-auto rounded-lg border border-white/10 bg-[hsl(220_15%_12%)] shadow-xl shadow-black/40 py-1 backdrop-blur-xl">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={(e) => { e.stopPropagation(); onChange(opt); setOpen(false); }}
              className={cn(
                "block w-full text-left px-3 py-1 text-[10px] transition-colors",
                opt === value ? "text-white/90 bg-white/[0.08]" : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Quantity Chip ─── */
const QuantityChip = ({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-0 rounded-md border border-white/[0.06] bg-white/[0.08] overflow-hidden">
    <button
      onClick={(e) => { e.stopPropagation(); onChange(Math.max(1, value - 1)); }}
      className="px-1 py-0.5 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
    >
      <Minus className="w-2.5 h-2.5" />
    </button>
    <span className="px-1 text-[10px] font-medium text-white/70 min-w-[18px] text-center">×{value}</span>
    <button
      onClick={(e) => { e.stopPropagation(); onChange(Math.min(max, value + 1)); }}
      className="px-1 py-0.5 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
    >
      <Plus className="w-2.5 h-2.5" />
    </button>
  </div>
);

/* ─── Cost Badge ─── */
const CostBadge = ({ cost }: { cost: number | null }) => {
  if (cost === null) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20">
        <AlertTriangle className="w-2.5 h-2.5 text-red-400/80" />
        <span className="text-[9px] font-semibold text-red-400/80">N/A</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
      <Coins className="w-2.5 h-2.5 text-amber-400/70" />
      <span className="text-[9px] font-semibold text-amber-300/90 tabular-nums">{cost}</span>
    </div>
  );
};

/* ─── Handle dot ─── */
const HandleDot = ({ type, position, id, label, style }: {
  type: "source" | "target"; position: Position;
  id?: string; label?: string; style?: React.CSSProperties;
}) => (
  <div className="relative" style={style}>
    <Handle
      type={type}
      position={position}
      id={id}
      className={cn(
        "!w-3 !h-3 !rounded-full !border-[2px] !transition-all !duration-200",
        "!bg-[hsl(220_15%_13%)]",
        type === "source"
          ? "!border-emerald-400/70 hover:!border-emerald-400 hover:!shadow-[0_0_8px_rgba(52,211,153,0.5)]"
          : "!border-blue-400/70 hover:!border-blue-400 hover:!shadow-[0_0_8px_rgba(96,165,250,0.5)]",
        position === Position.Left ? "!-left-1.5" : "!-right-1.5"
      )}
    />
    {label && (
      <span className={cn(
        "absolute top-1/2 -translate-y-1/2 text-[8px] font-medium whitespace-nowrap pointer-events-none",
        position === Position.Left ? "left-3" : "right-3",
        "text-white/25"
      )}>
        {label}
      </span>
    )}
  </div>
);

/* ════════════════════════════════════════════
   Compact Node — for input / output / transform
   ════════════════════════════════════════════ */
const CompactNode = ({ nodeType, label, category, isInput, isOutput, isMockup, selected }: {
  nodeType: string; label: string; category: string;
  isInput: boolean; isOutput: boolean; isMockup: boolean; selected: boolean;
}) => {
  const { t } = useLanguage();
  const Icon = ICON_MAP[nodeType] || Sparkles;
  const cat = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.input;

  return (
    <div className={cn(
      "group relative w-[220px] rounded-xl border transition-all duration-200",
      "bg-[hsl(220_15%_11%/0.92)] backdrop-blur-xl",
      selected ? "border-white/20 " + cat.glow : cat.border,
      isMockup && "opacity-40 pointer-events-none"
    )}>
      <div className="absolute inset-[1px] rounded-[11px] border border-white/[0.04] pointer-events-none" />
      <div className="relative px-3.5 pt-2.5 pb-2">
        <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-white/20 leading-none">
          {cat.label}
        </span>
        <div className="flex items-center gap-2.5 mt-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06]">
            <Icon className="w-4 h-4 text-white/45" />
          </div>
          <span className="text-[13px] font-medium text-white/85 truncate">{label}</span>
        </div>
        {isMockup && (
          <div className="flex items-center gap-1 mt-1.5 ml-[42px]">
            <Lock className="w-2.5 h-2.5 text-white/15" />
            <span className="text-[9px] text-white/15">{t("comingSoon")}</span>
          </div>
        )}
      </div>
      {!isOutput && (
        <div className="flex justify-end px-3 pb-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.03]">
            <span className="text-[9px] font-medium text-white/25 tracking-wide">OUT</span>
            <div className="w-[5px] h-[5px] rounded-full bg-emerald-400/60" />
          </div>
        </div>
      )}
      {!isInput && <HandleDot type="target" position={Position.Left} />}
      {!isOutput && <HandleDot type="source" position={Position.Right} />}
    </div>
  );
};

/* ════════════════════════════════════════════
   Stepper Chip — for numeric values like cfg_scale
   ════════════════════════════════════════════ */
const StepperChip = ({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center w-full rounded-lg border border-white/[0.08] bg-white/[0.04] overflow-hidden">
    <button
      onClick={(e) => { e.stopPropagation(); onChange(Math.max(min, +(value - step).toFixed(2))); }}
      className="px-2 py-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
    >
      <span className="text-[11px]">◄</span>
    </button>
    <span className="flex-1 text-[11px] font-mono text-white/50 px-2">{label}</span>
    <span className="text-[11px] font-mono text-white/70 px-2 tabular-nums">{value}</span>
    <button
      onClick={(e) => { e.stopPropagation(); onChange(Math.min(max, +(value + step).toFixed(2))); }}
      className="px-2 py-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
    >
      <span className="text-[11px]">►</span>
    </button>
  </div>
);

/* ════════════════════════════════════════════
   Selector Chip — for enum values like aspect_ratio
   ════════════════════════════════════════════ */
const SelectorChip = ({ label, value, options, onChange }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void;
}) => {
  const idx = options.indexOf(value);
  const prev = () => { const i = (idx - 1 + options.length) % options.length; onChange(options[i]); };
  const next = () => { const i = (idx + 1) % options.length; onChange(options[i]); };

  return (
    <div className="flex items-center w-full rounded-lg border border-white/[0.08] bg-white/[0.04] overflow-hidden">
      <button
        onClick={(e) => { e.stopPropagation(); prev(); }}
        className="px-2 py-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
      >
        <span className="text-[11px]">◄</span>
      </button>
      <span className="flex-1 text-[11px] font-mono text-white/50 px-2">{label}</span>
      <span className="text-[11px] font-mono text-white/70 px-2">{value}</span>
      <button
        onClick={(e) => { e.stopPropagation(); next(); }}
        className="px-2 py-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
      >
        <span className="text-[11px]">►</span>
      </button>
    </div>
  );
};

/* ════════════════════════════════════════════
   Kling Node — ComfyUI-style dedicated node
   ════════════════════════════════════════════ */
const KlingNode = ({ id, nodeType, selected, config, nodeCost }: {
  id: string; nodeType: string; selected: boolean; config: Record<string, unknown>; nodeCost: number | null;
}) => {
  const { setNodes } = useReactFlow();
  const def = KLING_NODE_DEFS[nodeType];

  const cat = CATEGORY_CONFIG.ai;

  const updateConfig = useCallback((key: string, value: unknown) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, unknown> || {}), [key]: value } } }
          : n
      )
    );
  }, [id, setNodes]);

  if (!def) return null;

  return (
    <div className={cn(
      "group relative w-[300px] rounded-xl border transition-all duration-200",
      "bg-[hsl(220_12%_13%/0.95)] backdrop-blur-xl",
      selected ? "border-white/20 " + cat.glow : "border-white/[0.08]",
    )}>
      <div className="absolute inset-[1px] rounded-[11px] border border-white/[0.03] pointer-events-none" />

      {/* Title */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-white/[0.06]">
        <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
        <span className="text-[12px] font-medium text-white/80 truncate flex-1">{def.title}</span>
        <CostBadge cost={nodeCost} />
      </div>

      {/* I/O Handles Row */}
      <div className="relative px-3 py-2 border-b border-white/[0.04]">
        <div className="flex justify-between">
          {/* Left: Inputs */}
          <div className="flex flex-col gap-1.5">
            {def.inputs.map((inp) => (
              <div key={inp.id} className="flex items-center gap-1.5">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  inp.color === "blue" ? "bg-blue-400/80" : "bg-white/30"
                )} />
                <span className="text-[10px] font-mono text-white/50">{inp.label}</span>
              </div>
            ))}
          </div>
          {/* Right: Outputs */}
          <div className="flex flex-col gap-1.5 items-end">
            {def.outputs.map((out) => (
              <div key={out.id} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-white/50">{out.label}</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400/60" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parameters */}
      <div className="px-3 py-2 space-y-1.5">
        {def.params.map((param) => {
          if (param.type === "textarea") {
            return (
              <textarea
                key={param.key}
                value={(config?.[param.key] as string) ?? (param.default as string) ?? ""}
                onChange={(e) => updateConfig(param.key, e.target.value)}
                placeholder={param.label}
                rows={2}
                className="w-full bg-black/30 rounded-lg border border-white/[0.06] text-[11px] text-white/70 placeholder:text-white/20 leading-relaxed resize-none focus:outline-none p-2 font-mono"
                onClick={(e) => e.stopPropagation()}
              />
            );
          }
          if (param.type === "stepper") {
            return (
              <StepperChip
                key={param.key}
                label={param.label}
                value={(config?.[param.key] as number) ?? (param.default as number) ?? 0.5}
                min={param.min ?? 0}
                max={param.max ?? 1}
                step={param.step ?? 0.1}
                onChange={(v) => updateConfig(param.key, v)}
              />
            );
          }
          if (param.type === "selector" && param.options) {
            return (
              <SelectorChip
                key={param.key}
                label={param.label}
                value={(config?.[param.key] as string) ?? (param.default as string) ?? param.options[0]}
                options={param.options}
                onChange={(v) => updateConfig(param.key, v)}
              />
            );
          }
          return null;
        })}
      </div>

      {/* Input handles */}
      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-6" style={{ pointerEvents: 'none' }}>
        {def.inputs.map((inp, i) => (
          <HandleDot
            key={inp.id}
            type="target"
            position={Position.Left}
            id={inp.id}
            style={{ pointerEvents: 'auto' }}
          />
        ))}
      </div>

      {/* Output handle */}
      <HandleDot type="source" position={Position.Right} id="video" />
    </div>
  );
};

/* ════════════════════════════════════════════
   Rich Node — for non-Kling AI generation nodes
   ════════════════════════════════════════════ */
const RichNode = ({ id, nodeType, label, category, isMockup, selected, config, nodeCost }: {
  id: string; nodeType: string; label: string; category: string;
  isMockup: boolean; selected: boolean; config: Record<string, unknown>; nodeCost: number | null;
}) => {
  const { t } = useLanguage();
  const { setNodes } = useReactFlow();
  const Icon = ICON_MAP[nodeType] || Sparkles;
  const cat = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.ai;
  const opts = NODE_OPTIONS[nodeType] || NODE_OPTIONS["ai/image_gen"];
  const isVoice = nodeType === "ai/voice_gen";

  const model = (config?.model as string) || opts.defaultModel;
  const aspect = (config?.aspect_ratio as string) || opts.defaultAspect;
  const quantity = (config?.quantity as number) || 1;
  const prompt = (config?.prompt as string) || "";

  const updateConfig = useCallback((key: string, value: unknown) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...(n.data.config as Record<string, unknown> || {}), [key]: value } } }
          : n
      )
    );
  }, [id, setNodes]);

  const promptPlaceholder = isVoice
    ? "Enter text to synthesize..."
    : "Describe the image you want to generate...";

  return (
    <div className={cn(
      "group relative w-[280px] rounded-xl border transition-all duration-200",
      "bg-[hsl(220_15%_11%/0.95)] backdrop-blur-xl",
      selected ? "border-white/20 " + cat.glow : cat.border,
      isMockup && "opacity-40 pointer-events-none"
    )}>
      <div className="absolute inset-[1px] rounded-[11px] border border-white/[0.04] pointer-events-none" />

      <div className="relative">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <Icon className="w-3.5 h-3.5 text-white/50" />
          <span className="text-[12px] font-medium text-white/80 truncate flex-1">{label}</span>
          <CostBadge cost={nodeCost} />
        </div>

        {/* Preview area */}
        <div className="mx-2.5 rounded-lg bg-black/30 border border-white/[0.04] aspect-[4/3] flex items-center justify-center">
          <div className="text-white/[0.06]">
            {isVoice ? <Volume2 className="w-8 h-8" /> : <Image className="w-8 h-8" />}
          </div>
        </div>

        {/* Prompt area */}
        <div className="px-2.5 pt-2 pb-1">
          <textarea
            value={prompt}
            onChange={(e) => updateConfig("prompt", e.target.value)}
            placeholder={promptPlaceholder}
            rows={2}
            className="w-full bg-transparent text-[11px] text-white/70 placeholder:text-white/20 leading-relaxed resize-none focus:outline-none border-none p-0"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-0.5 flex-wrap">
          {/* Quantity */}
          <QuantityChip value={quantity} max={opts.maxQuantity} onChange={(v) => updateConfig("quantity", v)} />

          {/* Model */}
          <DropdownChip value={model} options={opts.models} onChange={(v) => updateConfig("model", v)} />

          {/* Aspect ratio */}
          {opts.aspects.length > 0 && (
            <DropdownChip value={aspect} options={opts.aspects} onChange={(v) => updateConfig("aspect_ratio", v)} />
          )}

          {/* Settings for image */}
          {nodeType === "ai/image_gen" && (
            <button className="w-5 h-5 rounded flex items-center justify-center bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors">
              <Settings className="w-2.5 h-2.5 text-white/30" />
            </button>
          )}

          <div className="flex-1" />

          {/* Generate button */}
          <button className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
            "bg-white/10 hover:bg-white/20"
          )}>
            <GenerateIcon className="h-3 w-3" />
          </button>
        </div>

        {isMockup && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-white/30" />
              <span className="text-[11px] text-white/30 font-medium">{t("comingSoon")}</span>
            </div>
          </div>
        )}
      </div>

      <HandleDot type="target" position={Position.Left} />
      <HandleDot type="source" position={Position.Right} />
    </div>
  );
};

/* ════════════════════════════════════════════
   Main FlowNode
   ════════════════════════════════════════════ */
const FlowNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>;
  const nodeType = (d?.nodeType as string) || "input/text_input";
  const label = (d?.label as string) || "Untitled";
  const config = (d?.config as Record<string, unknown>) || {};
  const category = nodeType.split("/")[0] || "input";
  const isInput = category === "input";
  const isOutput = category === "output";
  const isMockup = !FUNCTIONAL_NODES.has(nodeType);

  const nodeCost: number | null = null;

  // Kling dedicated nodes
  if (KLING_NODE_DEFS[nodeType]) {
    return (
      <KlingNode
        id={id}
        nodeType={nodeType}
        selected={selected ?? false}
        config={config}
        nodeCost={nodeCost}
      />
    );
  }

  // Other AI nodes (image gen, voice, text)
  if (category === "ai") {
    return (
      <RichNode
        id={id}
        nodeType={nodeType}
        label={label}
        category={category}
        isMockup={isMockup}
        selected={selected ?? false}
        config={config}
        nodeCost={nodeCost}
      />
    );
  }

  return (
    <CompactNode
      nodeType={nodeType}
      label={label}
      category={category}
      isInput={isInput}
      isOutput={isOutput}
      isMockup={isMockup}
      selected={selected ?? false}
    />
  );
});

FlowNode.displayName = "FlowNode";
export default FlowNode;
