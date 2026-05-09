/**
 * ClassEnroll — landing page after a student scans a teacher's QR.
 *
 * Flow:
 *   1. URL: /enroll-class/:code
 *   2. Guest -> /auth?redirect=/enroll-class/:code
 *   3. Signed in -> redeem the code against the current account immediately
 *   4. If no student ID is known yet, prompt after enrollment has succeeded
 *   5. Continue to the created class space
 */
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, UserRoundPen, Workflow, XCircle } from "lucide-react";
import PageLoadingAnim from "@/components/ui/PageLoadingAnim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { setActiveClassId } from "@/hooks/useIsOrgUser";
import { enrollInClass, updateSchoolProfile } from "@/lib/orgAdminApi";

type EnrollStatus =
  | { phase: "idle" }
  | { phase: "redeeming" }
  | {
      phase: "ok";
      class_name: string;
      balance: number;
      class_id: string;
      workspace_id?: string;
      student_code?: string | null;
      already_enrolled?: boolean;
    }
  | {
      phase: "saving_code";
      class_name: string;
      balance: number;
      class_id: string;
      workspace_id?: string;
    }
  | { phase: "error"; error: string };

export default function ClassEnroll() {
  const { t: i18n } = useLanguage();
  const { code } = useParams<{ code: string }>();
  const { user, refreshProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const redeemStarted = useRef<string | null>(null);

  const [studentCode, setStudentCode] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<EnrollStatus>({ phase: "idle" });

  const workspacePath = (workspaceId?: string) =>
    workspaceId ? `/app/workspace/${workspaceId}` : "/app/workspace";

  const redirectToWorkspace = (workspaceId?: string, delayMs = 1800) => {
    window.setTimeout(() => navigate(workspacePath(workspaceId), { replace: true }), delayMs);
  };

  useEffect(() => {
    if (authLoading || !user?.id || !code) return;
    const redeemKey = `${user.id}:${code}:${retryNonce}`;
    if (redeemStarted.current === redeemKey) return;
    redeemStarted.current = redeemKey;

    let cancelled = false;
    let timedOut = false;
    const failsafe = window.setTimeout(() => {
      if (!cancelled) {
        timedOut = true;
        setStatus({ phase: "error", error: "enrollment_timeout" });
      }
    }, 30_000);

    const redeem = async () => {
      try {
        setStatus({ phase: "redeeming" });
        const res = await enrollInClass(code);
        if (cancelled || timedOut) return;
        window.clearTimeout(failsafe);

        if (!res.ok) {
          setStatus({ phase: "error", error: res.error ?? "unknown_error" });
          return;
        }

        const next = {
          phase: "ok" as const,
          class_name: res.class_name ?? "your class",
          balance: res.starting_balance ?? 0,
          class_id: res.class_id ?? "",
          workspace_id: res.workspace_id,
          student_code: res.student_code ?? null,
          already_enrolled: Boolean(res.already_enrolled),
        };
        setStatus(next);

        if (res.class_id) setActiveClassId(res.class_id);
        qc.invalidateQueries({ queryKey: ["mf-um-class-memberships"] });
        qc.invalidateQueries({ queryKey: ["class-memberships"] });
        qc.invalidateQueries({ queryKey: ["education-student-lock"] });
        void refreshProfile().catch((error) => {
          console.warn("[ClassEnroll] profile refresh failed after enrollment", error);
        });

        if (res.already_enrolled || res.student_code) {
          redirectToWorkspace(res.workspace_id, res.already_enrolled ? 1400 : 1800);
        }
      } catch (error) {
        window.clearTimeout(failsafe);
        if (!cancelled) {
          setStatus({
            phase: "error",
            error: error instanceof Error ? error.message : "enrollment_failed",
          });
        }
      }
    };

    void redeem();
    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
    };
  }, [authLoading, code, retryNonce, user?.id]);

  const errorLabel = (error: string) => {
    switch (error) {
      case "code_not_found":
        return i18n("classEnroll.error.codeNotFound");
      case "code_revoked":
        return i18n("classEnroll.error.codeRevoked");
      case "code_expired":
        return i18n("classEnroll.error.codeExpired");
      case "code_exhausted":
        return i18n("classEnroll.error.codeExhausted");
      case "class_not_active":
        return i18n("classEnroll.error.classNotActive");
      case "class_full":
        return i18n("classEnroll.error.classFull");
      case "class_pool_exhausted":
        return "This class does not have enough pool credits for this QR code. Ask your teacher to add credits to the class pool.";
      case "not_signed_in":
        return i18n("classEnroll.error.notSignedIn");
      case "auth_session_timeout":
        return "Could not read your signed-in session. Please refresh this page or sign in again.";
      case "invalid_code":
        return i18n("classEnroll.error.invalidCode");
      case "student_code_required":
        return i18n("classEnroll.error.studentCodeRequired");
      case "email_domain_not_allowed":
        return "Use your college email account to join this class. Sign out and sign in again with the registered school domain.";
      case "enrollment_timeout":
        return "Joining this class took too long. Please check your connection and try again.";
      case "enrollment_network_error":
        return "Could not reach the class enrollment service. Please try again.";
      case "internal_error":
        return "Class enrollment failed on the server. Please try again, or ask the teacher to refresh the QR code.";
      default:
        return error;
    }
  };

  const saveStudentCode = async () => {
    if (status.phase !== "ok" || !status.class_id) return;
    const trimmed = studentCode.trim();
    if (!trimmed) {
      setStatus({ phase: "error", error: "student_code_required" });
      return;
    }

    setStatus({
      phase: "saving_code",
      class_name: status.class_name,
      balance: status.balance,
      class_id: status.class_id,
      workspace_id: status.workspace_id,
    });

    try {
      await updateSchoolProfile({ class_id: status.class_id, student_code: trimmed });
      qc.invalidateQueries({ queryKey: ["mf-um-class-memberships"] });
      qc.invalidateQueries({ queryKey: ["class-memberships"] });
      setActiveClassId(status.class_id);
      redirectToWorkspace(status.workspace_id, 250);
    } catch (error) {
      setStatus({
        phase: "error",
        error: error instanceof Error ? error.message : "student_code_update_failed",
      });
    }
  };

  if (authLoading) return <PageLoadingAnim label={i18n("classEnroll.signingIn")} />;
  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(`/enroll-class/${code}`)}`} replace />;
  }
  if (!code) return <Navigate to="/app/workspace" replace />;

  const okNeedsStudentCode = status.phase === "ok" && !status.student_code && !status.already_enrolled;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        {status.phase === "idle" || status.phase === "redeeming" ? (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{i18n("classEnroll.joiningClass")}</h1>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{code}</p>
            </div>
          </>
        ) : null}

        {status.phase === "ok" && (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold">
              {status.already_enrolled
                ? `Already enrolled in ${status.class_name}`
                : i18n("classEnroll.welcomeTo", { className: status.class_name })}
            </h1>
            <p className="text-muted-foreground">
              {status.already_enrolled ? "Your class space is ready with " : i18n("classEnroll.receivedCreditsPrefix")}{" "}
              <span className="font-mono font-semibold text-foreground">
                {status.balance.toLocaleString()}
              </span>{" "}
              {status.already_enrolled ? "credits available." : i18n("classEnroll.receivedCreditsSuffix")}
            </p>

            {okNeedsStudentCode ? (
              <div className="mx-auto max-w-sm rounded-lg border bg-card p-4 text-left shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <UserRoundPen className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">Add your student ID</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This class is already linked to your account. Save your student ID now so your teacher can match
                      the space to the roster. You can edit it later in Settings.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student-code">{i18n("common.studentId")}</Label>
                  <Input
                    id="student-code"
                    value={studentCode}
                    onChange={(event) => setStudentCode(event.target.value)}
                    placeholder={i18n("classEnroll.eG6612345")}
                    autoFocus
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={saveStudentCode} className="flex-1">
                    Save and continue
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(workspacePath(status.workspace_id), { replace: true })}
                  >
                    Later
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{i18n("classEnroll.redirecting")}</p>
                <Button onClick={() => navigate(workspacePath(status.workspace_id), { replace: true })}>
                  <Workflow className="h-4 w-4 mr-2" /> {i18n("classEnroll.goToWorkspaceNow")}
                </Button>
              </>
            )}
          </>
        )}

        {status.phase === "saving_code" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-bold">Saving student ID...</h2>
          </>
        )}

        {status.phase === "error" && (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold">{i18n("classEnroll.couldNotJoin")}</h1>
            <p className="text-muted-foreground">{errorLabel(status.error)}</p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  redeemStarted.current = null;
                  setStatus({ phase: "idle" });
                  setRetryNonce((value) => value + 1);
                }}
              >
                {i18n("classEnroll.tryAgain")}
              </Button>
              <Button onClick={() => navigate("/app/workspace", { replace: true })}>
                {i18n("classEnroll.continueToWorkspace")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
