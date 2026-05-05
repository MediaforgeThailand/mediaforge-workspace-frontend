import { ArrowLeft, Maximize2, Monitor, Smartphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getLocalizedText, useLanguage } from "@/contexts/LanguageContext";

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
 * MobileSpaceBlockGate — hard gate for phone devices.
 *
 * The Space canvas and project dashboard need enough room for node
 * labels, prompt editing, tool chrome, drag handles, and preview
 * controls. Phones now get a clear device message instead of a
 * cramped or partially interactive workspace.
 */
export default function MobileSpaceBlockGate({
  children,
}: {
  children: ReactNode;
}) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [isPhone, setIsPhone] = useState(() => isPhoneViewport());

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

  if (!isPhone) return <>{children}</>;

  const txt = (values: Parameters<typeof getLocalizedText>[1]) =>
    getLocalizedText(language, values);

  // Always send the user back to the dashboard rather than `history.back()`
  // — they often arrive at a Space via a direct link (share / push notif),
  // so back-button could land them outside the app entirely.
  const goBack = () => navigate("/app/workspace", { replace: true });

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <section className="w-full max-w-sm rounded-lg bg-zinc-900/80 p-5 shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-zinc-800 text-zinc-200">
            <Monitor className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
              MediaForge Space
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal text-white">
              {txt({ en: "Use a larger screen", th: "ต้องใช้หน้าจอที่ใหญ่กว่านี้", es: "Usa una pantalla más grande", ja: "より大きな画面で開いてください" })}
            </h1>
          </div>
        </div>

        <div className="space-y-3 text-sm leading-6 text-zinc-300">
          <p>
            {txt({
              en: "Space is not available on phones because the canvas, nodes, prompts, and drag controls need more room to work reliably.",
              th: "ฟีเจอร์ Space ไม่รองรับการใช้งานบนมือถือ เพราะพื้นที่จอไม่พอสำหรับ canvas, node, prompt และการลากเชื่อมต่อให้แม่นยำ",
              es: "Space no está disponible en teléfonos porque el canvas, los nodos, los prompts y los controles de arrastre necesitan más espacio para funcionar bien.",
              ja: "Space はスマートフォンでは利用できません。canvas、node、prompt、ドラッグ操作を安定して使うには、より広い画面が必要です。",
            })}
          </p>
          <p className="text-zinc-400">
            {txt({
              en: "Please open it on a desktop, laptop, iPad, or another larger screen.",
              th: "กรุณาเปิดผ่าน Desktop, Laptop, iPad หรือหน้าจอที่กว้างกว่านี้",
              es: "Ábrelo en desktop, laptop, iPad u otra pantalla más grande.",
              ja: "Desktop、Laptop、iPad など、より大きな画面で開いてください。",
            })}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-medium text-zinc-400">
          <div className="flex items-center gap-2 rounded-md bg-black/25 px-3 py-2">
            <Smartphone className="h-3.5 w-3.5 text-zinc-500" />
            {txt({ en: "Phone blocked", th: "มือถือถูกบล็อก", es: "Teléfono bloqueado", ja: "スマホは非対応" })}
          </div>
          <div className="flex items-center gap-2 rounded-md bg-black/25 px-3 py-2">
            <Maximize2 className="h-3.5 w-3.5 text-zinc-500" />
            {txt({ en: "Bigger screen", th: "ใช้จอใหญ่กว่า", es: "Pantalla más grande", ja: "大きな画面" })}
          </div>
        </div>

        <button
          type="button"
          onClick={goBack}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {txt({ en: "Back to dashboard", th: "กลับหน้าหลัก", es: "Volver al panel", ja: "ダッシュボードに戻る" })}
        </button>
      </section>
    </main>
  );
}
