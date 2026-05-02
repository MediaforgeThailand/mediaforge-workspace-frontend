/**
 * DeleteAccountDialog — PDPA right-of-erasure UI.
 *
 * Triggers the `delete-account` edge function which cascades:
 *   1. Verify password (re-authn)
 *   2. Cancel Stripe subscription + detach payment methods
 *   3. Delete auth.users row (cascades through DB FKs)
 *   4. Purge user-prefixed storage objects in ai-media + user_assets
 *   5. Sign user out client-side
 *
 * UX guard: requires the user to type their email AND their
 * password to enable the destructive button. Two-factor friction
 * for an irreversible action.
 */

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { user, signOut } = useAuth();
  const { language } = useLanguage();
  const [password, setPassword] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const userEmail = user?.email ?? "";
  // Both gates must pass: typed email matches user's email AND a
  // non-empty password is provided. The edge function does the
  // real password verification — we just keep the destructive
  // button disabled until the obvious typos are out of the way.
  const canSubmit =
    !submitting &&
    password.length > 0 &&
    emailConfirm.trim().toLowerCase() === userEmail.toLowerCase();

  const handleClose = () => {
    if (submitting) return;
    setPassword("");
    setEmailConfirm("");
    setReason("");
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { password, reason: reason || null },
      });
      if (error) {
        // 401 = wrong password, surfaced as friendly copy
        const msg = error.message ?? String(error);
        if (/wrong_password|401/.test(msg)) {
          toast.error(
            language === "th"
              ? "รหัสผ่านไม่ถูกต้อง"
              : "Wrong password",
          );
        } else {
          toast.error(
            language === "th"
              ? `ลบบัญชีไม่สำเร็จ: ${msg}`
              : `Account deletion failed: ${msg}`,
          );
        }
        return;
      }
      if ((data as { success?: boolean })?.success) {
        toast.success(
          language === "th"
            ? "ลบบัญชีของคุณเรียบร้อยแล้ว"
            : "Your account has been deleted",
        );
        // Sign out locally — the auth.users row is gone server-
        // side, so the next refresh would 401 anyway. Doing it
        // explicitly avoids a flash of authed UI before the
        // session expires.
        await signOut();
        // Hard-redirect to landing page; the SPA route will
        // bounce to /auth on its own but a hard refresh ensures
        // every cached fragment of state is gone.
        window.location.href = "/";
      } else {
        toast.error(
          language === "th"
            ? "ลบบัญชีไม่สำเร็จ — ติดต่อทีมงาน"
            : "Account deletion failed — please contact support",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-red-500/20 bg-[hsl(0_0%_8%)] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-red-300">
            <AlertTriangle className="h-4 w-4" />
            {language === "th" ? "ลบบัญชีถาวร" : "Delete account permanently"}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-zinc-400">
            {language === "th" ? (
              <>
                การลบบัญชีจะเอา{" "}
                <span className="font-semibold text-zinc-200">
                  ข้อมูล โปรเจค ผลงาน เครดิต และประวัติการชำระทั้งหมด
                </span>{" "}
                ออกถาวร — กู้คืนไม่ได้ การสมัครสมาชิกที่ยังใช้งานอยู่จะถูกยกเลิกและบัตรเครดิตที่ผูกไว้จะถูกถอนออก
              </>
            ) : (
              <>
                Deleting your account permanently removes{" "}
                <span className="font-semibold text-zinc-200">
                  all your data, projects, generations, credits, and billing history
                </span>{" "}
                — this cannot be undone. Active subscriptions are cancelled and saved cards are detached.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Email re-type */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th"
              ? `พิมพ์อีเมล "${userEmail}" เพื่อยืนยัน`
              : `Type your email "${userEmail}" to confirm`}
          </label>
          <input
            type="email"
            value={emailConfirm}
            onChange={(e) => setEmailConfirm(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-red-500/40"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th" ? "รหัสผ่าน" : "Password"}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoComplete="current-password"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-red-500/40"
          />
        </div>

        {/* Reason (optional) */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th" ? "เหตุผล (ไม่บังคับ)" : "Reason (optional)"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            disabled={submitting}
            rows={2}
            placeholder={
              language === "th"
                ? "ช่วยให้เราพัฒนาบริการ"
                : "Helps us improve the product"
            }
            className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-red-500/40"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center rounded-md bg-white/[0.06] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.09]"
          >
            {language === "th" ? "ยกเลิก" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-[13px] font-semibold transition-colors",
              canSubmit
                ? "bg-red-500/90 text-white hover:bg-red-500"
                : "cursor-not-allowed bg-red-500/20 text-red-300/50",
            )}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {language === "th" ? "ลบบัญชีถาวร" : "Delete forever"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
