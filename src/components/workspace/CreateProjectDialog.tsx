/**
 * CreateProjectDialog — replaces the native browser `prompt()` that
 * used to handle "New project" everywhere.
 *
 * Stripped-down UX (intentionally minimal):
 *   - Name (required, max 80 chars; defaults to "โปรเจคไม่มีชื่อ")
 *   - Private toggle (on by default)
 *
 * Color is auto-assigned from the brand palette by the parent —
 * `defaultColor` arrives already-rotated based on the existing
 * project count, so successive new projects don't all share the
 * same hue. We don't surface the picker because nobody asked for
 * it and the dashboard can re-paint chips later if we ever do.
 *
 * Description is intentionally dropped — it was busy-work the user
 * never filled in. Project setting page can grow that field later
 * if it becomes load-bearing.
 *
 * Submit handler is owned by the parent (mirrors
 * DeleteAccountDialog / BuyCreditsDialog) so the dashboard
 * controls store + server upsert + navigate.
 */

import { useEffect, useState } from "react";
import { Loader2, FolderPlus, Lock, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface CreateProjectMeta {
  name: string;
  /** Always null in the slim UI; kept on the type so the
   *  `workspace_projects.description` column round-trip stays
   *  intact for any future "edit project" dialog that wants to
   *  surface it. */
  description: string | null;
  color: string;
  isPrivate: boolean;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent-supplied auto-color — rotated by project count so the
   *  user doesn't have to pick. Falls back to the first swatch if
   *  the parent doesn't pass one. */
  defaultColor?: string;
  /** Called when the user clicks "Create". Async — dialog stays
   *  open with a spinner until the promise settles, then closes
   *  on success or surfaces the error inline on failure. */
  onCreate: (meta: CreateProjectMeta) => Promise<void> | void;
}

const FALLBACK_COLOR = "hsl(258 90% 66%)"; // violet — first swatch

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultColor,
  onCreate,
}: CreateProjectDialogProps) {
  const { language } = useLanguage();
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the dialog re-opens — caller may pop it again
  // moments later for a follow-up project; old state shouldn't leak.
  useEffect(() => {
    if (open) {
      setName("");
      setIsPrivate(true);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const trimmedName = name.trim();
      const fallbackName =
        language === "th" ? "โปรเจคไม่มีชื่อ" : "Untitled project";
      const finalName = (trimmedName || fallbackName).slice(0, 80);
      await onCreate({
        name: finalName,
        description: null,
        color: defaultColor ?? FALLBACK_COLOR,
        isPrivate,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* Sizing notes:
       *  - Width 400px gives Thai script room to breathe (Thai
       *    diacritics + tone marks need bigger character box than
       *    Latin); the previous 360px squished placeholders.
       *  - Inline `fontFamily` because the Dialog renders via portal
       *    and does NOT inherit the workspace shell's "Prompt" font;
       *    without this it falls back to system-ui which renders
       *    Thai compressed with thin strokes — exactly the
       *    "อ่านไม่ออก" the user reported.
       *  - p-6 gap-4 = standard Dialog spacing; the previous p-5
       *    gap-3 was too tight for legible Thai. */}
      <DialogContent
        className="w-[calc(100vw-2rem)] gap-4 border-white/10 bg-[hsl(0_0%_8%)] p-6 text-zinc-100 sm:max-w-[400px]"
        style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-50">
            <FolderPlus className="h-4 w-4 text-zinc-400" />
            {language === "th" ? "สร้างโปรเจคใหม่" : "Create new project"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {language === "th"
              ? "ตั้งชื่อโปรเจคและเลือกความเป็นส่วนตัว"
              : "Pick a name and set privacy"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Name ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-zinc-300">
            {language === "th" ? "ชื่อโปรเจค" : "Project name"}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            disabled={submitting}
            placeholder={
              language === "th"
                ? "เช่น แคมเปญสงกรานต์ 2026"
                : "e.g. Songkran Campaign 2026"
            }
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            /* 14px input + zinc-400 placeholder = readable on the
             * dark dialog bg AND legible on Thai (descenders/marks
             * need the extra row height). */
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 text-[14px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-500/50"
          />
        </div>

        {/* ── Private toggle (whole row is the hit target) ─────── */}
        <button
          type="button"
          onClick={() => !submitting && setIsPrivate((v) => !v)}
          disabled={submitting}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors",
                isPrivate
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-white/[0.05] text-zinc-400",
              )}
            >
              {isPrivate ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-medium text-zinc-100">
                {language === "th" ? "โปรเจคส่วนตัว" : "Private project"}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-400">
                {isPrivate
                  ? language === "th"
                    ? "เฉพาะคุณเท่านั้นที่เห็น"
                    : "Only you can see"
                  : language === "th"
                    ? "ทีมในองค์กรเดียวกันเห็นได้"
                    : "Team can see"}
              </div>
            </div>
          </div>
          {/* Switch as passive indicator — the whole row click flips
           *  state. pointer-events-none so it doesn't intercept. */}
          <Switch
            checked={isPrivate}
            tabIndex={-1}
            className="pointer-events-none"
            aria-label={
              language === "th" ? "เปิด/ปิดโปรเจคส่วนตัว" : "Toggle private"
            }
          />
        </button>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center rounded-md bg-white/[0.06] px-4 text-[13px] font-medium text-zinc-200 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.09] disabled:opacity-50"
          >
            {language === "th" ? "ยกเลิก" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {language === "th" ? "กำลังสร้าง…" : "Creating…"}
              </>
            ) : (
              <>
                <FolderPlus className="h-3.5 w-3.5" />
                {language === "th" ? "สร้าง" : "Create"}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
