import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Plus, Trash2, ImageIcon, VideoIcon, Volume2,
  Ratio, Timer, Sparkles, Settings2, ChevronDown, Move, ImagePlus, Camera, X, Loader2,
} from "lucide-react";
import type { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { MODEL_API_MAP, KLING_NODE_DEFS } from "./FlowNode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

/* ─── Types ─── */

interface NodeConfigPanelProps {
  node: Node;
  onUpdate: (updates: Record<string, unknown>) => void;
}

type NodeConfig = Record<string, unknown>;

const getConfig = (node: Node): NodeConfig =>
  ((node.data as Record<string, unknown>)?.config as NodeConfig) ?? {};

const updateConfig = (
  node: Node,
  onUpdate: (u: Record<string, unknown>) => void,
  patch: Record<string, unknown>
) => {
  const existing = getConfig(node);
  onUpdate({ config: { ...existing, ...patch } });
};

/* ─── Shared Styles ─── */

const labelCls = "text-[11px] font-medium text-white/50 uppercase tracking-wider";
const inputCls = "h-8 text-xs bg-[#1c1c2e] border-[#2a2a40] text-white/80";
const textareaCls = "text-xs bg-[#1c1c2e] border-[#2a2a40] text-white/80 min-h-[80px] resize-none";

/* ─── Compact Chip Select ─── */
const ChipSelect = ({
  value,
  onValueChange,
  options,
  icon: Icon,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: typeof Sparkles;
}) => (
  <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger className="h-7 px-2 text-[10px] bg-white/[0.04] border-white/[0.08] text-white/60 rounded-lg gap-1 min-w-0 w-auto hover:bg-white/[0.08] transition-colors">
      {Icon && <Icon className="w-3 h-3 text-white/40 shrink-0" />}
      <SelectValue />
      <ChevronDown className="w-2.5 h-2.5 text-white/30 shrink-0" />
    </SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/* ─── Quantity Chip ─── */
const QuantityChip = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] overflow-hidden">
    <button
      className="px-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.06] h-full transition-colors text-sm"
      onClick={() => onChange(Math.max(1, value - 1))}
    >−</button>
    <span className="px-1.5 text-[10px] text-white/60 font-medium tabular-nums">×{value}</span>
    <button
      className="px-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.06] h-full transition-colors text-sm"
      onClick={() => onChange(Math.min(4, value + 1))}
    >+</button>
  </div>
);

/* ─── Image Generator Config ─── */
const ImageGeneratorConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { t } = useLanguage();
  const cfg = getConfig(node);

  const models = Object.keys(MODEL_API_MAP["ai/image_gen"]).map((k) => ({ value: k, label: k }));
  const defaultModel = "Banana Pro";

  return (
    <div className="space-y-3">
      <div className={cn(
        "rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden",
        "flex items-center justify-center aspect-square"
      )}>
        <div className="flex flex-col items-center gap-2 text-white/20">
          <ImageIcon className="w-8 h-8" />
          <span className="text-[10px]">Preview</span>
        </div>
      </div>

      <Textarea
        value={(cfg.prompt as string) ?? ""}
        onChange={(e) => updateConfig(node, onUpdate, { prompt: e.target.value })}
        className="text-xs bg-transparent border-white/[0.06] text-white/70 min-h-[60px] resize-none placeholder:text-white/25 focus-visible:ring-white/10"
        placeholder={t("nodePromptPlaceholder")}
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        <QuantityChip
          value={(cfg.quantity as number) ?? 1}
          onChange={(v) => updateConfig(node, onUpdate, { quantity: v })}
        />
        <ChipSelect
          value={(cfg.model as string) ?? defaultModel}
          onValueChange={(v) => updateConfig(node, onUpdate, { model: v })}
          options={models}
          icon={Sparkles}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] text-white/30">{t("nodeNegPromptLabel")}</label>
        <Input
          value={(cfg.negative_prompt as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { negative_prompt: e.target.value })}
          className="h-7 text-[11px] bg-transparent border-white/[0.06] text-white/60 placeholder:text-white/20"
          placeholder={t("nodeNegPromptPlaceholder")}
        />
      </div>
    </div>
  );
};

/* ─── Kling Node Config (shared for all 3 Kling nodes) ─── */
const KlingNodeConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { t } = useLanguage();
  const cfg = getConfig(node);
  const nodeType = (node.data as Record<string, unknown>)?.nodeType as string;
  const def = KLING_NODE_DEFS[nodeType];
  if (!def) return null;

  return (
    <div className="space-y-3">
      {/* Model info */}
      <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 p-2.5">
        <p className="text-[10px] text-violet-300/70 font-medium">{def.title}</p>
        <p className="text-[9px] text-white/30 mt-0.5 font-mono">API: {def.apiModel} / {def.apiMode}</p>
      </div>

      {/* All params from definition */}
      {def.params.map((param) => {
        if (param.type === "textarea") {
          return (
            <div key={param.key} className="space-y-1.5">
              <label className={labelCls}>{param.label}</label>
              <Textarea
                value={(cfg[param.key] as string) ?? (param.default as string) ?? ""}
                onChange={(e) => updateConfig(node, onUpdate, { [param.key]: e.target.value })}
                className="text-xs bg-transparent border-white/[0.06] text-white/70 min-h-[60px] resize-none placeholder:text-white/25 focus-visible:ring-white/10"
                placeholder={param.key === "prompt" ? "Describe the video content..." : "Elements to avoid..."}
              />
            </div>
          );
        }

        if (param.type === "stepper") {
          const val = (cfg[param.key] as number) ?? (param.default as number) ?? 0.5;
          return (
            <div key={param.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={labelCls}>{param.label}</label>
                <span className="text-[10px] text-white/50 font-mono tabular-nums">{val}</span>
              </div>
              <Slider
                value={[val]}
                onValueChange={([v]) => updateConfig(node, onUpdate, { [param.key]: +v.toFixed(2) })}
                min={param.min ?? 0}
                max={param.max ?? 1}
                step={param.step ?? 0.1}
                className="w-full"
              />
            </div>
          );
        }

        if (param.type === "selector" && param.options) {
          return (
            <div key={param.key} className="space-y-1.5">
              <label className={labelCls}>{param.label}</label>
              <Select
                value={(cfg[param.key] as string) ?? (param.default as string) ?? param.options[0]}
                onValueChange={(v) => updateConfig(node, onUpdate, { [param.key]: v })}
              >
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {param.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return null;
      })}

      {/* Camera Control config for camera node */}
      {nodeType === "ai/kling_2_6_camera" && (
        <>
          <Separator className="bg-[#2a2a40]" />
          <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">Camera Control</p>
          <div className="space-y-1.5">
            <label className={labelCls}>Camera Type</label>
            <Select
              value={(cfg.camera_type as string) ?? "simple"}
              onValueChange={(v) => updateConfig(node, onUpdate, { camera_type: v })}
            >
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">Simple (Custom)</SelectItem>
                <SelectItem value="down_back">Down + Back</SelectItem>
                <SelectItem value="forward_up">Forward + Up</SelectItem>
                <SelectItem value="right_turn_forward">Right Turn Forward</SelectItem>
                <SelectItem value="left_turn_forward">Left Turn Forward</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(cfg.camera_type as string) === "simple" || !(cfg.camera_type as string) ? (
            <div className="space-y-2">
              {[
                { key: "camera_pan", label: "Pan (left/right)", min: -10, max: 10 },
                { key: "camera_tilt", label: "Tilt (up/down)", min: -10, max: 10 },
                { key: "camera_zoom", label: "Zoom (in/out)", min: -10, max: 10 },
                { key: "camera_roll", label: "Roll", min: -10, max: 10 },
              ].map(({ key, label, min, max }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/30">{label}</label>
                    <span className="text-[10px] text-white/50 font-mono tabular-nums">{(cfg[key] as number) ?? 0}</span>
                  </div>
                  <Slider
                    value={[(cfg[key] as number) ?? 0]}
                    onValueChange={([v]) => updateConfig(node, onUpdate, { [key]: v })}
                    min={min}
                    max={max}
                    step={1}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <p className="text-[9px] text-white/20">
            Camera control is supported with Kling v1 model. Duration fixed at 5s in pro mode.
          </p>
        </>
      )}

      {/* Connection hints */}
      <Separator className="bg-[#2a2a40]" />
      <div className="space-y-1">
        <p className="text-[10px] text-white/30 font-medium">{t("nodeInputHandles")}</p>
        {def.inputs.map((inp) => (
          <p key={inp.id} className="text-[9px] text-white/20 font-mono">
            • {inp.label}{": " + t("nodeConnectUpstream")}
          </p>
        ))}
      </div>
    </div>
  );
};

/* ─── Per-Type Config Forms ─── */

const ReferenceImageUploader = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const cfg = getConfig(node);
  const urls = (cfg.example_image_urls as string[]) ?? [];
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !user) return;
    const remaining = 3 - urls.length;
    if (remaining <= 0) { toast.error("Maximum 3 reference images"); return; }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    const newUrls = [...urls];
    for (const file of toUpload) {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("flow-assets").upload(path, file, { contentType: file.type });
      if (error) { toast.error(`Upload failed: ${file.name}`); continue; }
      const { data: { publicUrl } } = supabase.storage.from("flow-assets").getPublicUrl(path);
      newUrls.push(publicUrl);
    }
    updateConfig(node, onUpdate, { example_image_urls: newUrls });
    setUploading(false);
  }, [user, urls, node, onUpdate]);

  const removeUrl = useCallback((index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    updateConfig(node, onUpdate, { example_image_urls: newUrls });
  }, [urls, node, onUpdate]);

  return (
    <div className="space-y-2 mt-1">
      <Separator className="bg-white/[0.06]" />
      <label className={labelCls}>Reference Images (Max 3)</label>
      <p className="text-[9px] text-white/25">{t("nodeExampleImages")}</p>

      {urls.length > 0 && (
        <div className="flex gap-1.5">
          {urls.map((url, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/[0.08] group/thumb">
              <img src={url} alt={`ref ${i + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeUrl(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white/80 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {urls.length < 3 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={uploading}
          className="text-[10px] text-white/40 hover:text-white/60 gap-1 w-full border border-dashed border-white/[0.08] hover:border-white/[0.15]"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
          {uploading ? "Uploading..." : `Add Image (${urls.length}/3)`}
        </Button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
};

const InputImageConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Field Label</label>
        <Input
          value={(cfg.field_label as string) ?? "Product Photo"}
          onChange={(e) => updateConfig(node, onUpdate, { field_label: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>Required</label>
        <Switch
          checked={(cfg.is_required as boolean) ?? true}
          onCheckedChange={(v) => updateConfig(node, onUpdate, { is_required: v })}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Accepted Types</label>
        <Input
          value={(cfg.accept as string) ?? "image/*"}
          onChange={(e) => updateConfig(node, onUpdate, { accept: e.target.value })}
          className={inputCls}
          placeholder="image/*, .png, .jpg"
        />
      </div>
      <ReferenceImageUploader node={node} onUpdate={onUpdate} />
    </div>
  );
};

const InputVideoConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Field Label</label>
        <Input
          value={(cfg.field_label as string) ?? "Video File"}
          onChange={(e) => updateConfig(node, onUpdate, { field_label: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>Required</label>
        <Switch
          checked={(cfg.is_required as boolean) ?? true}
          onCheckedChange={(v) => updateConfig(node, onUpdate, { is_required: v })}
        />
      </div>
      <ReferenceImageUploader node={node} onUpdate={onUpdate} />
    </div>
  );
};

const InputTextConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Field Label</label>
        <Input
          value={(cfg.field_label as string) ?? "Description"}
          onChange={(e) => updateConfig(node, onUpdate, { field_label: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Placeholder</label>
        <Input
          value={(cfg.placeholder as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { placeholder: e.target.value })}
          className={inputCls}
          placeholder="e.g. Enter product name..."
        />
      </div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>Required</label>
        <Switch
          checked={(cfg.is_required as boolean) ?? true}
          onCheckedChange={(v) => updateConfig(node, onUpdate, { is_required: v })}
        />
      </div>
    </div>
  );
};

const InputSelectConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const cfg = getConfig(node);
  const options = (cfg.options as string[]) ?? ["Option 1", "Option 2"];

  const setOptions = (newOpts: string[]) =>
    updateConfig(node, onUpdate, { options: newOpts });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Field Label</label>
        <Input
          value={(cfg.field_label as string) ?? "Select Option"}
          onChange={(e) => updateConfig(node, onUpdate, { field_label: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Options</label>
        {options.map((opt, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              className={inputCls + " flex-1"}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-400/50 hover:text-red-400"
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] text-white/40 hover:text-white/60 gap-1"
          onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
        >
          <Plus className="w-3 h-3" /> Add Option
        </Button>
      </div>
    </div>
  );
};

const AiVoiceGenConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { t } = useLanguage();
  const cfg = getConfig(node);
  const voices = Object.keys(MODEL_API_MAP["ai/voice_gen"]);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Text / Script</label>
        <Textarea
          value={(cfg.text as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { text: e.target.value })}
          className={textareaCls}
          placeholder={t("nodeTtsPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Voice</label>
        <Select
          value={(cfg.model as string) ?? (cfg.voice as string) ?? "Kore"}
          onValueChange={(v) => updateConfig(node, onUpdate, { model: v })}
        >
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            {voices.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const AiTextGenConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { t } = useLanguage();
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>System Prompt</label>
        <Textarea
          value={(cfg.system_prompt as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { system_prompt: e.target.value })}
          className={textareaCls}
          placeholder={t("nodeSystemPromptPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>User Prompt Template</label>
        <Textarea
          value={(cfg.prompt as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { prompt: e.target.value })}
          className={textareaCls}
          placeholder={t("nodeUserPromptPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Model</label>
        <Select
          value={(cfg.model as string) ?? "google/gemini-2.5-flash"}
          onValueChange={(v) => updateConfig(node, onUpdate, { model: v })}
        >
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
            <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
            <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const PromptBuilderConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const { t } = useLanguage();
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Prompt Template</label>
        <Textarea
          value={(cfg.template as string) ?? ""}
          onChange={(e) => updateConfig(node, onUpdate, { template: e.target.value })}
          className={textareaCls + " min-h-[120px]"}
          placeholder={t("nodeTemplatePlaceholder")}
        />
        <p className="text-[9px] text-white/30">
          {t("nodeTemplateHint")}
        </p>
      </div>
    </div>
  );
};

const OutputConfig = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const cfg = getConfig(node);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Output Label</label>
        <Input
          value={(cfg.output_label as string) ?? "Final Output"}
          onChange={(e) => updateConfig(node, onUpdate, { output_label: e.target.value })}
          className={inputCls}
        />
      </div>
      <p className="text-[9px] text-white/30">
        This node receives the final result from connected upstream nodes.
      </p>
    </div>
  );
};

/* ─── Registry ─── */

const CONFIG_MAP: Record<string, React.FC<NodeConfigPanelProps>> = {
  "input/image_upload": InputImageConfig,
  "input/video_upload": InputVideoConfig,
  "input/text_input": InputTextConfig,
  "input/select": InputSelectConfig,
  "ai/image_gen": ImageGeneratorConfig,
  "ai/kling_2_6_i2v": KlingNodeConfig,
  "ai/kling_2_6_camera": KlingNodeConfig,
  "ai/kling_3_0_i2v": KlingNodeConfig,
  "ai/voice_gen": AiVoiceGenConfig,
  "ai/text_gen": AiTextGenConfig,
  "ai/bg_remove": OutputConfig,
  "ai/upscale": OutputConfig,
  "transform/video_concat": OutputConfig,
  "transform/audio_mix": OutputConfig,
  "transform/video_audio_merge": OutputConfig,
  "transform/prompt_builder": PromptBuilderConfig,
  "output/image": OutputConfig,
  "output/video": OutputConfig,
  "output/audio": OutputConfig,
};

/* ─── Main Export ─── */

export const NodeConfigPanel = ({ node, onUpdate }: NodeConfigPanelProps) => {
  const nodeType = (node.data as Record<string, unknown>)?.nodeType as string;
  const ConfigComponent = CONFIG_MAP[nodeType];

  if (!ConfigComponent) {
    return (
      <div className="space-y-2">
        <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400">
          No config available for {nodeType}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Separator className="bg-[#2a2a40]" />
      <p className="text-[11px] font-medium text-white/50 uppercase tracking-wider">Configuration</p>
      <ConfigComponent node={node} onUpdate={onUpdate} />
    </div>
  );
};
