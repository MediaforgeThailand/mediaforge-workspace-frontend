import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft, Save, Pencil, CheckCircle2, Archive, Play, Loader2,
  Upload, X, Plus, Workflow, Info, Image as ImageIcon, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFlowCategories, useFlowCategoryMappings, type FlowCategory } from "@/hooks/useFlowCategories";
import { generateFlowEmbedding } from "@/lib/hybridSearch";

type StatusLabelKey = "fsStatusDraft" | "fsStatusTesting" | "fsStatusPublished" | "fsStatusArchived";

const STATUS_CONFIG: Record<string, { labelKey: StatusLabelKey; color: string; icon: typeof CheckCircle2 }> = {
  draft: { labelKey: "fsStatusDraft", color: "text-muted-foreground bg-muted/30 border-border/50", icon: Pencil },
  testing: { labelKey: "fsStatusTesting", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: Play },
  published: { labelKey: "fsStatusPublished", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  archived: { labelKey: "fsStatusArchived", color: "text-muted-foreground bg-muted/20 border-border/40", icon: Archive },
};

/* ── Reusable pill-toggle section with descriptions ── */
const CategoryTagSection = ({
  label,
  categories,
  selected,
  onToggle,
}: {
  label: string;
  categories: FlowCategory[];
  selected: string[];
  onToggle: (id: string) => void;
}) => (
  <div className="space-y-2">
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    <div className="flex flex-wrap gap-1.5">
      <TooltipProvider delayDuration={200}>
        {categories.map((cat) => {
          const isSelected = selected.includes(cat.id);
          return (
            <Tooltip key={cat.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggle(cat.id)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-all duration-150 font-medium inline-flex items-center gap-1 glass-border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                      : "bg-muted/10 text-muted-foreground border-border/50 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {cat.name}
                  {cat.description && (
                    <Info className="w-3 h-3 opacity-50" />
                  )}
                </button>
              </TooltipTrigger>
              {cat.description && (
                <TooltipContent side="top" className="max-w-[200px] text-xs">
                  {cat.description}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  </div>
);

/* ── Keyword Chips Input ── */
const KeywordChipsInput = ({
  keywords,
  onChange,
  max = 10,
}: {
  keywords: string[];
  onChange: (kw: string[]) => void;
  max?: number;
}) => {
  const { t } = useLanguage();
  const [input, setInput] = useState("");

  const addKeyword = (raw: string) => {
    const word = raw.trim().toLowerCase().replace(/,/g, "");
    if (!word || word.length > 40) return;
    if (keywords.includes(word)) { toast.error(t("fsKeywordAlreadyAdded")); return; }
    if (keywords.length >= max) { toast.error(t("fsMaxKeywords").replace("{max}", String(max))); return; }
    onChange([...keywords, word]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(input);
    }
    if (e.key === "Backspace" && !input && keywords.length > 0) {
      onChange(keywords.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {t("fsKeywords")} <span className="text-muted-foreground/50">({keywords.length}/{max})</span>
      </Label>
      <p className="text-[11px] text-muted-foreground/70">
        {t("fsKeywordsDesc")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-muted/20 min-h-[42px] focus-within:ring-1 focus-within:ring-primary/30 transition-shadow">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium border border-primary/20"
          >
            {kw}
            <button
              type="button"
              onClick={() => onChange(keywords.filter((k) => k !== kw))}
              className="hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {keywords.length < max && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) addKeyword(input); }}
            placeholder={keywords.length === 0 ? t("fsKeywordsPlaceholder") : t("fsKeywordsAddMore")}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground/40"
          />
        )}
      </div>
    </div>
  );
};

const FlowSettingsPage = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [setupInstructions, setSetupInstructions] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [exampleInputs, setExampleInputs] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [formatTags, setFormatTags] = useState<string[]>([]);
  // New category system
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingThumb, setIsUploadingThumb] = useState(false);
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [isUploadingExample, setIsUploadingExample] = useState(false);
  const exampleInputRef = useRef<HTMLInputElement>(null);

  const { data: categoriesData } = useFlowCategories();
  const { data: existingMappings } = useFlowCategoryMappings(flowId);

  const { data: flow, isLoading } = useQuery({
    queryKey: ["flow-settings", flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flows")
        .select("*")
        .eq("id", flowId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!flowId,
  });

  // Populate form when flow loads
  useEffect(() => {
    if (!flow) return;
    setName(flow.name);
    setDescription(flow.description ?? "");
    const settings = (flow.settings as Record<string, unknown>) ?? {};
    setSetupInstructions((settings.setup_instructions as string) ?? "");
    setThumbnailUrl(flow.thumbnail_url ?? "");
    setPreviewImages((settings.preview_images as string[]) ?? []);
    setExampleInputs((settings.example_inputs as string[]) ?? []);
    setKeywords((flow.keywords as string[]) ?? []);
    setFormatTags((flow.format_tags as string[]) ?? []);
  }, [flow]);

  // Populate category mappings
  useEffect(() => {
    if (existingMappings) {
      setSelectedCategoryIds(existingMappings);
    }
  }, [existingMappings]);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    );
  };

  const uploadImage = async (file: File, pathSuffix: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${pathSuffix}.${ext}`;
    const { error } = await supabase.storage
      .from("preset-thumbnails")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("preset-thumbnails").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleThumbnailFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const isValidType = file.type.startsWith("image/") || file.type === "video/mp4" || file.type === "video/webm";
    if (!isValidType) { toast.error(t("fsOnlyImageOrVideo")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("fsMaxFileSize")); return; }
    setIsUploadingThumb(true);
    try {
      const url = await uploadImage(file, `flow-thumb-${flowId}`);
      setThumbnailUrl(url);
      toast.success(t("fsThumbnailUploaded"));
    } catch (err: any) { toast.error(err.message); }
    finally { setIsUploadingThumb(false); }
  };

  const handlePreviewFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setIsUploadingPreview(true);
    try {
      const newUrls: string[] = [];
      const rejected: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isValid = f.type.startsWith("image/") || f.type === "video/mp4" || f.type === "video/webm";
        if (!isValid) { rejected.push(`${f.name}: ${t("fsOnlyImageOrVideo")}`); continue; }
        if (f.size > 10 * 1024 * 1024) { rejected.push(`${f.name}: ${t("fsMaxFileSize")}`); continue; }
        const url = await uploadImage(f, `flow-preview-${flowId}-${Date.now()}-${i}`);
        newUrls.push(url);
      }
      setPreviewImages((prev) => [...prev, ...newUrls]);
      if (newUrls.length > 0) {
        toast.success(t("fsImagesUploaded").replace("{n}", String(newUrls.length)));
      }
      if (rejected.length > 0) {
        toast.error(rejected.join("\n"));
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setIsUploadingPreview(false); }
  };

  const removePreviewImage = (index: number) => {
    setPreviewImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExampleInputFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setIsUploadingExample(true);
    try {
      const newUrls: string[] = [];
      const rejected: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isValid = f.type.startsWith("image/") || f.type === "video/mp4" || f.type === "video/webm";
        if (!isValid) { rejected.push(`${f.name}: ${t("fsOnlyImageOrVideo")}`); continue; }
        if (f.size > 10 * 1024 * 1024) { rejected.push(`${f.name}: ${t("fsMaxFileSize")}`); continue; }
        const url = await uploadImage(f, `flow-example-input-${flowId}-${Date.now()}-${i}`);
        newUrls.push(url);
      }
      setExampleInputs((prev) => [...prev, ...newUrls]);
      if (newUrls.length > 0) {
        toast.success(t("fsExamplesUploaded").replace("{n}", String(newUrls.length)));
      }
      if (rejected.length > 0) {
        toast.error(rejected.join("\n"));
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setIsUploadingExample(false); }
  };

  const removeExampleInput = (index: number) => {
    setExampleInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t("fsFlowNameRequired")); return; }
    setIsSaving(true);
    try {
      const existingSettings = (flow?.settings as Record<string, unknown>) ?? {};
      const updatedSettings = {
        ...existingSettings,
        setup_instructions: setupInstructions.trim() || null,
        preview_images: previewImages,
        example_inputs: exampleInputs,
      };

      // Save flow metadata
      const { error } = await supabase
        .from("flows")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          thumbnail_url: thumbnailUrl || null,
          settings: updatedSettings as any,
          keywords: keywords.map((k) => k.toLowerCase()),
          format_tags: formatTags,
        } as any)
        .eq("id", flowId!);

      if (error) throw error;

      // Save category mappings: delete old, insert new
      await supabase
        .from("flow_category_mappings")
        .delete()
        .eq("flow_id", flowId!);

      if (selectedCategoryIds.length > 0) {
        const { error: mappingError } = await supabase
          .from("flow_category_mappings")
          .insert(
            selectedCategoryIds.map((categoryId) => ({
              flow_id: flowId!,
              category_id: categoryId,
            }))
          );
        if (mappingError) throw mappingError;
      }

      queryClient.invalidateQueries({ queryKey: ["flows"] });
      queryClient.invalidateQueries({ queryKey: ["flow-settings", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-category-mappings", flowId] });
      toast.success(t("fsChangesSaved"));

      // Fire-and-forget: generate embedding for search
      generateFlowEmbedding(flowId!, name.trim(), description.trim(), keywords, formatTags);
    } catch (err: any) {
      toast.error(err.message || t("fsFailedToSave"));
    } finally { setIsSaving(false); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">{t("flowNotFound")}</p>
          <Button variant="outline" onClick={() => navigate("/app/flow-studio")} className="glass-border">
           <ArrowLeft className="w-4 h-4 mr-2" /> {t("flowBackToStudio")}
         </Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[flow.status] ?? STATUS_CONFIG.draft;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Hidden file inputs */}
      <input ref={thumbInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/webm" onChange={handleThumbnailFile} />
      <input ref={previewInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/webm" multiple onChange={handlePreviewFiles} />
      <input ref={exampleInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/webm" multiple onChange={handleExampleInputFiles} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app/flow-studio")} className="shrink-0 glass-border">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-foreground">{flow.name}</h1>
              <Badge variant="outline" className={cn("text-[10px] gap-1", status.color)}>
                <status.icon className="w-3 h-3" />{t(status.labelKey)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{t("fsManageSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isSaving} className="gap-1.5 glass-border">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t("fsSaveChanges")}
          </Button>
          <Button asChild variant="gradient" className="gap-1.5 glass-border">
            <Link to={`/app/flow-studio/${flowId}/editor`}>
              <Workflow className="w-4 h-4" /> {t("fsOpenNodeEditor")}
            </Link>
          </Button>
        </div>
      </motion.div>

      <Separator className="border-border/40" />

      {/* Basic Info Section */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="space-y-5">
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">{t("fsBasicInfo")}</h2>

        <div className="grid gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="flow-name" className="text-xs font-medium text-muted-foreground">{t("fsNameLabel")}</Label>
            <Input id="flow-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("fsNamePlaceholder")}
              className="bg-muted/20 border-border/50" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flow-desc" className="text-xs font-medium text-muted-foreground">{t("flowDescLabel")}</Label>
            <Textarea id="flow-desc" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t("flowDescPlaceholder")}
              rows={3} className="bg-muted/20 border-border/50 resize-none" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flow-instructions" className="text-xs font-medium text-muted-foreground">
              {t("flowInstructionsLabel")} <span className="text-muted-foreground/60">{t("flowInstructionsHint")}</span>
            </Label>
            <Textarea id="flow-instructions" value={setupInstructions} onChange={(e) => setSetupInstructions(e.target.value)}
              placeholder={t("flowInstructionsPlaceholder")}
              rows={4} className="bg-muted/20 border-border/50 resize-none" />
          </div>
        </div>
      </motion.section>

      <Separator className="border-border/40" />

      {/* Categorization Section — New DB-driven */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.075 }}
        className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">{t("fsCategorization")}</h2>
          <p className="text-[11px] text-muted-foreground/70 mt-1">{t("fsCategorizationDesc")}</p>
        </div>

        <div className="grid gap-5">
          {/* Output Type */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">{t("fsOutputType")}</Label>
            <p className="text-[11px] text-muted-foreground/70">{t("fsOutputTypeDesc")}</p>
            <div className="flex gap-2">
              {[
                { key: "image", label: t("fsImage"), icon: ImageIcon },
                { key: "video", label: t("fsVideo"), icon: Film },
              ].map(({ key, label, icon: Icon }) => {
                const isSelected = formatTags.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setFormatTags((prev) =>
                        prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-150 font-medium text-sm",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                        : "bg-muted/10 text-muted-foreground border-border/50 hover:border-primary/50 hover:text-primary"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {categoriesData?.industries && (
            <CategoryTagSection
              label={t("fsIndustries")}
              categories={categoriesData.industries}
              selected={selectedCategoryIds}
              onToggle={toggleCategory}
            />
          )}
          {categoriesData?.useCases && (
            <CategoryTagSection
              label={t("fsUseCases")}
              categories={categoriesData.useCases}
              selected={selectedCategoryIds}
              onToggle={toggleCategory}
            />
          )}

          <KeywordChipsInput keywords={keywords} onChange={setKeywords} />
        </div>
      </motion.section>

      <Separator className="border-border/40" />

      {/* Media Assets Section */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="space-y-6">
        <h2 className="text-sm font-semibold text-foreground tracking-wide uppercase">{t("fsMediaAssets")}</h2>

        {/* Thumbnail */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">{t("fsThumbnail")}</Label>
          <p className="text-[11px] text-muted-foreground/70">{t("fsThumbnailDesc")}</p>
          <div className="flex items-start gap-4">
            <button type="button" onClick={() => thumbInputRef.current?.click()}
              className="w-24 h-24 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/50 bg-muted/10 flex items-center justify-center transition-colors overflow-hidden shrink-0 relative">
              {isUploadingThumb ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : thumbnailUrl ? (
                thumbnailUrl.match(/\.(mp4|webm)/i) ? (
                  <video src={thumbnailUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="w-5 h-5 text-muted-foreground/40" />
                  <span className="text-[9px] text-muted-foreground/50">{t("fsUpload")}</span>
                </div>
              )}
            </button>
            <div className="flex-1 space-y-2">
              <Input value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder={t("flowPasteImageUrl")}
                className="bg-muted/20 border-border/50 text-xs" />
              {thumbnailUrl && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1 px-2 glass-border"
                  onClick={() => setThumbnailUrl("")}>
                  <X className="w-3 h-3" /> {t("fsRemove")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator className="border-border/30" />

        {/* Preview Images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">{t("fsPreviewImages")}</Label>
          <p className="text-[11px] text-muted-foreground/70">{t("fsPreviewImagesDesc")}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {previewImages.map((url, i) => (
              <div key={i} className="relative group aspect-[4/3] rounded-lg overflow-hidden border border-border/30 bg-muted/10">
                {url.match(/\.(mp4|webm)/i) ? (
                  <video src={url} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                )}
                <button onClick={() => removePreviewImage(i)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => previewInputRef.current?.click()}
              className="aspect-[4/3] rounded-lg border-2 border-dashed border-border/40 hover:border-primary/50 flex flex-col items-center justify-center gap-1.5 transition-colors bg-muted/5">
              {isUploadingPreview ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (
                <>
                  <Plus className="w-5 h-5 text-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground/50">{t("flowAddPreview")}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </motion.section>
    </div>
  );
};

export default FlowSettingsPage;
