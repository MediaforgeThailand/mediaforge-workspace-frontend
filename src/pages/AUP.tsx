import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { useLanguage } from "@/contexts/LanguageContext";

const AUP = () => {
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
            {t("aupBackToHome" as any)}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("aupPageTitle" as any)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("aupPageLastUpdated" as any)}
        </p>

        <div className="prose prose-invert mt-8 max-w-none text-muted-foreground prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
          {language === "th" ? <ThaiAUP /> : <EnglishAUP />}
        </div>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediaForge. All rights reserved.
      </footer>
    </div>
  );
};

const EnglishAUP = () => (
  <>
    <h2>1. Overview</h2>
    <p>
      MediaForge is a creative platform. We support a huge range of legitimate creative work — from marketing to film
      pre-visualisation to art experimentation — but we draw a hard line on the categories below. Using MediaForge to
      generate, host, or distribute prohibited content will get your account suspended or terminated, regardless of how
      much credit balance is on it.
    </p>

    <h2>2. Strictly Prohibited Content</h2>
    <p>You may not use MediaForge to generate, store, or share content that:</p>

    <h3>Illegal content</h3>
    <ul>
      <li><strong>Child sexual abuse material (CSAM)</strong> in any form, including stylised, animated, or AI-generated depictions of minors in sexualised contexts. Zero tolerance — reports go directly to Thai authorities.</li>
      <li>Promotes or provides operational instructions for <strong>terrorism, extremist violence, or mass-casualty attacks</strong>.</li>
      <li>Facilitates <strong>drug trafficking, weapons trafficking, human trafficking,</strong> or other serious crimes under Thai law.</li>
    </ul>

    <h3>Harm to people</h3>
    <ul>
      <li><strong>Harassment, doxxing, or stalking</strong> — content that targets a specific person with the intent to harm, intimidate, or expose them.</li>
      <li><strong>Hate speech</strong> targeting protected groups based on race, ethnicity, nationality, religion, gender, sexual orientation, gender identity, disability, or other protected attributes.</li>
      <li><strong>Non-consensual intimate imagery</strong> ("revenge porn") of any person, real or imagined to resemble a real person.</li>
      <li><strong>Deepfakes of real people without their explicit consent</strong>, including political figures, celebrities, colleagues, ex-partners, or anyone else identifiable. This includes face swaps, voice clones, and "in the style of [real person]" generations used to mislead.</li>
      <li>Content that <strong>promotes self-harm, suicide, or eating disorders.</strong></li>
    </ul>

    <h3>Intellectual property</h3>
    <ul>
      <li><strong>Knowingly generating brand IP</strong> (logos, trade dress, packaging) for commercial use without a licence.</li>
      <li><strong>Copyrighted characters</strong> (Disney, Marvel, anime franchises, etc.) generated for commercial use without rights holder permission.</li>
      <li>Counterfeit goods, fake credentials, fake currency, or other materials designed to deceive.</li>
    </ul>

    <h3>Platform abuse</h3>
    <ul>
      <li><strong>Spam or mass-scale automated misuse</strong> — coordinated bot activity, bulk fake-content generation, credit-stuffing schemes.</li>
      <li><strong>Reverse-engineering, scraping, or probing</strong> the platform, our APIs, or our model providers' APIs.</li>
      <li><strong>Reselling generations</strong> as a "raw API" service to third parties. You can absolutely build products on top of work you create here, but you can't relabel MediaForge as your own paid AI generation service.</li>
      <li>Sharing your account, credits, or API tokens outside your team in a way that circumvents our pricing.</li>
    </ul>

    <h3>Dangerous reasoning</h3>
    <ul>
      <li>Asking the chat assistant for <strong>step-by-step guidance on committing crimes, violence, or self-harm</strong>, or attempting to use prompt-engineering tricks to extract such guidance.</li>
    </ul>

    <h2>3. Enforcement</h2>
    <p>We take a graduated approach:</p>
    <ul>
      <li><strong>Warning:</strong> first-time, low-severity violations may get a warning and a request to remove the content.</li>
      <li><strong>Suspension:</strong> repeated violations or moderate-severity issues may suspend your account pending review.</li>
      <li><strong>Termination:</strong> severe or repeated violations result in permanent account termination. <strong>Account termination forfeits all unused credits</strong> — refunds will not be issued for credits lost to AUP enforcement.</li>
    </ul>
    <p>
      <strong>Severe violations are escalated immediately</strong>, regardless of your history with us. CSAM is reported to the
      Royal Thai Police Cybercrime Division. Terrorism-related material is reported to the relevant authorities under Thai
      law. We cooperate fully with lawful law-enforcement requests.
    </p>

    <h2>4. Reporting Abuse</h2>
    <p>
      If you encounter content on MediaForge that violates this policy, email{" "}
      <strong>abuse@mediaforge.co</strong>. We treat reports confidentially and aim to respond within 1 business day for
      severe issues.
    </p>

    <h2>5. Changes to This Policy</h2>
    <p>
      We may update this policy as the platform and the legal landscape evolve. Significant changes will be announced via
      email or in-app notification.
    </p>

    <h2>6. Contact</h2>
    <p>
      Questions about what's allowed? Email <strong>support@mediaforge.co</strong> before you generate something you're
      unsure about.
    </p>
  </>
);

const ThaiAUP = () => (
  <>
    <h2>1. ภาพรวม</h2>
    <p>
      MediaForge เป็นแพลตฟอร์มสำหรับงานสร้างสรรค์ เรารองรับงานสร้างสรรค์ที่ถูกกฎหมายทุกประเภท
      ตั้งแต่งานการตลาด pre-visualisation ภาพยนตร์ ไปจนถึงงานทดลองศิลปะ
      แต่เราขีดเส้นชัดเจนสำหรับเนื้อหาในหมวดด้านล่าง การใช้ MediaForge สร้าง จัดเก็บ
      หรือกระจายเนื้อหาต้องห้าม จะส่งผลให้บัญชีถูกระงับหรือยุติทันที โดยไม่คำนึงถึง
      ยอดเครดิตคงเหลือ
    </p>

    <h2>2. เนื้อหาต้องห้ามอย่างเด็ดขาด</h2>
    <p>คุณห้ามใช้ MediaForge สร้าง จัดเก็บ หรือแชร์เนื้อหาที่:</p>

    <h3>ผิดกฎหมาย</h3>
    <ul>
      <li><strong>สื่อล่วงละเมิดทางเพศเด็ก (CSAM)</strong> ทุกรูปแบบ รวมถึงภาพ stylised, animation หรือภาพ AI ที่แสดงเด็กในบริบททางเพศ — เราไม่ผ่อนปรนใดๆ และจะส่งรายงานให้หน่วยงานไทยทันที</li>
      <li>ส่งเสริมหรือให้คำแนะนำเชิงปฏิบัติเกี่ยวกับ <strong>การก่อการร้าย ความรุนแรงสุดโต่ง หรือการโจมตีที่ทำให้เสียชีวิตหมู่</strong></li>
      <li>เอื้อต่อ <strong>การค้ายาเสพติด ค้าอาวุธ ค้ามนุษย์</strong> หรืออาชญากรรมร้ายแรงอื่นตามกฎหมายไทย</li>
    </ul>

    <h3>ทำร้ายผู้อื่น</h3>
    <ul>
      <li><strong>คุกคาม เปิดเผยข้อมูลส่วนตัว (doxxing) หรือสะกดรอย</strong> — เนื้อหาที่มุ่งเป้าบุคคลใดบุคคลหนึ่งโดยตั้งใจให้เกิดอันตราย ข่มขู่ หรือเปิดเผยตัวตน</li>
      <li><strong>Hate speech</strong> ที่มุ่งเป้ากลุ่มที่ได้รับการคุ้มครอง บนพื้นฐานของเชื้อชาติ สัญชาติ ศาสนา เพศ รสนิยมทางเพศ อัตลักษณ์ทางเพศ ความพิการ หรือคุณลักษณะที่ได้รับการคุ้มครองอื่นๆ</li>
      <li><strong>ภาพอนาจารโดยไม่ได้รับความยินยอม</strong> ของบุคคลใดๆ ทั้งบุคคลจริงหรือที่จงใจให้เหมือนบุคคลจริง</li>
      <li><strong>Deepfake บุคคลจริงโดยไม่ได้รับความยินยอมอย่างชัดเจน</strong> รวมถึงนักการเมือง ดารา เพื่อนร่วมงาน อดีตคู่รัก หรือบุคคลใดที่ระบุตัวตนได้ ครอบคลุมทั้ง face swap, voice clone และการสร้างงาน "สไตล์ [บุคคลจริง]" ที่ใช้เพื่อทำให้เข้าใจผิด</li>
      <li>เนื้อหาที่ <strong>ส่งเสริมการทำร้ายตัวเอง การฆ่าตัวตาย หรือ eating disorders</strong></li>
    </ul>

    <h3>ทรัพย์สินทางปัญญา</h3>
    <ul>
      <li><strong>การสร้าง brand IP โดยตั้งใจ</strong> (โลโก้ trade dress packaging) เพื่อใช้เชิงพาณิชย์โดยไม่มีใบอนุญาต</li>
      <li><strong>ตัวละครที่มีลิขสิทธิ์</strong> (Disney, Marvel, anime franchise ฯลฯ) สำหรับใช้เชิงพาณิชย์โดยไม่ได้รับอนุญาตจากเจ้าของสิทธิ์</li>
      <li>สินค้าปลอม เอกสารรับรองปลอม เงินปลอม หรือสื่อที่ออกแบบเพื่อหลอกลวง</li>
    </ul>

    <h3>การละเมิดแพลตฟอร์ม</h3>
    <ul>
      <li><strong>Spam หรือใช้ระบบอัตโนมัติในวงกว้างเพื่อการในทางที่ผิด</strong> — bot ที่ประสานงานกัน การสร้างเนื้อหาปลอมจำนวนมาก credit-stuffing</li>
      <li><strong>Reverse-engineering, scraping หรือ probing</strong> แพลตฟอร์ม API ของเรา หรือ API ของผู้ให้บริการโมเดลของเรา</li>
      <li><strong>การขายต่อผลงาน</strong> ในรูปแบบ "raw API" ให้บุคคลที่สาม คุณสามารถสร้าง product ของคุณบนผลงานที่สร้างที่นี่ได้ แต่ห้ามนำ MediaForge มา rebrand เป็นบริการ AI generation ของคุณเองที่เก็บเงิน</li>
      <li>การแชร์บัญชี เครดิต หรือ API token นอกทีมเพื่อหลีกเลี่ยงราคา</li>
    </ul>

    <h3>การให้คำแนะนำที่อันตราย</h3>
    <ul>
      <li>ขอคำแนะนำจาก chat assistant แบบ <strong>step-by-step สำหรับก่ออาชญากรรม ความรุนแรง หรือการทำร้ายตัวเอง</strong> หรือพยายามใช้เทคนิค prompt-engineering เพื่อล้วงคำแนะนำเหล่านั้น</li>
    </ul>

    <h2>3. การบังคับใช้</h2>
    <p>เราใช้แนวทางแบบขั้นบันได:</p>
    <ul>
      <li><strong>เตือน:</strong> การละเมิดครั้งแรกระดับเบาอาจได้รับการเตือนและขอให้ลบเนื้อหา</li>
      <li><strong>ระงับ:</strong> การละเมิดซ้ำหรือระดับกลางอาจถูกระงับบัญชีระหว่างการตรวจสอบ</li>
      <li><strong>ยุติ:</strong> การละเมิดร้ายแรงหรือซ้ำหลายครั้งจะส่งผลให้บัญชีถูกยุติถาวร <strong>การยุติบัญชีจะริบเครดิตคงเหลือทั้งหมด</strong> ไม่มีการคืนเงินสำหรับเครดิตที่สูญเสียจากการบังคับใช้ AUP</li>
    </ul>
    <p>
      <strong>การละเมิดร้ายแรงจะถูกยกระดับทันที</strong> ไม่คำนึงถึงประวัติการใช้งานของคุณ
      CSAM จะถูกรายงานต่อกองบัญชาการตำรวจสืบสวนสอบสวนอาชญากรรมทางเทคโนโลยี
      เนื้อหาที่เกี่ยวข้องกับการก่อการร้ายจะถูกรายงานต่อหน่วยงานที่เกี่ยวข้องตามกฎหมายไทย
      เราให้ความร่วมมืออย่างเต็มที่กับคำขอของหน่วยงานบังคับใช้กฎหมายที่ถูกต้องตามกฎหมาย
    </p>

    <h2>4. การรายงานเนื้อหาที่ละเมิด</h2>
    <p>
      หากคุณพบเนื้อหาบน MediaForge ที่ละเมิดนโยบายนี้ ส่งอีเมลที่
      <strong>abuse@mediaforge.co</strong> เราจะปกป้องความลับของผู้รายงานและตอบกลับภายใน 1 วันทำการสำหรับเรื่องร้ายแรง
    </p>

    <h2>5. การเปลี่ยนแปลงนโยบาย</h2>
    <p>
      เราอาจอัปเดตนโยบายนี้เมื่อแพลตฟอร์มและกฎหมายเปลี่ยนแปลง การเปลี่ยนแปลงสำคัญจะแจ้งทางอีเมลหรือ in-app notification
    </p>

    <h2>6. ติดต่อเรา</h2>
    <p>
      มีคำถามว่าทำอะไรได้บ้าง? ส่งอีเมลที่ <strong>support@mediaforge.co</strong> ก่อนสร้างเนื้อหาที่ไม่แน่ใจ
    </p>
  </>
);

export default AUP;
