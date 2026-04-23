import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import FlowStatusBadge from "@/components/flow/FlowStatusBadge";
import { Loader2, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import type { FlowStatus } from "@/types/admin";

interface ActiveFlow {
  id: string;
  name: string;
  status: string;
  category: string;
  selling_price: number;
  creator_payout: number;
  user_id: string;
  updated_at: string;
}

export default function FlowActive() {
  const { adminFetch, token } = useAdminAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<ActiveFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFlows = useCallback(async () => {
    if (!token) {
      toast.error(t("adminSessionExpired" as any));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params: Record<string, unknown> = { status: "published", include_published: true };
      const data = await adminFetch("get_review_queue", params);

      const flowList = (data as any)?.flows
        || (data as any)?.data
        || (Array.isArray(data) ? data : []);

      setFlows(flowList);
    } catch (err: any) {
      console.error("[FlowActive] Fetch error:", err);
      const msg = err?.message || "Unknown error";
      if (msg.includes("Not authenticated") || msg.includes("Unauthorized")) {
        toast.error(t("adminUnauthorized" as any));
      } else {
        toast.error(t("adminLoadFlowsFailed" as any) + ": " + msg);
      }
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, token]);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("adminFlowActiveTitle" as any)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("adminFlowActiveCount" as any, { count: flows.length })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFlows([]); loadFlows(); }} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {t("adminRefresh" as any)}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
          <p className="text-sm text-muted-foreground">{t("adminNoActiveFlows" as any)}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColFlow" as any)}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColCategory" as any)}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColSellingPrice" as any)}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColCreatorPayout" as any)}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColStatus" as any)}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColUpdated" as any)}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.map((flow) => (
                <TableRow key={flow.id} className="group">
                  <TableCell className="font-medium text-foreground">{flow.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{flow.category}</TableCell>
                  <TableCell className="text-foreground tabular-nums">{flow.selling_price} cr</TableCell>
                  <TableCell className="text-emerald-400 tabular-nums">{flow.creator_payout} cr</TableCell>
                  <TableCell><FlowStatusBadge status={flow.status as FlowStatus} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(flow.updated_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                      <Link to={`/admin/review/${flow.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
