import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, Upload, X, Plus, Package, Image as ImageIcon, Send, Play, Workflow, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBundle, useUpdateBundle, useSetBundleFlows } from "@/hooks/useBundles";
import { useFlows } from "@/hooks/useFlows";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  draft: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  submitted: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  in_review: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  published: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  rejected: "text-red-400 bg-red-500/10 border-red-500/30",
};

const BundleEditor = () => {
  const { bundleId } = useParams<{ bundleId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const { data: bundleData, isLoading } = useBundle(bundleId);
  const { data: myFlows } = useFlows();
  const updateBundle = useUpdateBundle(bundleId);
  const setBundleFlows = useSetBundleFlows(bundleId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailType, setThumbnailType] = useState<"image" | "video">("image");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);

  useEffect(() => {
    if (!bundleData) return;
    const b = bundleData.bundle;
    setName(b.name);
    setDescription(b.description ?? "");
    setThumbnailUrl(b.thumbnail_url ?? "");
    setThumbnailType(b.thumbnail_type);
    setKeywords(b.keywords ?? []);
    setSelectedFlowIds(bundleData.flowIds);
  }, [bundleData]);

  const addKeyword = (raw: string) => {
    const word = raw.trim().toLowerCase().replace(/,/g, "");
    if (!word || word.length > 40) return;
    if (keywords.includes(word)) return;
    if (keywords.length >= 10) {
      toast.error("Maximum 10 keywords");
      return;
    }
    setKeywords([...keywords, word]);
    setKeywordInput("");
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    if (!isImage && !isVideo) {
      toast.error(`${file.name}: ${t("fsOnlyImageOrVideo")}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`${file.name}: ${t("fsMaxFileSize")}`);
      return;
    }
    setIsUploadingThumb(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/bundle-thumb-${bundleId}.${ext}`;
      const { error } = await supabase.storage
        .from("preset-thumbnails")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("preset-thumbnails").getPublicUrl(path);
      setThumbnailUrl(`${data.publicUrl}?t=${Date.now()}`);
      setThumbnailType(isVideo ? "video" : "image");
      toast.success("Thumbnail uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploadingThumb(false);
    }
  };

  const toggleFlow = (flowId: string) => {
    setSelectedFlowIds((prev) =>
      prev.includes(flowId) ? prev.filter((id) => id !== flowId) : [...prev, flowId]
    );
  };

  const moveFlow = (flowId: string, dir: -1 | 1) => {
    setSelectedFlowIds((prev) => {
      const idx = prev.indexOf(flowId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSave = async (publishAfter = false) => {
    if (!name.trim()) {
      toast.error("Bundle name is required");
      return;
    }
    if (publishAfter && selectedFlowIds.length === 0) {
      toast.error("Add at least one flow before publishing");
      return;
    }
    setIsSaving(true);
    try {
      await updateBundle.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        thumbnail_url: thumbnailUrl || null,
        thumbnail_type: thumbnailType,
        keywords,
        ...(publishAfter ? { status: "published" as const } : {}),
      });
      await setBundleFlows.mutateAsync(selectedFlowIds);
      toast.success(publishAfter ? "Bundle published!" : "Bundle saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!bundleData) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Bundle not found</p>
        <Button variant="outline" onClick={() => navigate("/creator/bundles")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Bundle Studio
        </Button>
      </div>
    );
  }

  const status = bundleData.bundle.status;
  const ownedFlows = myFlows ?? [];
  const selectedFlows = selectedFlowIds
    .map((id) => ownedFlows.find((f) => f.id === id))
    .filter(Boolean);

  return (
    <div className="max-w-5xl mx-auto space-y-7 pb-16">
      <input ref={thumbInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={handleThumbnailUpload} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/creator/bundles")} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{name || "Untitled Bundle"}</h1>
              <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[status] ?? STATUS_TONE.draft)}>
                {status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bundle metadata, thumbnail, and flow selection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleSave(false)} disabled={isSaving} variant="outline" className="gap-1.5">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </Button>
          {status === "published" ? (
            <>
              <Button
                onClick={async () => {
                  if (!confirm("Unpublish this bundle? It will no longer be visible to users.")) return;
                  setIsSaving(true);
                  try {
                    await updateBundle.mutateAsync({ status: "draft" });
                    toast.success("Bundle unpublished");
                  } catch (err: any) {
                    toast.error(err.message ?? "Failed to unpublish");
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
                variant="outline"
                className="gap-1.5"
              >
                <EyeOff className="w-4 h-4" /> Unpublish
              </Button>
              <Button onClick={() => navigate(`/play/bundle/${bundleId}`)} variant="gradient" className="gap-1.5">
                <Play className="w-4 h-4" /> Open
              </Button>
            </>
          ) : (
            <Button onClick={() => handleSave(true)} disabled={isSaving} variant="gradient" className="gap-1.5">
              <Send className="w-4 h-4" /> Publish
            </Button>
          )}
        </div>
      </motion.div>

      <Separator className="border-border/40" />

      {/* Basic Info */}
      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">Basic Information</h2>
        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
          {/* Thumbnail */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Bundle Thumbnail</Label>
            <button
              type="button"
              onClick={() => thumbInputRef.current?.click()}
              disabled={isUploadingThumb}
              className="relative w-full aspect-video rounded-xl border border-dashed border-border/60 hover:border-primary/50 bg-muted/20 overflow-hidden transition-colors group"
            >
              {thumbnailUrl ? (
                thumbnailType === "video" ? (
                  <video src={thumbnailUrl} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1.5">
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-xs">Upload image or video</span>
                </div>
              )}
              {isUploadingThumb && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
              {thumbnailUrl && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Upload className="w-5 h-5 text-white" />
                </div>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground/70">Image or video, max 10MB. 16:9 recommended.</p>
          </div>

          {/* Name + Description + Keywords */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Food Content Pipeline" className="bg-muted/20 border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this bundle helps users accomplish..."
                rows={3}
                className="bg-muted/20 border-border/50 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Keywords <span className="text-muted-foreground/50">({keywords.length}/10)</span>
              </Label>
              <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-h-[42px]">
                {keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 text-xs font-medium border border-rose-500/20">
                    {kw}
                    <button type="button" onClick={() => setKeywords(keywords.filter((k) => k !== kw))} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {keywords.length < 10 && (
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addKeyword(keywordInput);
                      }
                    }}
                    onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
                    placeholder="food, packshot, multi-angle..."
                    className="flex-1 min-w-[140px] bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground/40"
                  />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70">Press Enter or comma. Used for search.</p>
            </div>
          </div>
        </div>
      </section>

      <Separator className="border-border/40" />

      {/* Flow Selection */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">Flows in this Bundle</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Select your own flows to include. Order matters — users see them in this sequence.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {selectedFlowIds.length} selected
          </Badge>
        </div>

        {/* Selected (with reorder) */}
        {selectedFlows.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-300/80">Selected (drag order)</p>
            {selectedFlows.map((f, i) => (
              <div
                key={f!.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-background/40 border border-border/30"
              >
                <span className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                {f!.thumbnail_url ? (
                  <img src={f!.thumbnail_url} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-muted/30 shrink-0 flex items-center justify-center">
                    <Workflow className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f!.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {f!.selling_price} CR · {f!.status}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={i === 0} onClick={() => moveFlow(f!.id, -1)}>
                  ↑
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={i === selectedFlows.length - 1} onClick={() => moveFlow(f!.id, 1)}>
                  ↓
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => toggleFlow(f!.id)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* All my flows */}
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Your Flows</p>
          {ownedFlows.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border/40 rounded-xl">
              <Workflow className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No flows yet — create one in Flow Studio first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {ownedFlows.map((f) => {
                const isSelected = selectedFlowIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFlow(f.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left",
                      isSelected
                        ? "bg-rose-500/10 border-rose-500/40"
                        : "bg-muted/10 border-border/40 hover:border-primary/40"
                    )}
                  >
                    {f.thumbnail_url ? (
                      <img src={f.thumbnail_url} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-muted/30 flex items-center justify-center shrink-0">
                        <Workflow className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{f.name}</p>
                      <p className="text-[10px] text-muted-foreground">{f.selling_price} CR · {f.status}</p>
                    </div>
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                        isSelected ? "bg-rose-500 border-rose-500" : "border-border/60"
                      )}
                    >
                      {isSelected && <Plus className="w-3 h-3 text-white rotate-45" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BundleEditor;
