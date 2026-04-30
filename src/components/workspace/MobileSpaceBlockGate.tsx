import { ArrowLeft, Monitor, Tablet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

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

export default function MobileSpaceBlockGate({
  children,
}: {
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(() => isPhoneViewport());

  useEffect(() => {
    const update = () => setBlocked(isPhoneViewport());
    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  if (!blocked) return <>{children}</>;

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#070707] px-6 py-10 text-white"
      style={{
        fontFamily: "'Prompt', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#121212] p-6 shadow-2xl shadow-black/40">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
          <Monitor className="h-6 w-6" />
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Workspace Space
        </p>
        <h1 className="text-2xl font-bold leading-tight">
          เปิด Space นี้ผ่าน Desktop หรือ iPad
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          หน้า Space เป็น canvas สำหรับจัด node และลากเชื่อม workflow
          จึงปิดการใช้งานบนมือถือเพื่อกันงานพังจากพื้นที่จอและ gesture
          ที่ไม่พอใช้งานจริง
        </p>

        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-200">
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-zinc-400" />
            <span>Desktop / Notebook ใช้งานได้เต็มรูปแบบ</span>
          </div>
          <div className="flex items-center gap-3">
            <Tablet className="h-5 w-5 text-zinc-400" />
            <span>iPad ใช้งานได้สำหรับการเปิดดูและแก้งานเร่งด่วน</span>
          </div>
        </div>

        <Link
          to="/app/workspace"
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับหน้า Workspace
        </Link>
      </section>
    </main>
  );
}
