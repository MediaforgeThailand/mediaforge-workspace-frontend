import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Wallet, Minus, Plus, Bug, FlaskConical, Zap } from "lucide-react";
import { toast } from "sonner";

// --- Types ---
interface FlowRun {
  id: string;
  status: string;
  created_at: string;
  credits_used: number;
  outputs: Record<string, unknown> | null;
  error_message: string | null;
}

interface CreditTx {
  id: string;
  amount: number;
  type: string;
  feature: string | null;
  description: string | null;
  balance_after: number;
  created_at: string;
}

// --- Helpers ---
const shortId = (id: string) => id.slice(0, 8);

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  running: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  failed_refunded: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const txTypeColor: Record<string, string> = {
  usage: "bg-red-500/20 text-red-400 border-red-500/30",
  topup: "bg-green-500/20 text-green-400 border-green-500/30",
  refund: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  adjustment: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  admin_adjustment: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  expiration: "bg-muted text-muted-foreground border-border",
};

const SIMULATE_FAILURE_KEY = "dev_simulate_kling_failure";

const DevDebug = () => {
  const { user } = useAuth();
  const { credits, refetch: refetchCredits } = useCredits();
  const [flowRuns, setFlowRuns] = useState<FlowRun[]>([]);
  const [creditTxs, setCreditTxs] = useState<CreditTx[]>([]);
  const [autoPoll, setAutoPoll] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(() =>
    localStorage.getItem(SIMULATE_FAILURE_KEY) === "true"
  );

  const toggleSimulateFailure = (checked: boolean) => {
    setSimulateFailure(checked);
    localStorage.setItem(SIMULATE_FAILURE_KEY, String(checked));
    toast.info(checked ? "Failure simulation ON — next Kling job will auto-fail" : "Failure simulation OFF");
  };

  const fetchFlowRuns = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("flow_runs")
      .select("id, status, started_at, credits_used, outputs, error_message")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10);
    if (data) setFlowRuns(data.map((r) => ({ ...r, created_at: r.started_at })) as unknown as FlowRun[]);
  }, [user]);

  const fetchCreditTxs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("credit_transactions")
      .select("id, amount, type, feature, description, balance_after, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setCreditTxs(data as CreditTx[]);
  }, [user]);

  const refreshAll = useCallback(() => {
    refetchCredits();
    fetchFlowRuns();
    fetchCreditTxs();
  }, [refetchCredits, fetchFlowRuns, fetchCreditTxs]);

  // Auto-poll
  useEffect(() => {
    refreshAll();
    if (!autoPoll) return;
    const interval = setInterval(refreshAll, 3000);
    return () => clearInterval(interval);
  }, [autoPoll, refreshAll]);

  const setCreditsZero = async () => {
    if (!user) return;
    setLoading("zero");
    const { error } = await supabase.rpc("debug_set_balance", { p_user_id: user.id, p_balance: 0 });
    if (error) toast.error(error.message);
    else toast.success("Balance set to 0");
    refreshAll();
    setLoading(null);
  };

  const addCredits = async () => {
    if (!user) return;
    setLoading("add");
    const { error } = await supabase.rpc("debug_add_credits", { p_user_id: user.id, p_amount: 100 });
    if (error) toast.error(error.message);
    else toast.success("+100 credits added");
    refreshAll();
    setLoading(null);
  };

  const triggerTestRefund = async () => {
    if (!user) return;
    setLoading("refund");
    toast.info("Starting refund test… (deduct → wait 3s → refund)");

    try {
      const { data, error } = await supabase.functions.invoke("test-refund-flow", {
        method: "POST",
        body: {},
      });

      if (error) {
        toast.error(`Test failed: ${error.message}`);
        setLoading(null);
        refreshAll();
        return;
      }

      const result = data as {
        success: boolean;
        net_zero: boolean;
        start_balance: number;
        final_balance: number;
        run_id: string;
        steps: string[];
      };

      if (result.net_zero) {
        toast.success(
          `✅ Refund test PASSED! Balance: ${result.start_balance} → ${result.start_balance - 10} → ${result.final_balance} (net zero)`,
          { duration: 8000 }
        );
      } else {
        toast.error(
          `❌ Refund test FAILED! Start: ${result.start_balance}, End: ${result.final_balance} — balance mismatch!`,
          { duration: 8000 }
        );
      }

      console.log("[Test Refund Steps]", result.steps);
    } catch (e) {
      toast.error(`Test error: ${e instanceof Error ? e.message : "Unknown"}`);
    }

    refreshAll();
    setLoading(null);
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bug className="w-6 h-6 text-orange-400" />
        <h1 className="text-2xl font-bold tracking-tight">Dev Debug Console</h1>
        <Badge variant="outline" className="ml-auto text-xs">
          {autoPoll ? "Auto-polling 3s" : "Paused"}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => setAutoPoll(!autoPoll)}>
          {autoPoll ? "Pause" : "Resume"}
        </Button>
        <Button size="sm" variant="ghost" onClick={refreshAll}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Failure Simulation & Test Refund */}
      <Card className="border-dashed border-red-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-red-400" /> Failure Simulation Lab
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Simulate Kling API Failure</p>
              <p className="text-xs text-muted-foreground">
                When ON, the next async flow will auto-fail and trigger refund logic.
              </p>
            </div>
            <Switch checked={simulateFailure} onCheckedChange={toggleSimulateFailure} />
          </div>

          {/* Test Refund Button */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Trigger Test Refund Job</p>
              <p className="text-xs text-muted-foreground">
                Deducts 10 credits → waits 3s → refunds 10 credits → verifies net-zero.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={triggerTestRefund}
              disabled={loading === "refund"}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Zap className="w-3 h-3 mr-1" />
              {loading === "refund" ? "Running…" : "Run Test"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Controller */}
      <Card className="border-dashed border-orange-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Wallet Controller
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-3xl font-mono font-bold text-primary">
              {credits?.balance ?? "—"}
              <span className="text-sm font-normal text-muted-foreground ml-2">credits</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="destructive" onClick={setCreditsZero} disabled={loading === "zero"}>
                <Minus className="w-3 h-3 mr-1" />
                Set to 0
              </Button>
              <Button size="sm" variant="default" onClick={addCredits} disabled={loading === "add"}>
                <Plus className="w-3 h-3 mr-1" />
                Add 100
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Purchased: {credits?.total_purchased ?? 0} · Used: {credits?.total_used ?? 0}
          </div>
        </CardContent>
      </Card>

      {/* Flow Runs Monitor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Flow Runs (latest 10)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Result / Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flowRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No flow runs found
                  </TableCell>
                </TableRow>
              ) : (
                flowRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs">{shortId(run.id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor[run.status] ?? ""}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{run.credits_used}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtTime(run.created_at)}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {run.error_message ? (
                        <span className="text-red-400">{run.error_message}</span>
                      ) : run.outputs ? (
                        (run.outputs as Record<string, string>).result_url ||
                        (run.outputs as Record<string, string>).video_url ? (
                          <a
                            href={
                              (run.outputs as Record<string, string>).result_url ||
                              (run.outputs as Record<string, string>).video_url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 underline"
                          >
                            View
                          </a>
                        ) : (
                          "—"
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credit Transactions Monitor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Credit Transactions (latest 10)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance After</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditTxs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No transactions
                  </TableCell>
                </TableRow>
              ) : (
                creditTxs.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Badge variant="outline" className={txTypeColor[tx.type] ?? ""}>
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{tx.balance_after}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                      {tx.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtTime(tx.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DevDebug;
