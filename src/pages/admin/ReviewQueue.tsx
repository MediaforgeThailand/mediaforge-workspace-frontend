import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import FlowStatusBadge from "@/components/flow/FlowStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, MessageSquare, RefreshCw } from "lucide-react";
import type { FlowStatus } from "@/types/admin";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface QueueFlow {
  id: string;
  name: string;
  status: string;
  category: string;
  base_cost: number;
  user_id: string;
  updated_at: string;
  created_at: string;
  tags: string[] | null;
  review_count: number;
}

export default function ReviewQueue() {
  const { adminFetch } = useAdminAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [flows, setFlows] = useState<QueueFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const loadFlows = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== "all") params.status = statusFilter;
      const data = await adminFetch("get_review_queue", params) as { flows: QueueFlow[] };
      setFlows(data.flows || []);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, statusFilter]);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === flows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(flows.map((f) => f.id)));
    }
  };

  const handleBulkAction = async (decision: string) => {
    if (selected.size === 0) return;
    setBulkSubmitting(true);
    try {
      await adminFetch("bulk_review", { flow_ids: Array.from(selected), decision });
      const key =
        decision === "approved" ? "adminBulkApproved" :
        decision === "rejected" ? "adminBulkRejected" :
        "adminBulkChangesRequested";
      toast({ title: t(key as Parameters<typeof t>[0], { count: selected.size }) });
      loadFlows();
    } catch (err) {
      toast({ title: t("genericError"), description: err instanceof Error ? err.message : t("genericFailed"), variant: "destructive" });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const submittedCount = flows.filter(f => ["submitted", "in_review"].includes(f.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t("adminReviewQueue")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {submittedCount} {submittedCount !== 1 ? t("adminFlowsAwaitingReview") : t("adminFlowAwaitingReview")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadFlows} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          {t("adminRefresh")}
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9 text-xs">
            <SelectValue placeholder={t("adminAllStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("adminAllStatuses")}</SelectItem>
            <SelectItem value="submitted">{t("adminStatusSubmitted")}</SelectItem>
            <SelectItem value="in_review">{t("adminStatusInReview")}</SelectItem>
            <SelectItem value="changes_requested">{t("adminStatusChangesRequested")}</SelectItem>
            <SelectItem value="rejected">{t("adminStatusRejected")}</SelectItem>
            <SelectItem value="draft">{t("adminStatusDraft")}</SelectItem>
          </SelectContent>
        </Select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto pl-4 border-l border-border">
            <span className="text-xs text-muted-foreground font-medium">{selected.size} {t("adminSelected")}</span>
            <Button size="sm" variant="default" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleBulkAction("approved")} disabled={bulkSubmitting}>
              {bulkSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
              {t("adminApprove")}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkAction("changes_requested")} disabled={bulkSubmitting}>
              <MessageSquare className="w-3 h-3" />
              {t("adminRequestChanges")}
            </Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => handleBulkAction("rejected")} disabled={bulkSubmitting}>
              <XCircle className="w-3 h-3" />
              {t("adminReject")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
          <p className="text-sm text-muted-foreground">{t("adminNoFlowsMatch")}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === flows.length && flows.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColFlow")}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColCategory")}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColStatus")}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColCost")}</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("adminColUpdated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flows.map((flow) => (
                <TableRow key={flow.id} className="cursor-pointer group" data-state={selected.has(flow.id) ? "selected" : undefined}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(flow.id)} onCheckedChange={() => toggleSelect(flow.id)} />
                  </TableCell>
                  <TableCell className="font-medium text-foreground group-hover:text-primary transition-colors p-0">
                    <Link to={`/admin/review/${flow.id}`} className="flex items-center gap-2 p-4">
                      {flow.name}
                      {flow.review_count > 0 && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/10">
                          {t("adminRevision")}
                        </Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs" onClick={() => navigate(`/admin/review/${flow.id}`)}>{flow.category}</TableCell>
                  <TableCell onClick={() => navigate(`/admin/review/${flow.id}`)}><FlowStatusBadge status={flow.status as FlowStatus} /></TableCell>
                  <TableCell className="text-muted-foreground tabular-nums" onClick={() => navigate(`/admin/review/${flow.id}`)}>{flow.base_cost}</TableCell>
                  <TableCell className="text-muted-foreground text-xs" onClick={() => navigate(`/admin/review/${flow.id}`)}>{new Date(flow.updated_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
