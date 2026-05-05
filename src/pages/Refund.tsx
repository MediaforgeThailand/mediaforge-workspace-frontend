import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { LegalFallbackNotice } from "@/components/legal/LegalFallbackNotice";
import { useLanguage } from "@/contexts/LanguageContext";

const Refund = () => {
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
            {t("refundBackToHome")}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("refundPageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("refundPageLastUpdated")}
        </p>

        <div className="prose prose-invert mt-8 max-w-none text-muted-foreground prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
          <LegalFallbackNotice language={language} />
          {language === "th" ? <ThaiRefund /> : <EnglishRefund />}
        </div>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediaForge. All rights reserved.
      </footer>
    </div>
  );
};

const EnglishRefund = () => (
  <>
    <h2>1. 14-Day Refund Window (First Purchase Only)</h2>
    <p>
      We offer a <strong>14-day "no questions asked" full refund</strong> on your <strong>first monthly credit-pack purchase</strong>.
      If MediaForge isn't working for you, email us within 14 days of the purchase date and we will refund the full amount —
      no questions, no forms, no friction. This guarantee applies once per customer and only to the very first paid plan.
    </p>

    <h2>2. After the 14-Day Window</h2>
    <p>
      Refunds requested after the 14-day window are reviewed case-by-case at MediaForge's discretion. We typically approve
      refunds for:
    </p>
    <ul>
      <li>Verified technical failures that prevented you from using purchased credits</li>
      <li>Double-billing or duplicate charges</li>
      <li>Accidental purchases (e.g. unintended subscription renewal flagged within a few days)</li>
    </ul>
    <p>
      Refunds outside these scenarios may be partially or fully declined. We will always reply with our decision and reasoning.
    </p>

    <h2>3. Used Credits</h2>
    <p>
      <strong>Credits that have already been spent on AI generations are non-refundable</strong> — the underlying compute cost has
      already been paid to our model providers. The only exception is when a system fault on our side caused the credit to be
      consumed without delivering the result you asked for. Our support team will verify the run logs and credit you back if a
      fault is confirmed.
    </p>

    <h2>4. PromptPay Top-ups</h2>
    <ul>
      <li><strong>Within 7 days, no credits used:</strong> full refund.</li>
      <li><strong>Within 7 days, some credits used:</strong> we refund the unused portion at the original price-per-credit.</li>
      <li><strong>After 7 days:</strong> top-up amounts are non-refundable, but the credits remain valid for 12 months from purchase.</li>
    </ul>

    <h2>5. How to Request a Refund</h2>
    <p>
      Email <strong>support@mediaforge.co</strong> from the email address tied to your MediaForge account. Include:
    </p>
    <ul>
      <li>Your <strong>order ID</strong> or transaction reference</li>
      <li>The <strong>reason</strong> for the refund</li>
      <li>Any relevant screenshots if you experienced a technical failure</li>
    </ul>
    <p>We respond to every refund request within <strong>3 business days</strong>.</p>

    <h2>6. Refund Method</h2>
    <p>Refunds are processed back through the original payment method:</p>
    <ul>
      <li><strong>Card payments:</strong> reversed on the original card.</li>
      <li><strong>PromptPay:</strong> bank transfer back to the source account (you may be asked to confirm bank details).</li>
    </ul>

    <h2>7. Processing Time</h2>
    <p>
      Stripe Thailand handles the refund mechanics on our behalf. Once we approve a refund, please allow{" "}
      <strong>5–10 business days</strong> for the funds to land in your account. The exact timing depends on your bank.
    </p>

    <h2>8. Contact</h2>
    <p>
      Questions about this policy? Email <strong>support@mediaforge.co</strong>.
    </p>
  </>
);

const ThaiRefund = () => (
  <>
    <h2>1. ขอคืนเงินภายใน 14 วัน (เฉพาะการซื้อครั้งแรก)</h2>
    <p>
      เรา <strong>คืนเงินเต็มจำนวนภายใน 14 วันโดยไม่ต้องถามเหตุผล</strong> สำหรับ
      <strong>การซื้อแพ็กเครดิตรายเดือนครั้งแรก</strong> ของคุณเท่านั้น
      หาก MediaForge ไม่ตอบโจทย์คุณ ส่งอีเมลหาเราภายใน 14 วันนับจากวันที่ซื้อ
      เราจะคืนเงินเต็มจำนวน ไม่ถามเหตุผล ไม่ต้องกรอกฟอร์ม สิทธิ์นี้ใช้ได้
      ครั้งเดียวต่อลูกค้าและเฉพาะแพ็กเกจแรกที่ชำระเงินเท่านั้น
    </p>

    <h2>2. หลังพ้น 14 วัน</h2>
    <p>การขอคืนเงินหลัง 14 วันจะพิจารณาเป็นกรณีๆ ไปตามดุลพินิจของ MediaForge โดยทั่วไปเรามักอนุมัติให้ในกรณี:</p>
    <ul>
      <li>เกิดข้อผิดพลาดทางเทคนิคที่ตรวจสอบยืนยันได้ จนทำให้คุณใช้เครดิตที่ซื้อไม่ได้</li>
      <li>ถูกเรียกเก็บเงินซ้ำหรือชำระเงินซ้ำซ้อน</li>
      <li>การซื้อโดยไม่ตั้งใจ (เช่น ระบบต่ออายุอัตโนมัติที่แจ้งภายในไม่กี่วัน)</li>
    </ul>
    <p>กรณีนอกเหนือจากนี้อาจคืนเงินบางส่วนหรือไม่อนุมัติ เราจะตอบกลับพร้อมระบุเหตุผลของการตัดสินใจเสมอ</p>

    <h2>3. เครดิตที่ใช้ไปแล้ว</h2>
    <p>
      <strong>เครดิตที่ใช้สร้างเนื้อหา AI ไปแล้วจะไม่สามารถคืนเงินได้</strong>
      เนื่องจากต้นทุน compute ได้ถูกชำระให้ผู้ให้บริการโมเดลไปแล้ว ยกเว้นกรณี
      ที่ระบบของเราเกิดข้อผิดพลาด ทำให้เครดิตถูกหักไปโดยไม่ได้ผลลัพธ์ที่ขอ
      ทีมซัพพอร์ตจะตรวจสอบ log ของการรันและคืนเครดิตให้หากยืนยันว่าเป็นข้อผิดพลาดจริง
    </p>

    <h2>4. การเติมเครดิตผ่าน PromptPay</h2>
    <ul>
      <li><strong>ภายใน 7 วันและยังไม่ได้ใช้เครดิต:</strong> คืนเงินเต็มจำนวน</li>
      <li><strong>ภายใน 7 วันและใช้เครดิตไปบางส่วน:</strong> คืนเงินตามสัดส่วนของเครดิตที่เหลือในอัตราต่อเครดิตเดิม</li>
      <li><strong>หลัง 7 วัน:</strong> ยอดเติมไม่สามารถคืนได้ แต่เครดิตยังใช้ได้ 12 เดือนนับจากวันที่ซื้อ</li>
    </ul>

    <h2>5. วิธีขอคืนเงิน</h2>
    <p>ส่งอีเมลถึง <strong>support@mediaforge.co</strong> จากอีเมลที่ผูกกับบัญชี MediaForge ของคุณ พร้อมข้อมูล:</p>
    <ul>
      <li><strong>Order ID</strong> หรือเลขอ้างอิงธุรกรรม</li>
      <li><strong>เหตุผล</strong> ในการขอคืนเงิน</li>
      <li>Screenshot ที่เกี่ยวข้อง (หากเกิดปัญหาทางเทคนิค)</li>
    </ul>
    <p>เราตอบกลับทุกคำขอคืนเงินภายใน <strong>3 วันทำการ</strong></p>

    <h2>6. วิธีการคืนเงิน</h2>
    <p>เงินที่คืนจะส่งกลับผ่านช่องทางการชำระเงินเดิม:</p>
    <ul>
      <li><strong>ชำระผ่านบัตร:</strong> reverse กลับเข้าบัตรใบเดิม</li>
      <li><strong>PromptPay:</strong> โอนคืนเข้าบัญชีต้นทาง (อาจขอให้ยืนยันรายละเอียดบัญชี)</li>
    </ul>

    <h2>7. ระยะเวลาดำเนินการ</h2>
    <p>
      Stripe Thailand เป็นผู้ดำเนินการคืนเงินให้เรา หลังจากเราอนุมัติ กรุณารอ
      <strong>5–10 วันทำการ</strong> เพื่อให้เงินเข้าบัญชี ระยะเวลาที่แน่นอนขึ้นอยู่กับธนาคารของคุณ
    </p>

    <h2>8. ติดต่อเรา</h2>
    <p>
      มีคำถามเกี่ยวกับนโยบายนี้? ส่งอีเมลที่ <strong>support@mediaforge.co</strong>
    </p>
  </>
);

export default Refund;
