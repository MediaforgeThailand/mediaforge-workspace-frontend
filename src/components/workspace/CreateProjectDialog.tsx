/**
 * CreateProjectDialog — replaces the native browser `prompt()` that
 * used to handle "New project" everywhere. The native prompt is ugly
 * (system-styled), can't carry settings, and ignores the dark theme.
 *
 * What this dialog collects:
 *   - Name (required, max 80 chars; default "โปรเจคไม่มีชื่อ" if blank)
 *   - Description (optional, max 500 chars)
 *   - Color accent (palette of 8 brand-aligned hues; "Auto" picks
 *     the next index in the palette by current project count)
 *   - Privacy toggle:
 *       PRIVATE  → only owner sees on dashboards, default for new
 *       VISIBLE TO TEAM → org/team members see it (full collab path
 *       lands when team membership ships; today the flag is just
 *       persisted to workspace_projects.is_private so the choice
 *       isn't lost between now and launch).
 *
 * The submit handler is owned by the parent — pass `onCreate(meta)`
 * and the dialog hands you the captured values (the parent decides
 * whether to call the local store, push to the server, navigate,
 * etc.). Keeping the parent in control mirrors how
 * `DeleteAccountDialog` and `BuyCreditsDialog` work.
 */

import { useEffect, useState } from "react";
import { Loader2, FolderPlus, Lock, Users, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export interface CreateProjectMeta {
  name: string;
  description: string | null;
  color: string;
  isPrivate: boolean;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Suggested default for the colour swatch (rotated by parent so
   *  successive new projects don't all pick the same hue). */
  defaultColor?: string;
  /** Called when the user clicks "Create". Async — dialog stays
   *  open with a spinner until the promise settles, then closes
   *  on success or surfaces the error inline on failure. */
  onCreate: (meta: CreateProjectMeta) => Promise<void> | void;
}

/** Same swatch palette `pages/workspace/index.tsx` already uses for
 *  the projects list. Keeping the constants in sync gives the
 *  dialog the exact colours the dashboard will render later. */
const COLOR_SWATCHES = [
  "hsl(258 90% 66%)",  // violet
  "hsl(35 90% 55%)",   // amber
  "hsl(160 84% 39%)",  // emerald
  "hsl(0 84% 60%)",    // red
  "hsl(217 91% 60%)",  // blue
  "hsl(316 73% 60%)",  // pink
  "hsl(43 96% 56%)",   // yellow
  "hsl(173 58% 39%)",  // teal
];

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultColor,
  onCreate,
}: CreateProjectDialogProps) {
  const { language } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(defaultColor ?? COLOR_SWATCHES[0]);
  const [isPrivate, setIsPrivate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the dialog re-opens — caller may pop it again
  // moments later for a follow-up project; old state shouldn't leak.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setColor(defaultColor ?? COLOR_SWATCHES[0]);
      setIsPrivate(true);
      setSubmitting(false);
      setError(null);
    }
  }, [open, defaultColor]);

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
      const finalDescription = description.trim().slice(0, 500) || null;
      await onCreate({
        name: finalName,
        description: finalDescription,
        color,
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
      <DialogContent className="border-white/10 bg-[hsl(0_0%_8%)] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <FolderPlus className="h-4 w-4" />
            {language === "th" ? "สร้างโปรเจคใหม่" : "Create new project"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-zinc-400">
            {language === "th"
              ? "โปรเจคจะรวม Spaces, ผลงาน และไฟล์อ้างอิงไว้ด้วยกัน — ปรับชื่อและความเป็นส่วนตัวภายหลังได้"
              : "A project bundles your Spaces, generations and reference assets. You can rename or change privacy later."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Name ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
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
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500/40"
          />
          <p className="text-[10.5px] text-zinc-500">
            {language === "th"
              ? "ชื่อสูงสุด 80 ตัวอักษร — ปล่อยว่างได้ ระบบจะใช้ \"โปรเจคไม่มีชื่อ\""
              : "Up to 80 characters — leave blank for \"Untitled project\""}
          </p>
        </div>

        {/* ── Color ───────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th" ? "สีหมุดโปรเจค" : "Project chip color"}
          </label>
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                disabled={submitting}
                aria-label={`Color ${c}`}
                className={cn(
                  "relative h-7 w-7 rounded-md transition-all",
                  c === color
                    ? "ring-2 ring-white ring-offset-2 ring-offset-[hsl(0_0%_8%)]"
                    : "hover:scale-110",
                )}
                style={{ background: c }}
              >
                {c === color && (
                  <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Description (optional) ─────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th"
              ? "รายละเอียด (ไม่บังคับ)"
              : "Description (optional)"}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            disabled={submitting}
            rows={2}
            placeholder={
              language === "th"
                ? "บอกเพื่อนร่วมทีมว่าโปรเจคนี้สำหรับอะไร"
                : "Tell teammates what this project is for"
            }
            className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500/40"
          />
          <p className="text-right text-[10.5px] text-zinc-500">
            {description.length}/500
          </p>
        </div>

        {/* ── Privacy ─────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-300">
            {language === "th" ? "การเข้าถึง" : "Visibility"}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <PrivacyOption
              active={isPrivate}
              onClick={() => !submitting && setIsPrivate(true)}
              icon={<Lock className="h-3.5 w-3.5" />}
              title={language === "th" ? "ส่วนตัว" : "Private"}
              caption={
                language === "th"
                  ? "เฉพาะคุณเท่านั้นที่เห็น"
                  : "Only you can see"
              }
            />
            <PrivacyOption
              active={!isPrivate}
              onClick={() => !submitting && setIsPrivate(false)}
              icon={<Users className="h-3.5 w-3.5" />}
              title={language === "th" ? "ทีมเห็นได้" : "Visible to team"}
              caption={
                language === "th"
                  ? "ทีมในองค์กรเดียวกันเห็นได้"
                  : "Org / team members can see"
              }
            />
          </div>
          <p className="text-[10.5px] text-zinc-500">
            {language === "th"
              ? "ปรับได้ทีหลังในหน้า Settings ของโปรเจค"
              : "You can change this later in project settings."}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[12px] text-red-300">
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
                {language === "th" ? "สร้างโปรเจค" : "Create project"}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyOption({
  active,
  onClick,
  icon,
  title,
  caption,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors",
        active
          ? "bg-violet-500/15 ring-1 ring-inset ring-violet-500/40"
          : "bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] hover:bg-white/[0.07]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[12.5px] font-semibold",
          active ? "text-violet-200" : "text-zinc-200",
        )}
      >
        {icon}
        {title}
      </div>
      <div
        className={cn(
          "text-[10.5px] leading-snug",
          active ? "text-violet-200/80" : "text-zinc-500",
        )}
      >
        {caption}
      </div>
    </button>
  );
}
