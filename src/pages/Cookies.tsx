import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { LegalFallbackNotice } from "@/components/legal/LegalFallbackNotice";
import { useLanguage } from "@/contexts/LanguageContext";

const Cookies = () => {
  const { language, t } = useLanguage();

  /**
   * "Reopen banner" — clear the consent flag and reload so the
   * <CookieConsent /> banner mounts fresh and the user can re-pick.
   */
  const reopenBanner = () => {
    try {
      localStorage.removeItem("mf-cookie-consent");
    } catch {
      // ignore — some browsers block localStorage in private mode
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 h-14">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="MediaForge" className="h-10 w-auto" />
          </Link>
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t("cookiesBackToHome")}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("cookiesPageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("cookiesPageLastUpdated")}
        </p>

        <div className="prose prose-invert mt-8 max-w-none text-muted-foreground prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
          <LegalFallbackNotice language={language} />
          {language === "th" ? <ThaiCookies /> : <EnglishCookies />}
        </div>

        {/* ── Manage preferences CTA ──────────────────────────── */}
        <div className="mt-10 rounded-2xl border border-border/50 bg-card/50 p-6">
          <h2 className="text-xl font-semibold text-foreground">
            {t("cookiesManagePreferences")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("cookiesManagePreferencesDesc")}
          </p>
          <div className="mt-4">
            <Button variant="gradient" size="sm" onClick={reopenBanner}>
              {t("cookiesReopenBanner")}
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediaForge. All rights reserved.
      </footer>
    </div>
  );
};

const EnglishCookies = () => (
  <>
    <h2>1. What Cookies Are</h2>
    <p>
      Cookies and similar storage technologies (localStorage, sessionStorage) are small bits of data the browser keeps on your
      device. We use them for a few clearly-scoped purposes — never for cross-site tracking, ad-network retargeting, or selling
      your data.
    </p>

    <h2>2. Categories We Use</h2>

    <h3>Essential (always on)</h3>
    <p>
      Required for the platform to function. You cannot disable these without breaking sign-in, workspace access, or row-level
      security scoping.
    </p>
    <ul>
      <li><strong>Supabase auth session</strong> — keeps you signed in. Stored as a session cookie + localStorage token by Supabase Auth.</li>
      <li><strong>RLS scoping</strong> — every database query carries your auth token so Supabase Row Level Security only returns rows you're allowed to see.</li>
    </ul>

    <h3>Analytics (opt-in)</h3>
    <p>
      Used only after you accept the cookie banner. Until then, PostHog runs in <strong>cookieless memory-only mode</strong> and
      writes nothing to your device.
    </p>
    <ul>
      <li><strong>PostHog</strong> — anonymous product analytics (page views, feature usage, errors). Helps us understand what to build and what to fix. Stored in localStorage + a first-party cookie after consent.</li>
    </ul>

    <h3>Functional (always on, localStorage)</h3>
    <p>Saves your in-app preferences. Lives entirely in your browser; we don't read it.</p>
    <ul>
      <li><strong>Theme</strong> — remembers light/dark mode (`vite-ui-theme`).</li>
      <li><strong>Language</strong> — remembers your current language preference: English, ไทย, Español, 日本語, हिन्दी (<code>mf-lang</code>).</li>
      <li><strong>Workspace cache</strong> — recently-opened spaces, draft canvas state, last-active workspace.</li>
    </ul>

    <h2>3. Cookies & Storage Reference</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Purpose</th>
          <th>Retention</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>sb-*-auth-token</code></td>
          <td>Essential</td>
          <td>Supabase auth session</td>
          <td>Session / refresh token expiry</td>
        </tr>
        <tr>
          <td><code>mf-cookie-consent</code></td>
          <td>Essential</td>
          <td>Records your consent choice</td>
          <td>Until you clear it</td>
        </tr>
        <tr>
          <td><code>mf-lang</code></td>
          <td>Functional</td>
          <td>Language preference (en / th / es / ja / hi)</td>
          <td>Persistent</td>
        </tr>
        <tr>
          <td><code>vite-ui-theme</code></td>
          <td>Functional</td>
          <td>Light / dark theme</td>
          <td>Persistent</td>
        </tr>
        <tr>
          <td><code>ph_*</code></td>
          <td>Analytics</td>
          <td>PostHog distinct ID + session (after consent)</td>
          <td>180 days</td>
        </tr>
      </tbody>
    </table>

    <h2>4. How to Disable</h2>
    <ul>
      <li><strong>Analytics:</strong> click "Decline" on the cookie banner, or use the "Reopen banner" button below to change your choice. Declining keeps PostHog in memory-only mode — no device storage.</li>
      <li><strong>Essential / Functional:</strong> these can't be disabled in the app — clearing your browser's site data for <code>workspace.mediaforge.co</code> will sign you out and reset preferences.</li>
    </ul>

    <h2>5. Third-Party Cookies</h2>
    <p>
      Stripe Checkout (when you make a payment) and Supabase Auth (when you sign in) may set their own cookies on their domains.
      Their cookie policies apply when you interact with their flows.
    </p>

    <h2>6. Changes to This Policy</h2>
    <p>
      We will update this page when our cookie usage changes. Significant changes will be announced via in-app notification.
    </p>

    <h2>7. Contact</h2>
    <p>
      Questions? Email <strong>support@mediaforge.co</strong>.
    </p>
  </>
);

const ThaiCookies = () => (
  <>
    <h2>1. Cookie คืออะไร</h2>
    <p>
      Cookie และเทคโนโลยีจัดเก็บข้อมูลที่คล้ายกัน (localStorage, sessionStorage) คือข้อมูลขนาดเล็กที่
      browser เก็บไว้บนอุปกรณ์ของคุณ เราใช้เพื่อวัตถุประสงค์ที่กำหนดไว้ชัดเจนเพียงไม่กี่อย่าง — ไม่ใช้
      เพื่อติดตามข้ามเว็บไซต์ ไม่ใช้เพื่อ retargeting โฆษณา และไม่ขายข้อมูลของคุณ
    </p>

    <h2>2. หมวดหมู่ที่เราใช้</h2>

    <h3>Essential (เปิดตลอด)</h3>
    <p>
      จำเป็นต่อการทำงานของแพลตฟอร์ม คุณไม่สามารถปิดได้เพราะจะทำให้การ sign-in การเข้าถึง workspace
      หรือ Row Level Security scoping พัง
    </p>
    <ul>
      <li><strong>Supabase auth session</strong> — รักษาสถานะการ sign-in ของคุณ จัดเก็บเป็น session cookie + localStorage token โดย Supabase Auth</li>
      <li><strong>RLS scoping</strong> — ทุก query ฐานข้อมูลจะแนบ auth token ของคุณ เพื่อให้ Supabase Row Level Security คืนเฉพาะ row ที่คุณมีสิทธิ์เห็น</li>
    </ul>

    <h3>Analytics (Opt-in)</h3>
    <p>
      ใช้ต่อเมื่อคุณยอมรับ Banner Cookie แล้วเท่านั้น จนกว่าจะยอมรับ PostHog จะทำงานใน
      <strong>โหมด cookieless memory-only</strong> โดยไม่เขียนข้อมูลลงอุปกรณ์ของคุณ
    </p>
    <ul>
      <li><strong>PostHog</strong> — Product analytics แบบ anonymous (page view, การใช้ฟีเจอร์ error) ช่วยให้เราเข้าใจว่าควรสร้างอะไรและควรแก้อะไร จัดเก็บใน localStorage + first-party cookie หลังให้ความยินยอม</li>
    </ul>

    <h3>Functional (เปิดตลอด ใน localStorage)</h3>
    <p>เก็บการตั้งค่าใน app ของคุณ อยู่ใน browser ของคุณทั้งหมด เราไม่ได้อ่าน</p>
    <ul>
      <li><strong>Theme</strong> — จดจำโหมดสว่าง/มืด (<code>vite-ui-theme</code>)</li>
      <li><strong>ภาษา</strong> — จดจำภาษาที่คุณเลือก: English, ไทย, Español, 日本語, हिन्दी (<code>mf-lang</code>)</li>
      <li><strong>Workspace cache</strong> — space ที่เปิดล่าสุด canvas state แบบร่าง workspace ล่าสุดที่ใช้งาน</li>
    </ul>

    <h2>3. รายการ Cookie และ Storage</h2>
    <table>
      <thead>
        <tr>
          <th>ชื่อ</th>
          <th>หมวด</th>
          <th>วัตถุประสงค์</th>
          <th>ระยะเวลา</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>sb-*-auth-token</code></td>
          <td>Essential</td>
          <td>Supabase auth session</td>
          <td>หมดอายุตาม Session / Refresh token</td>
        </tr>
        <tr>
          <td><code>mf-cookie-consent</code></td>
          <td>Essential</td>
          <td>บันทึกตัวเลือกความยินยอมของคุณ</td>
          <td>จนกว่าคุณจะลบ</td>
        </tr>
        <tr>
          <td><code>mf-lang</code></td>
          <td>Functional</td>
          <td>การตั้งค่าภาษา (en / th / es / ja / hi)</td>
          <td>ถาวร</td>
        </tr>
        <tr>
          <td><code>vite-ui-theme</code></td>
          <td>Functional</td>
          <td>โหมดสว่าง / มืด</td>
          <td>ถาวร</td>
        </tr>
        <tr>
          <td><code>ph_*</code></td>
          <td>Analytics</td>
          <td>PostHog distinct ID + session (หลังยินยอม)</td>
          <td>180 วัน</td>
        </tr>
      </tbody>
    </table>

    <h2>4. วิธีปิด</h2>
    <ul>
      <li><strong>Analytics:</strong> คลิก "ปฏิเสธ" บน Banner Cookie หรือใช้ปุ่ม "เปิด Banner Cookie อีกครั้ง" ด้านล่างเพื่อเปลี่ยนตัวเลือก การปฏิเสธจะทำให้ PostHog อยู่ในโหมด memory-only — ไม่มีการเก็บข้อมูลบนอุปกรณ์</li>
      <li><strong>Essential / Functional:</strong> ปิดใน app ไม่ได้ — การล้างข้อมูลเว็บไซต์ของ <code>workspace.mediaforge.co</code> ใน browser จะทำให้คุณ sign-out และรีเซ็ตการตั้งค่า</li>
    </ul>

    <h2>5. Cookie ของบุคคลที่สาม</h2>
    <p>
      Stripe Checkout (ตอนคุณชำระเงิน) และ Supabase Auth (ตอนคุณ sign-in) อาจตั้ง Cookie ของตนเอง
      ในโดเมนของพวกเขา นโยบาย Cookie ของพวกเขาจะมีผลเมื่อคุณใช้ flow ของพวกเขา
    </p>

    <h2>6. การเปลี่ยนแปลงนโยบาย</h2>
    <p>
      เราจะอัปเดตหน้านี้เมื่อการใช้ Cookie ของเราเปลี่ยน การเปลี่ยนแปลงสำคัญจะแจ้งทาง in-app notification
    </p>

    <h2>7. ติดต่อเรา</h2>
    <p>
      มีคำถาม? ส่งอีเมลที่ <strong>support@mediaforge.co</strong>
    </p>
  </>
);

export default Cookies;
