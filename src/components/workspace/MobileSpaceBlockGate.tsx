import { Monitor, Eye, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useWorkspaceShareRole } from "@/store/useWorkspaceShareRole";
import { useLanguage } from "@/contexts/LanguageContext";

function isPhoneViewport() {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent || "";
  const isIPad =
    /iPad/i.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  if (isIPad) return false;

  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const shortestSide = Math.min(window.innerWidth, window.innerHeight);
  const looksLikePhoneUa = /Android.*Mobile|iPhone|iPod|IEMobile|Opera Mini/i.test(
    ua,
  );

  return looksLikePhoneUa || (hasCoarsePointer && shortestSide < 744);
}

/**
 * MobileSpaceBlockGate — soft gate for phone-sized viewports.
 *
 * Pre-fix: hard-blocked the canvas with "เปิดบน Desktop/iPad". Audit
 * said paying customers who pay from their phone can't use what they
 * paid for, and shared LINE/Facebook share-link previews 404'd on
 * mobile.
 *
 * Post-fix: render the canvas in read-only "viewer" mode on mobile.
 * The user can pan / zoom / preview generations / download files, but
 * editing controls are disabled (no Run, no node creation, no
 * autosave) — same UX as the existing share-token viewer mode that
 * already exists for non-owner shared workspaces.
 *
 * The role is set as side-effect of mounting on mobile — and cleared
 * automatically when the component unmounts or the viewport resizes
 * to non-phone. The share-token resolution in Canvas.tsx still wins
 * if the user opens a share link AND is on mobile (real shared
 * sessions take precedence).
 */
export default function MobileSpaceBlockGate({
  children,
}: {
  children: ReactNode;
}) {
  const { language } = useLanguage();
  const [isPhone, setIsPhone] = useState(() => isPhoneViewport());
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const setShare = useWorkspaceShareRole((s) => s.setShare);
  const clearShare = useWorkspaceShareRole((s) => s.clear);
  const currentRole = useWorkspaceShareRole((s) => s.role);

  useEffect(() => {
    const update = () => setIsPhone(isPhoneViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Promote phone visitors to viewer mode if they're not already in
  // a share-token role. We only own the role flip when role === "owner";
  // an existing "editor"/"viewer" was set by the share-token resolver
  // in Canvas.tsx and we don't override.
  useEffect(() => {
    if (!isPhone) return;
    if (currentRole !== "owner") return;
    setShare({
      role: "viewer",
      ownerLabel: "Mobile view-only",
      workspaceId: "mobile-view-only",
      shareId: null,
    });
    return () => {
      // On unmount / viewport flip back to desktop, clear the
      // synthetic viewer role so the user regains editing rights.
      clearShare();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhone]);

  return (
    <>
      {/* Banner — dismissable, non-blocking, sits above the canvas */}
      {isPhone && !bannerDismissed && (
        <div
          className="fixed inset-x-0 top-0 z-[60] flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100 backdrop-blur"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1 leading-snug">
            <span className="font-semibold">
              {language === "th" ? "โหมดดูอย่างเดียว" : "View-only mode"}
            </span>
            {" — "}
            <span className="text-amber-100/80">
              {language === "th"
                ? "เปิดบน Desktop หรือ iPad เพื่อแก้ไข Space นี้ คุณยังเรียกดูและดาวน์โหลดผลงานได้"
                : "Open on Desktop or iPad to edit. You can browse and download generations here."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label={language === "th" ? "ปิดแบนเนอร์" : "Dismiss banner"}
            className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded text-amber-200/70 transition-colors hover:bg-amber-500/15 hover:text-amber-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Render the canvas at all viewport sizes — viewer mode + the
       *  share-role-aware editing gates already implemented across
       *  the canvas components do the actual edit-disabling for us. */}
      <div
        style={
          isPhone && !bannerDismissed
            ? { paddingTop: "calc(env(safe-area-inset-top) + 36px)" }
            : undefined
        }
      >
        {children}
      </div>

      {/* Hint pill in the bottom-right when banner is dismissed */}
      {isPhone && bannerDismissed && (
        <div
          className="pointer-events-none fixed bottom-3 right-3 z-50 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[10.5px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/20 backdrop-blur"
        >
          <Monitor className="h-3 w-3" />
          {language === "th" ? "ดูอย่างเดียว" : "View-only"}
        </div>
      )}
    </>
  );
}
