/**
 * ClassEnroll — landing page after a student scans a teacher's QR.
 *
 * Flow:
 *   1. URL: /enroll-class/:code
 *   2. Guest → bounce to /auth?redirect=/enroll-class/:code
 *   3. Signed in → optionally prompt for รหัสนักเรียน (skip if not required)
 *   4. Call mf-um-class-enroll → outcome
 *   5. After 4s → /app/workspace
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { enrollInClass } from "@/lib/orgAdminApi";
import { setActiveClassId } from "@/hooks/useIsOrgUser";
import { useQueryClient } from "@tanstack/react-query";
import PageLoadingAnim from "@/components/ui/PageLoadingAnim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, BookOpen, Workflow, Loader2 } from "lucide-react";

const ERROR_LABELS: Record<string, string> = {
  code_not_found: "This code doesn't exist or has been deleted.",
  code_revoked: "This code was revoked by the teacher.",
  code_expired: "This code has expired.",
  code_exhausted: "This code has reached its maximum redemptions.",
  class_not_active: "This class isn't active yet, or has ended.",
  class_full: "This class is full.",
  already_redeemed: "You've already enrolled in this class with this code.",
  not_signed_in: "Please sign in first.",
  invalid_code: "That code looks malformed.",
  student_code_required: "Enter your student ID so the class space can be assigned correctly.",
};

export default function ClassEnroll() {
  const { code } = useParams<{ code: string }>();
  const { user, refreshProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [studentCode, setStudentCode] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [status, setStatus] = useState<
    | { phase: "idle" }
    | { phase: "redeeming" }
    | { phase: "ok"; class_name: string; balance: number; class_id: string; workspace_id?: string }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  // After auth is resolved, show the enrollment form (or bounce guest)
  if (authLoading) return <PageLoadingAnim label="Signing you in…" />;
  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(`/enroll-class/${code}`)}`} replace />;
  }
  if (!code) return <Navigate to="/app/workspace" replace />;

  const submit = async () => {
    setHasSubmitted(true);
    const trimmedStudentCode = studentCode.trim();
    if (!trimmedStudentCode) {
      setStatus({ phase: "error", error: "student_code_required" });
      return;
    }
    setStatus({ phase: "redeeming" });
    const res = await enrollInClass(code, trimmedStudentCode);
    if (res.ok) {
      setStatus({
        phase: "ok",
        class_name: res.class_name ?? "your class",
        balance: res.starting_balance ?? 0,
        class_id: res.class_id ?? "",
        workspace_id: res.workspace_id,
      });
      // Make this class the active one + refresh caches
      if (res.class_id) setActiveClassId(res.class_id);
      qc.invalidateQueries({ queryKey: ["mf-um-class-memberships"] });
      qc.invalidateQueries({ queryKey: ["class-memberships"] });
      await refreshProfile();
      const nextPath = res.workspace_id ? `/app/workspace/${res.workspace_id}` : "/app/workspace";
      setTimeout(() => navigate(nextPath, { replace: true }), 2500);
    } else {
      setStatus({ phase: "error", error: res.error ?? "unknown_error" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        {!hasSubmitted && (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Join class</h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{code}</p>
            </div>

            <div className="text-left space-y-2 max-w-sm mx-auto">
              <Label htmlFor="student-code">Student ID</Label>
              <Input
                id="student-code"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="e.g. 6612345"
                required
              />
              <p className="text-xs text-muted-foreground">
                This is used to name and lock your class space.
              </p>
            </div>

            <Button onClick={submit} size="lg" className="w-full max-w-sm" disabled={!studentCode.trim()}>
              Join class
            </Button>
          </>
        )}

        {status.phase === "redeeming" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-bold">Joining class…</h2>
          </>
        )}

        {status.phase === "ok" && (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold">Welcome to {status.class_name}</h1>
            <p className="text-muted-foreground">
              You received <span className="font-mono font-semibold text-foreground">{status.balance.toLocaleString()}</span> credits for this class space.
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to workspace…</p>
            <Button onClick={() => navigate(status.workspace_id ? `/app/workspace/${status.workspace_id}` : "/app/workspace", { replace: true })}>
              <Workflow className="h-4 w-4 mr-2" /> Go to workspace now
            </Button>
          </>
        )}

        {status.phase === "error" && (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold">Couldn't join</h1>
            <p className="text-muted-foreground">
              {ERROR_LABELS[status.error] ?? status.error}
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => { setHasSubmitted(false); setStatus({ phase: "idle" }); }}
              >
                Try again
              </Button>
              <Button onClick={() => navigate("/app/workspace", { replace: true })}>
                Continue to workspace
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
