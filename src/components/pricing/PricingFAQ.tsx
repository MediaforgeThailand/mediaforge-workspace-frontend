import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getLocalizedText, useLanguage, type Language } from "@/contexts/LanguageContext";

interface PricingFAQProps {
  language: Language;
}

const FAQ_ITEMS = [
  {
    q_th: "เครดิตคืออะไร?",
    q_es: "¿Qué son los créditos?",
    q_ja: "クレジットとは何ですか？",
    q_en: "What are credits?",
    a_th: "เครดิตคือหน่วยที่ใช้ในการรัน Flow ต่างๆ บน MediaForge แต่ละ Flow จะใช้เครดิตแตกต่างกันตามความซับซ้อนของงาน",
    a_es: "Los créditos son la unidad que se usa para ejecutar Flows en MediaForge. Cada Flow consume una cantidad distinta según la complejidad del trabajo.",
    a_ja: "クレジットは、MediaForge で Flow を実行するための単位です。Flow ごとに、作業の複雑さに応じて消費するクレジット数が異なります。",
    a_en: "Credits are the currency used to run Flows on MediaForge. Each Flow consumes a different amount of credits based on the complexity of the task.",
  },
  {
    q_th: "เครดิตหมดแล้วเกิดอะไรขึ้น?",
    q_es: "¿Qué pasa si se me acaban los créditos?",
    q_ja: "クレジットがなくなるとどうなりますか？",
    q_en: "What happens when I run out of credits?",
    a_th: "คุณสามารถเติมเครดิตเพิ่มได้ทุกเมื่อผ่านแพ็กเกจ Top-up หรืออัปเกรดแพ็กเกจเพื่อรับเครดิตเพิ่ม",
    a_es: "Puedes recargar créditos en cualquier momento con paquetes Top-up o actualizar tu plan para recibir más créditos cada mes.",
    a_ja: "Top-up パッケージでいつでもクレジットをチャージできます。プランをアップグレードして毎月のクレジットを増やすこともできます。",
    a_en: "You can top-up credits anytime or upgrade your plan to receive more credits each month.",
  },
  {
    q_th: "Cashback on Review คืออะไร?",
    q_es: "¿Qué es Cashback on Review?",
    q_ja: "Cashback on Review とは何ですか？",
    q_en: "What is Cashback on Review?",
    a_th: "เมื่อคุณรีวิวผลงานหลังรัน Flow สำเร็จ คุณจะได้รับเครดิตคืนตามเปอร์เซ็นต์ของแพ็กเกจที่ใช้อยู่",
    a_es: "Cuando revisas el resultado después de ejecutar un Flow correctamente, recibes un porcentaje de créditos de vuelta según tu plan actual.",
    a_ja: "Flow の実行後に生成結果をレビューすると、現在のプランに応じた割合でクレジットが戻ります。",
    a_en: "When you review the output after a successful Flow run, you receive a percentage of credits back based on your current plan.",
  },
  {
    q_th: "เปลี่ยนแพ็กเกจได้ไหม?",
    q_es: "¿Puedo cambiar de plan?",
    q_ja: "プランは変更できますか？",
    q_en: "Can I change my plan?",
    a_th: "ได้ คุณสามารถอัปเกรดหรือดาวน์เกรดแพ็กเกจได้ทุกเมื่อ ระบบจะคำนวณส่วนต่างให้อัตโนมัติ",
    a_es: "Sí. Puedes mejorar o bajar tu plan en cualquier momento. El sistema prorrateará la diferencia automáticamente.",
    a_ja: "はい。いつでもプランをアップグレードまたはダウングレードできます。差額は自動的に日割り計算されます。",
    a_en: "Yes, you can upgrade or downgrade your plan at any time. The system will automatically prorate the difference.",
  },
  {
    q_th: "ราคารวมภาษีหรือไม่?",
    q_es: "¿El precio incluye impuestos?",
    q_ja: "表示価格に税金は含まれますか？",
    q_en: "Does the pricing include tax?",
    a_th: "ราคาที่แสดงยังไม่รวมภาษีมูลค่าเพิ่ม (VAT) ภาษีจะถูกคำนวณเพิ่มเติมตามกฎหมายท้องถิ่น",
    a_es: "Los precios mostrados no incluyen VAT. Los impuestos se calcularán en el pago según la normativa local.",
    a_ja: "表示価格には VAT は含まれていません。税金は、地域の規則に基づいて支払い時に計算されます。",
    a_en: "Prices shown do not include VAT. Tax will be calculated at checkout based on local regulations.",
  },
  {
    q_th: "ซื้อเครดิตเพิ่มได้ไหม?",
    q_es: "¿Puedo comprar más créditos?",
    q_ja: "追加クレジットを購入できますか？",
    q_en: "Can I buy more credits?",
    a_th: "ได้ คุณสามารถซื้อแพ็กเกจ Top-up เพิ่มได้ทุกเมื่อ เครดิต Top-up มีอายุ 12 เดือน",
    a_es: "Sí. Puedes comprar paquetes Top-up en cualquier momento. Los créditos Top-up son válidos durante 12 meses.",
    a_ja: "はい。Top-up パッケージはいつでも購入できます。Top-up クレジットの有効期限は 12 か月です。",
    a_en: "Yes, you can purchase Top-up packages anytime. Top-up credits are valid for 12 months.",
  },
  {
    q_th: "ผลงานที่สร้างใช้เชิงพาณิชย์ได้ไหม?",
    q_es: "¿Puedo usar el contenido generado comercialmente?",
    q_ja: "生成したコンテンツは商用利用できますか？",
    q_en: "Can I use generated content commercially?",
    a_th: "ได้ ผลงานทั้งหมดที่สร้างบน MediaForge สามารถนำไปใช้เชิงพาณิชย์ได้โดยไม่จำกัด",
    a_es: "Sí. Todo el contenido generado en MediaForge se puede usar comercialmente sin restricciones.",
    a_ja: "はい。MediaForge で生成したすべてのコンテンツは、制限なく商用利用できます。",
    a_en: "Yes, all content generated on MediaForge can be used commercially without restrictions.",
  },
];

const localizedQuestion = (item: (typeof FAQ_ITEMS)[number], language: Language) =>
  getLocalizedText(language, {
    en: item.q_en,
    th: item.q_th,
    es: item.q_es,
    ja: item.q_ja,
  });

const localizedAnswer = (item: (typeof FAQ_ITEMS)[number], language: Language) =>
  getLocalizedText(language, {
    en: item.a_en,
    th: item.a_th,
    es: item.a_es,
    ja: item.a_ja,
  });

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
              {localizedQuestion(item, language)}
            </AccordionTrigger>
            <AccordionContent className="text-neutral-400 text-sm pb-5">
              {localizedAnswer(item, language)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};

export default PricingFAQ;
