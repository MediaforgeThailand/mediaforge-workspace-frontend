import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalFallbackNotice } from "@/components/legal/LegalFallbackNotice";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const Terms = () => {
  useDocumentTitle("Terms of Service — MediaForge");
  const { language, t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 h-14">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="MediaForge" className="h-10 w-auto" />
          </Link>
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t("termsBackToHome")}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("termsPageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("termsPageLastUpdated")}
        </p>

        <div className="prose prose-invert mt-8 max-w-none text-muted-foreground prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
          <LegalFallbackNotice language={language} />
          {language === "th" ? <ThaiTerms /> : <EnglishTerms />}
        </div>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediaForge. All rights reserved.
      </footer>
    </div>
  );
};

const EnglishTerms = () => (
  <>
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing and using MediaForge ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>

    <h2>2. Description of Service</h2>
    <p>MediaForge is an AI-powered creative platform that provides tools for generating images, videos, audio, and other media content. The Service operates on a credit-based system.</p>

    <h2>3. Account Registration</h2>
    <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</p>

    <h2>4. Credits & Payments</h2>
    <ul>
      <li>Credits are required to use AI generation features.</li>
      <li>Purchased credits are non-refundable unless required by applicable law.</li>
      <li>Prices are listed in Thai Baht (THB) and may change with notice.</li>
      <li>Subscription plans auto-renew unless cancelled before the billing period ends.</li>
    </ul>

    <h2>5. Acceptable Use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Generate illegal, harmful, or abusive content</li>
      <li>Attempt to reverse-engineer or exploit the AI models</li>
      <li>Use the Service for spam, fraud, or deception</li>
      <li>Violate intellectual property rights of others</li>
      <li>Share your account with unauthorized users</li>
    </ul>

    <h2>6. Content Ownership</h2>
    <p>You retain ownership of content you create using MediaForge, subject to our AI provider terms. You grant MediaForge a license to display your content in the Community section if you choose to share it publicly.</p>

    <h2>7. Intellectual Property</h2>
    <p>All MediaForge branding, UI design, and proprietary technology remain the property of MediaForge. AI-generated content may be subject to the terms of underlying AI model providers.</p>

    <h2>8. Limitation of Liability</h2>
    <p>MediaForge is provided "as is" without warranties. We are not liable for any indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 12 months preceding the claim.</p>

    <h2>9. Termination</h2>
    <p>We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, unused credits are forfeited.</p>

    <h2>10. Changes to Terms</h2>
    <p>We may update these terms with notice. Continued use after changes constitutes acceptance.</p>

    <h2>11. Contact</h2>
    <p>For questions about these terms, contact us at <strong>support@mediaforge.ai</strong></p>
  </>
);

const ThaiTerms = () => (
  <>
    <h2>1. การยอมรับเงื่อนไข</h2>
    <p>การเข้าถึงและใช้งาน MediaForge ("บริการ") ถือว่าคุณยอมรับเงื่อนไขการใช้บริการเหล่านี้ หากคุณไม่เห็นด้วย กรุณาหยุดใช้บริการ</p>

    <h2>2. รายละเอียดบริการ</h2>
    <p>MediaForge เป็นแพลตฟอร์มสร้างสรรค์ด้วย AI ที่ให้บริการเครื่องมือสร้างภาพ วิดีโอ เสียง และสื่ออื่นๆ ระบบทำงานด้วยเครดิต</p>

    <h2>3. การสมัครสมาชิก</h2>
    <p>คุณต้องสร้างบัญชีเพื่อใช้บริการ คุณมีหน้าที่รักษาความลับของข้อมูลบัญชีและรับผิดชอบต่อกิจกรรมทั้งหมดภายใต้บัญชีของคุณ</p>

    <h2>4. เครดิตและการชำระเงิน</h2>
    <ul>
      <li>การใช้ฟีเจอร์ AI ต้องใช้เครดิต</li>
      <li>เครดิตที่ซื้อแล้วไม่สามารถขอคืนเงินได้ เว้นแต่กฎหมายกำหนด</li>
      <li>ราคาแสดงเป็นบาทไทย (THB) และอาจเปลี่ยนแปลงโดยมีการแจ้งล่วงหน้า</li>
      <li>แผนสมาชิกจะต่ออายุอัตโนมัติ เว้นแต่ยกเลิกก่อนสิ้นสุดรอบบิล</li>
    </ul>

    <h2>5. การใช้งานที่ยอมรับได้</h2>
    <p>คุณตกลงที่จะไม่:</p>
    <ul>
      <li>สร้างเนื้อหาที่ผิดกฎหมาย เป็นอันตราย หรือไม่เหมาะสม</li>
      <li>พยายาม Reverse-engineer หรือใช้ประโยชน์จากโมเดล AI ในทางมิชอบ</li>
      <li>ใช้บริการเพื่อ Spam, การฉ้อโกง หรือหลอกลวง</li>
      <li>ละเมิดทรัพย์สินทางปัญญาของผู้อื่น</li>
      <li>แชร์บัญชีกับผู้ที่ไม่ได้รับอนุญาต</li>
    </ul>

    <h2>6. ความเป็นเจ้าของเนื้อหา</h2>
    <p>คุณยังคงเป็นเจ้าของเนื้อหาที่สร้างด้วย MediaForge ภายใต้เงื่อนไขของผู้ให้บริการ AI คุณให้สิทธิ์ MediaForge ในการแสดงเนื้อหาของคุณในส่วน Community หากคุณเลือกแชร์แบบสาธารณะ</p>

    <h2>7. ทรัพย์สินทางปัญญา</h2>
    <p>แบรนด์ MediaForge, การออกแบบ UI และเทคโนโลยีเฉพาะเป็นทรัพย์สินของ MediaForge เนื้อหาที่ AI สร้างอาจอยู่ภายใต้เงื่อนไขของผู้ให้บริการโมเดล AI</p>

    <h2>8. ข้อจำกัดความรับผิดชอบ</h2>
    <p>MediaForge ให้บริการ "ตามสภาพ" โดยไม่มีการรับประกัน เราไม่รับผิดชอบต่อความเสียหายทางอ้อมหรือที่เป็นผลสืบเนื่อง ความรับผิดชอบทั้งหมดจำกัดที่จำนวนเงินที่คุณจ่ายในช่วง 12 เดือนก่อนหน้า</p>

    <h2>9. การยุติบริการ</h2>
    <p>เราขอสงวนสิทธิ์ในการระงับหรือยุติบัญชีที่ละเมิดเงื่อนไข เมื่อยุติบริการ เครดิตที่ไม่ได้ใช้จะถูกริบ</p>

    <h2>10. การเปลี่ยนแปลงเงื่อนไข</h2>
    <p>เราอาจอัปเดตเงื่อนไขเหล่านี้โดยมีการแจ้งล่วงหน้า การใช้งานต่อหลังจากมีการเปลี่ยนแปลงถือว่ายอมรับ</p>

    <h2>11. ติดต่อเรา</h2>
    <p>หากมีคำถามเกี่ยวกับเงื่อนไขเหล่านี้ ติดต่อเราที่ <strong>support@mediaforge.ai</strong></p>
  </>
);

export default Terms;
