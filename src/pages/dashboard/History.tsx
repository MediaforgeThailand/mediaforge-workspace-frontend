import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Play, Calendar, RefreshCw, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";

interface FlowRun {
  id: string;
  status: string;
  started_at: string;
  credits_used: number;
  inputs: { prompt?: string } & Record<string, unknown>;
  outputs: { result_url?: string; video_url?: string } | null;
}

const History = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("flow_runs")
        .select("id, status, started_at, credits_used, inputs, outputs")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(50);
      setRuns((data as FlowRun[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleRemix = (prompt: string) => {
    navigate(`/dashboard/home`);
  };

  const getThumb = (run: FlowRun) =>
    run.outputs?.result_url || run.outputs?.video_url || "";

  return (
    <div className="space-y-8">
      <BackButton />
      <div>
        <h1 className="text-3xl font-bold">
          <span className="gradient-text">{t("history")}</span>
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run) => {
            const thumb = getThumb(run);
            const prompt = run.inputs?.prompt || "—";
            return (
              <div key={run.id} className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300">
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {thumb ? (
                    <img src={thumb} alt={prompt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  {thumb && (
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button size="icon" variant="ghost" className="rounded-full bg-primary/20 hover:bg-primary/40">
                        <Play className="w-6 h-6 text-primary-foreground" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-foreground line-clamp-2">{prompt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(run.started_at).toLocaleDateString()}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-primary hover:text-primary"
                        onClick={() => handleRemix(prompt)}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Remix
                      </Button>
                      {thumb && (
                        <Button variant="ghost" size="sm" className="h-8" asChild>
                          <a href={thumb} download target="_blank" rel="noreferrer">
                            <Download className="w-4 h-4 mr-1" />
                            {t("download")}
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
            <Play className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">{t("historyEmpty")}</p>
        </div>
      )}
    </div>
  );
};

export default History;