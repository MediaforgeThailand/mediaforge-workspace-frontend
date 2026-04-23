import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLanguage } from "@/contexts/LanguageContext";

interface PricingFAQProps {
  language: string;
}

const FAQ_ITEMS = [
  {
    q_th: "เครดิตคืออะไร?",
    q_en: "What are credits?",
    a_th: "เครดิตคือหน่วยที่ใช้ในการรัน Flow ต่างๆ บน MediaForge แต่ละ Flow จะใช้เครดิตแตกต่างกันตามความซับซ้อนของงาน",
    a_en: "Credits are the currency used to run Flows on MediaForge. Each Flow consumes a different amount of credits based on the complexity of the task.",
  },
  {
    q_th: "เครดิตหมดแล้วเกิดอะไรขึ้น?",
    q_en: "What happens when I run out of credits?",
    a_th: "คุณสามารถเติมเครดิตเพิ่มได้ทุกเมื่อผ่านแพ็กเกจ Top-up หรืออัปเกรดแพ็กเกจเพื่อรับเครดิตเพิ่ม",
    a_en: "You can top-up credits anytime or upgrade your plan to receive more credits each month.",
  },
  {
    q_th: "Cashback on Review คืออะไร?",
    q_en: "What is Cashback on Review?",
    a_th: "เมื่อคุณรีวิวผลงานหลังรัน Flow สำเร็จ คุณจะได้รับเครดิตคืนตามเปอร์เซ็นต์ของแพ็กเกจที่ใช้อยู่",
    a_en: "When you review the output after a successful Flow run, you receive a percentage of credits back based on your current plan.",
  },
  {
    q_th: "เปลี่ยนแพ็กเกจได้ไหม?",
    q_en: "Can I change my plan?",
    a_th: "ได้ คุณสามารถอัปเกรดหรือดาวน์เกรดแพ็กเกจได้ทุกเมื่อ ระบบจะคำนวณส่วนต่างให้อัตโนมัติ",
    a_en: "Yes, you can upgrade or downgrade your plan at any time. The system will automatically prorate the difference.",
  },
  {
    q_th: "ราคารวมภาษีหรือไม่?",
    q_en: "Does the pricing include tax?",
    a_th: "ราคาที่แสดงยังไม่รวมภาษีมูลค่าเพิ่ม (VAT) ภาษีจะถูกคำนวณเพิ่มเติมตามกฎหมายท้องถิ่น",
    a_en: "Prices shown do not include VAT. Tax will be calculated at checkout based on local regulations.",
  },
  {
    q_th: "ซื้อเครดิตเพิ่มได้ไหม?",
    q_en: "Can I buy more credits?",
    a_th: "ได้ คุณสามารถซื้อแพ็กเกจ Top-up เพิ่มได้ทุกเมื่อ เครดิต Top-up มีอายุ 12 เดือน",
    a_en: "Yes, you can purchase Top-up packages anytime. Top-up credits are valid for 12 months.",
  },
  {
    q_th: "ผลงานที่สร้างใช้เชิงพาณิชย์ได้ไหม?",
    q_en: "Can I use generated content commercially?",
    a_th: "ได้ ผลงานทั้งหมดที่สร้างบน MediaForge สามารถนำไปใช้เชิงพาณิชย์ได้โดยไม่จำกัด",
    a_en: "Yes, all content generated on MediaForge can be used commercially without restrictions.",
  },
];

const PricingFAQ = ({ language }: PricingFAQProps) => {
  const { t } = useLanguage();
  return (
    <section className="mt-16 px-4 pb-12">
      <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8">
        {t("pricingFaqTitle")}
      </h2>

      <Accordion type="single" collapsible className="max-w-[800px] mx-auto">
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem key={i} value={`faq-${i}`} className="border-b border-neutral-800">
            <AccordionTrigger className="text-left text-white hover:text-purple-400 py-5 text-sm md:text-base">
              {language === "th" ? item.q_th : item.q_en}
            </AccordionTrigger>
            <AccordionContent className="text-neutral-400 text-sm pb-5">
              {language === "th" ? item.a_th : item.a_en}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};

export default PricingFAQ;
