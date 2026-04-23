import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/hooks/useSignedUrl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Download, Trash2, Play, Image as ImageIcon, Film, Music, Loader2,
  FolderOpen,
} from "lucide-react";
import MediaThumbnail from "@/components/MediaThumbnail";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { downloadMedia } from "@/lib/downloadMedia";
import { formatDistanceToNow } from "date-fns";

interface Asset {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  source: string;
  thumbnail_url: string | null;
  metadata: any;
  created_at: string;
}

const FlowAssetDetail = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [flowName, setFlowName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  useEffect(() => {
    if (!user || !flowId) return;
    (async () => {
      setLoading(true);

      // Fetch flow name + assets in parallel
      const [flowRes, assetsRes] = await Promise.all([
        supabase.from("flows").select("name").eq("id", flowId).maybeSingle(),
        supabase.from("user_assets").select("id, name, file_url, file_type, source, thumbnail_url, metadata, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (flowRes.data) setFlowName(flowRes.data.name);

      // Filter by flow_id from metadata (jsonb)
      const flowAssets = (assetsRes.data || []).filter(
        (a: any) => a.metadata?.flow_id === flowId
      );

      // Resolve signed URLs
      const urls = flowAssets.flatMap((a: any) => [a.file_url, a.thumbnail_url].filter(Boolean));
      const signedMap = await getSignedUrls(urls);
      const resolved = flowAssets.map((a: any) => ({
        ...a,
        file_url: signedMap.get(a.file_url) || a.file_url,
        thumbnail_url: a.thumbnail_url ? (signedMap.get(a.thumbnail_url) || a.thumbnail_url) : null,
      }));
      setAssets(resolved);
      setLoading(false);
    })();
  }, [user, flowId]);

  const handleDownload = async (asset: Asset) => {
    await downloadMedia(asset.file_url, asset.name);
  };

  const downloadAll = async () => {
    toast.success(t("assetDownloading", { n: assets.length }));
    for (const asset of assets) {
      await handleDownload(asset);
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    await supabase.from("user_assets").delete().eq("id", deleteConfirm.id);
    setAssets((prev) => prev.filter((a) => a.id !== deleteConfirm.id));
    setDeleteConfirm({ open: false, id: null });
    toast.success(t("flowAssetDeletedOne"));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/app/assets")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{flowName || t("flowAssetHeader")}</h1>
            <p className="text-sm text-muted-foreground">{t("assetFilesGenerated", { n: assets.length })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {assets.length > 0 && (
            <Button variant="default" size="sm" className="gap-1.5" onClick={downloadAll}>
              <Download className="w-3.5 h-3.5" /> {t("flowAssetDownloadAll", { n: assets.length })}
            </Button>
          )}
          {flowId && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`/play/${flowId}`}>
                <Play className="w-3.5 h-3.5" /> {t("flowAssetRunFlow")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <FolderOpen className="w-12 h-12 opacity-30" />
          <p className="text-sm">{t("flowAssetEmpty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="group relative bg-card/40 border border-border rounded-xl overflow-hidden transition-all hover:border-primary/30"
            >
              {/* Preview */}
              <div className="relative aspect-square bg-secondary/30 flex items-center justify-center">
                {asset.file_type === "image" || asset.file_type === "video" ? (
                  <MediaThumbnail url={asset.thumbnail_url || asset.file_url} alt={asset.name} hoverPlay={asset.file_type === "video"} />
                ) : (
                  <Music className="w-8 h-8 text-muted-foreground/30" />
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={() => handleDownload(asset)}>
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20" onClick={() => setDeleteConfirm({ open: true, id: asset.id })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Type badge */}
                <div className="absolute bottom-2 left-2">
                  <span className="flex items-center gap-1 text-[10px] text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
                    {asset.file_type === "video" ? <Film className="w-3 h-3" /> : asset.file_type === "audio" ? <Music className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                    {asset.file_type}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-xs text-foreground truncate">{asset.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => !o && setDeleteConfirm({ open: false, id: null })}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("flowAssetDeleteOneTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("flowAssetDeleteOneDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("assetCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("assetDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FlowAssetDetail;
