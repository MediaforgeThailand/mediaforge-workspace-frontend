import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo-white.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegalFallbackNotice } from "@/components/legal/LegalFallbackNotice";
import useDocumentTitle from "@/hooks/useDocumentTitle";

const Privacy = () => {
  useDocumentTitle("Privacy Policy — MediaForge");
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
            {t("privacyBackToHome")}
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">
          {t("privacyPageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("privacyPageLastUpdated")}
        </p>

        <div className="prose prose-invert mt-8 max-w-none text-muted-foreground prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground">
          <LegalFallbackNotice language={language} />
          {language === "th" ? <ThaiPrivacy /> : <EnglishPrivacy />}
        </div>
      </main>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MediaForge. All rights reserved.
      </footer>
    </div>
  );
};

const EnglishPrivacy = () => (
  <>
    <h2>1. Information We Collect</h2>
    <p>We collect the following types of information:</p>
    <ul>
      <li><strong>Account Information:</strong> Email address, display name, and profile picture when you create an account.</li>
      <li><strong>Usage Data:</strong> Pages visited, features used, credits consumed, generation history, and interaction patterns.</li>
      <li><strong>Device Information:</strong> Browser type, operating system, screen resolution, device type, and language preferences.</li>
      <li><strong>Content:</strong> Images, prompts, and media you upload or generate using our AI tools.</li>
      <li><strong>Payment Information:</strong> Transaction records processed through our payment provider (Stripe). We do not store credit card numbers.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <ul>
      <li>Providing and improving the Service</li>
      <li>Processing payments and managing credits</li>
      <li>Analyzing usage patterns to improve user experience</li>
      <li>Sending service notifications and updates</li>
      <li>Preventing fraud and ensuring security</li>
      <li>Complying with legal obligations</li>
    </ul>

    <h2>3. Cookies & Tracking</h2>
    <p>We use cookies and similar technologies for:</p>
    <ul>
      <li><strong>Essential Cookies:</strong> Authentication, session management, and security.</li>
      <li><strong>Analytics Cookies:</strong> Understanding how users interact with the Service (with your consent).</li>
      <li><strong>Preference Cookies:</strong> Remembering your language and theme settings.</li>
    </ul>
    <p>You can manage cookie preferences through the cookie consent banner. Declining analytics cookies will disable usage tracking while keeping essential functionality.</p>

    <h2>4. Data Sharing</h2>
    <p>We do not sell your personal data. We may share information with:</p>
    <ul>
      <li><strong>AI Service Providers:</strong> Prompts and images are sent to AI model providers for content generation.</li>
      <li><strong>Payment Processors:</strong> Stripe processes payment transactions.</li>
      <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
    </ul>

    <h2>4a. Named Sub-processors</h2>
    <p>
      The vendors below process your data on MediaForge's behalf. We maintain Data Processing Agreements (DPAs) with each
      named processor. Cross-border transfers are covered under <strong>Thai PDPA Section 28</strong> (adequate-protection
      equivalent contractual clauses).
    </p>
    <table>
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Region</th>
          <th>Purpose</th>
          <th>Data sent</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Supabase</td>
          <td>Singapore (ap-southeast-1)</td>
          <td>Database, auth, storage, edge functions</td>
          <td>All user data</td>
        </tr>
        <tr>
          <td>Stripe Inc.</td>
          <td>USA + Thailand</td>
          <td>Payment processing</td>
          <td>Email, billing address, payment metadata</td>
        </tr>
        <tr>
          <td>PostHog Inc.</td>
          <td>USA</td>
          <td>Product analytics (opt-in)</td>
          <td>Pseudonymised event stream</td>
        </tr>
        <tr>
          <td>SendGrid (Twilio)</td>
          <td>USA</td>
          <td>Transactional email</td>
          <td>Email + name</td>
        </tr>
        <tr>
          <td>OpenAI LLC</td>
          <td>USA</td>
          <td>GPT-Image generation</td>
          <td>User prompt + reference images</td>
        </tr>
        <tr>
          <td>Google LLC (Gemini, Cloud TTS)</td>
          <td>USA</td>
          <td>Banana / Gemini TTS / Google TTS</td>
          <td>User prompt + reference images</td>
        </tr>
        <tr>
          <td>ElevenLabs Inc.</td>
          <td>USA</td>
          <td>Voice generation</td>
          <td>Text scripts</td>
        </tr>
        <tr>
          <td>BytePlus / Volcengine</td>
          <td>Singapore</td>
          <td>Seedance / Seedream / Hyper3D — video, image, 3D generation</td>
          <td>User prompt + reference images</td>
        </tr>
        <tr>
          <td>Replicate Inc.</td>
          <td>USA</td>
          <td>Misc model hosting</td>
          <td>User prompt + reference images</td>
        </tr>
        <tr>
          <td>Anthropic PBC</td>
          <td>USA</td>
          <td>Claude (workspace chat)</td>
          <td>User chat messages</td>
        </tr>
        <tr>
          <td>Tripo3D</td>
          <td>USA</td>
          <td>3D model generation</td>
          <td>User prompt + reference images</td>
        </tr>
        <tr>
          <td>Vercel Inc.</td>
          <td>USA</td>
          <td>Frontend hosting (CDN, Edge Network)</td>
          <td>Page-load HTTP logs</td>
        </tr>
        <tr>
          <td>Cloudflare Inc.</td>
          <td>Global</td>
          <td>DNS + DDoS protection</td>
          <td>HTTP request metadata</td>
        </tr>
      </tbody>
    </table>

    <h2>5. Data Security</h2>
    <p>We implement industry-standard security measures including encryption in transit (TLS), row-level security policies, and secure authentication. However, no system is 100% secure.</p>

    <h2>6. Data Retention</h2>
    <ul>
      <li>Account data is kept while your account is active.</li>
      <li>Generated content is stored until you delete it.</li>
      <li>Analytics data is automatically deleted after 180 days.</li>
      <li>Payment records are kept as required by law.</li>
    </ul>

    <h2>7. Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>Access your personal data</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion of your data</li>
      <li>Withdraw consent for analytics tracking</li>
      <li>Export your data</li>
    </ul>

    <h2>8. Children's Privacy</h2>
    <p>MediaForge is not intended for users under 13 years of age. We do not knowingly collect data from children.</p>

    <h2>9. International Data Transfers</h2>
    <p>Your data may be processed in countries outside your residence. We ensure appropriate safeguards are in place for such transfers.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this policy periodically. We will notify you of significant changes through the Service or via email.</p>

    <h2>11. Contact Us</h2>
    <p>For privacy-related questions, contact us at <strong>privacy@mediaforge.ai</strong></p>
  </>
);

const ThaiPrivacy = () => (
  <>
    <h2>1. ข้อมูลที่เราเก็บรวบรวม</h2>
    <p>เราเก็บรวบรวมข้อมูลประเภทต่อไปนี้:</p>
    <ul>
      <li><strong>ข้อมูลบัญชี:</strong> อีเมล ชื่อที่แสดง และรูปโปรไฟล์เมื่อคุณสร้างบัญชี</li>
      <li><strong>ข้อมูลการใช้งาน:</strong> หน้าที่เข้าชม ฟีเจอร์ที่ใช้ เครดิตที่ใช้ไป ประวัติการสร้าง และรูปแบบการใช้งาน</li>
      <li><strong>ข้อมูลอุปกรณ์:</strong> ประเภท Browser, ระบบปฏิบัติการ, ความละเอียดหน้าจอ, ประเภทอุปกรณ์ และภาษาที่ตั้งค่า</li>
      <li><strong>เนื้อหา:</strong> รูปภาพ, Prompt และสื่อที่คุณอัปโหลดหรือสร้างด้วยเครื่องมือ AI</li>
      <li><strong>ข้อมูลการชำระเงิน:</strong> บันทึกธุรกรรมที่ประมวลผลผ่าน Stripe เราไม่เก็บหมายเลขบัตรเครดิต</li>
    </ul>

    <h2>2. วิธีที่เราใช้ข้อมูลของคุณ</h2>
    <ul>
      <li>ให้บริการและปรับปรุงแพลตฟอร์ม</li>
      <li>ประมวลผลการชำระเงินและจัดการเครดิต</li>
      <li>วิเคราะห์รูปแบบการใช้งานเพื่อปรับปรุง UX</li>
      <li>ส่งการแจ้งเตือนและอัปเดตบริการ</li>
      <li>ป้องกันการฉ้อโกงและรักษาความปลอดภัย</li>
      <li>ปฏิบัติตามข้อกำหนดทางกฎหมาย</li>
    </ul>

    <h2>3. Cookie และการติดตาม</h2>
    <p>เราใช้ Cookie และเทคโนโลยีที่คล้ายกันสำหรับ:</p>
    <ul>
      <li><strong>Essential Cookies:</strong> การยืนยันตัวตน, จัดการ Session และความปลอดภัย</li>
      <li><strong>Analytics Cookies:</strong> ทำความเข้าใจวิธีที่ผู้ใช้โต้ตอบกับบริการ (ด้วยความยินยอมของคุณ)</li>
      <li><strong>Preference Cookies:</strong> จดจำการตั้งค่าภาษาและธีมของคุณ</li>
    </ul>
    <p>คุณสามารถจัดการค่ากำหนด Cookie ผ่าน Banner ขอความยินยอม การปฏิเสธ Analytics Cookies จะปิดการติดตามการใช้งานแต่ฟังก์ชันหลักยังทำงานปกติ</p>

    <h2>4. การแบ่งปันข้อมูล</h2>
    <p>เราไม่ขายข้อมูลส่วนบุคคลของคุณ เราอาจแบ่งปันข้อมูลกับ:</p>
    <ul>
      <li><strong>ผู้ให้บริการ AI:</strong> Prompt และรูปภาพจะถูกส่งไปยังผู้ให้บริการโมเดล AI เพื่อสร้างเนื้อหา</li>
      <li><strong>ผู้ประมวลผลการชำระเงิน:</strong> Stripe ประมวลผลธุรกรรมการชำระเงิน</li>
      <li><strong>ข้อกำหนดทางกฎหมาย:</strong> เมื่อกฎหมายกำหนดหรือเพื่อปกป้องสิทธิ์ของเรา</li>
    </ul>

    <h2>4ก. รายชื่อผู้ประมวลผลย่อย (Sub-processors)</h2>
    <p>
      ผู้ให้บริการด้านล่างประมวลผลข้อมูลของคุณในนามของ MediaForge เรามีสัญญา Data Processing Agreement (DPA)
      กับผู้ประมวลผลแต่ละราย การโอนข้อมูลข้ามประเทศได้รับการคุ้มครองภายใต้
      <strong>พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) มาตรา 28</strong>
      (สัญญาที่มีมาตรการคุ้มครองเทียบเท่า)
    </p>
    <table>
      <thead>
        <tr>
          <th>ผู้ให้บริการ</th>
          <th>ภูมิภาค</th>
          <th>วัตถุประสงค์</th>
          <th>ข้อมูลที่ส่ง</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Supabase</td>
          <td>สิงคโปร์ (ap-southeast-1)</td>
          <td>Database, Auth, Storage, Edge Functions</td>
          <td>ข้อมูลผู้ใช้ทั้งหมด</td>
        </tr>
        <tr>
          <td>Stripe Inc.</td>
          <td>สหรัฐอเมริกา + ไทย</td>
          <td>ประมวลผลการชำระเงิน</td>
          <td>อีเมล ที่อยู่เรียกเก็บ ข้อมูล metadata การชำระเงิน</td>
        </tr>
        <tr>
          <td>PostHog Inc.</td>
          <td>สหรัฐอเมริกา</td>
          <td>Product Analytics (Opt-in)</td>
          <td>Event stream แบบ pseudonymised</td>
        </tr>
        <tr>
          <td>SendGrid (Twilio)</td>
          <td>สหรัฐอเมริกา</td>
          <td>อีเมลธุรกรรม</td>
          <td>อีเมล + ชื่อ</td>
        </tr>
        <tr>
          <td>OpenAI LLC</td>
          <td>สหรัฐอเมริกา</td>
          <td>การสร้างภาพด้วย GPT-Image</td>
          <td>Prompt + รูปอ้างอิง</td>
        </tr>
        <tr>
          <td>Google LLC (Gemini, Cloud TTS)</td>
          <td>สหรัฐอเมริกา</td>
          <td>Banana / Gemini TTS / Google TTS</td>
          <td>Prompt + รูปอ้างอิง</td>
        </tr>
        <tr>
          <td>ElevenLabs Inc.</td>
          <td>สหรัฐอเมริกา</td>
          <td>การสร้างเสียง</td>
          <td>Script ข้อความ</td>
        </tr>
        <tr>
          <td>BytePlus / Volcengine</td>
          <td>สิงคโปร์</td>
          <td>Seedance / Seedream / Hyper3D — สร้างวิดีโอ ภาพ และ 3D</td>
          <td>Prompt + รูปอ้างอิง</td>
        </tr>
        <tr>
          <td>Replicate Inc.</td>
          <td>สหรัฐอเมริกา</td>
          <td>Hosting โมเดลอื่นๆ</td>
          <td>Prompt + รูปอ้างอิง</td>
        </tr>
        <tr>
          <td>Anthropic PBC</td>
          <td>สหรัฐอเมริกา</td>
          <td>Claude (Workspace Chat)</td>
          <td>ข้อความแชทของผู้ใช้</td>
        </tr>
        <tr>
          <td>Tripo3D</td>
          <td>สหรัฐอเมริกา</td>
          <td>การสร้างโมเดล 3D</td>
          <td>Prompt + รูปอ้างอิง</td>
        </tr>
        <tr>
          <td>Vercel Inc.</td>
          <td>สหรัฐอเมริกา</td>
          <td>Hosting Frontend (CDN, Edge Network)</td>
          <td>HTTP log การโหลดหน้า</td>
        </tr>
        <tr>
          <td>Cloudflare Inc.</td>
          <td>ทั่วโลก</td>
          <td>DNS + การป้องกัน DDoS</td>
          <td>Metadata ของ HTTP request</td>
        </tr>
      </tbody>
    </table>

    <h2>5. ความปลอดภัยของข้อมูล</h2>
    <p>เราใช้มาตรการความปลอดภัยมาตรฐานอุตสาหกรรม รวมถึงการเข้ารหัสระหว่างการส่ง (TLS), นโยบาย Row-Level Security และการยืนยันตัวตนที่ปลอดภัย อย่างไรก็ตามไม่มีระบบใดที่ปลอดภัย 100%</p>

    <h2>6. การเก็บรักษาข้อมูล</h2>
    <ul>
      <li>ข้อมูลบัญชีจะถูกเก็บตราบเท่าที่บัญชีของคุณยังใช้งานอยู่</li>
      <li>เนื้อหาที่สร้างจะถูกเก็บจนกว่าคุณจะลบ</li>
      <li>ข้อมูล Analytics จะถูกลบอัตโนมัติหลังจาก 180 วัน</li>
      <li>บันทึกการชำระเงินจะถูกเก็บตามที่กฎหมายกำหนด</li>
    </ul>

    <h2>7. สิทธิ์ของคุณ</h2>
    <p>คุณมีสิทธิ์ในการ:</p>
    <ul>
      <li>เข้าถึงข้อมูลส่วนบุคคลของคุณ</li>
      <li>ขอแก้ไขข้อมูลที่ไม่ถูกต้อง</li>
      <li>ขอลบข้อมูลของคุณ</li>
      <li>ถอนความยินยอมสำหรับการติดตาม Analytics</li>
      <li>ส่งออกข้อมูลของคุณ</li>
    </ul>

    <h2>8. ความเป็นส่วนตัวของเด็ก</h2>
    <p>MediaForge ไม่ได้มีไว้สำหรับผู้ใช้ที่อายุต่ำกว่า 13 ปี เราไม่จงใจเก็บข้อมูลจากเด็ก</p>

    <h2>9. การโอนข้อมูลระหว่างประเทศ</h2>
    <p>ข้อมูลของคุณอาจถูกประมวลผลในประเทศอื่นนอกจากที่คุณอาศัยอยู่ เรารับรองว่ามีมาตรการป้องกันที่เหมาะสมสำหรับการโอนดังกล่าว</p>

    <h2>10. การเปลี่ยนแปลงนโยบายนี้</h2>
    <p>เราอาจอัปเดตนโยบายนี้เป็นระยะ เราจะแจ้งให้คุณทราบเกี่ยวกับการเปลี่ยนแปลงที่สำคัญผ่านบริการหรือทางอีเมล</p>

    <h2>11. ติดต่อเรา</h2>
    <p>สำหรับคำถามเกี่ยวกับความเป็นส่วนตัว ติดต่อเราที่ <strong>privacy@mediaforge.ai</strong></p>
  </>
);

export default Privacy;
