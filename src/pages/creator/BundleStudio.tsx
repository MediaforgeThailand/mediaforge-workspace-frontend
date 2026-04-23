import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Package, Loader2, Edit3, Trash2, Play, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyBundles, useCreateBundle, useDeleteBundle } from "@/hooks/useBundles";
import { formatTimeAgo } from "@/hooks/useFlows";

const STATUS_TONE: Record<string, string> = {
  draft: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  submitted: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  in_review: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  published: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  rejected: "text-red-400 bg-red-500/10 border-red-500/30",
};

const BundleStudio = () => {
  const navigate = useNavigate();
  const { data: bundles, isLoading } = useMyBundles();
  const createBundle = useCreateBundle();
  const deleteBundle = useDeleteBundle();

  const handleCreate = async () => {
    const created = await createBundle.mutateAsync(undefined);
    navigate(`/creator/bundles/${created.id}`);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete bundle "${name}"? This cannot be undone.`)) return;
    await deleteBundle.mutateAsync(id);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
              <Package className="w-4 h-4 text-rose-300" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Bundle Studio</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5 ml-12">
            Group related flows into a Creative Kit — users run them in a single workspace
          </p>
        </div>
        <Button onClick={handleCreate} disabled={createBundle.isPending} className="gap-1.5">
          {createBundle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New Bundle
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !bundles || bundles.length === 0 ? (
        <div className="border border-dashed border-border/40 rounded-2xl py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-6 h-6 text-rose-300" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1.5">No bundles yet</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
            Combine multiple flows into a coherent kit so users can complete an entire project in one place.
          </p>
          <Button onClick={handleCreate} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Create your first Bundle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bundles.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group relative rounded-2xl overflow-hidden border border-border/40 bg-card/40 backdrop-blur-sm hover:border-rose-500/40 hover:shadow-[0_0_30px_rgba(244,63,94,0.08)] transition-all"
            >
              {/* Bundle ribbon */}
              <div className="absolute top-0 right-0 z-10 pointer-events-none">
                <div className="bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 shadow-lg">
                  Bundle
                </div>
              </div>

              {/* Thumb */}
              <div
                className="aspect-video relative bg-muted/20 cursor-pointer"
                onClick={() => navigate(`/creator/bundles/${b.id}`)}
              >
                {b.thumbnail_url ? (
                  b.thumbnail_type === "video" ? (
                    <video src={b.thumbnail_url} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    <img src={b.thumbnail_url} alt={b.name} className="absolute inset-0 w-full h-full object-cover" />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Package className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] font-semibold text-white">
                  {b.flow_count} flow{b.flow_count !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1 flex-1">{b.name}</h3>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                      STATUS_TONE[b.status] ?? STATUS_TONE.draft
                    }`}
                  >
                    {b.status.replace("_", " ")}
                  </span>
                </div>
                {b.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{b.description}</p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-[10px] text-muted-foreground">{formatTimeAgo(b.updated_at)}</span>
                  <div className="flex items-center gap-1">
                    {b.status === "published" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/play/bundle/${b.id}`)}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/creator/bundles/${b.id}`)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(b.id, b.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BundleStudio;
