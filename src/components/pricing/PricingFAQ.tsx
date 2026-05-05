import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLanguage, type Language, type TranslationKey } from "@/contexts/LanguageContext";

interface PricingFAQProps {
  language: Language;
}

const FAQ_ITEMS: Array<{ q: TranslationKey; a: TranslationKey }> = [
  { q: "pricingFaq.items.credits.q", a: "pricingFaq.items.credits.a" },
  { q: "pricingFaq.items.outOfCredits.q", a: "pricingFaq.items.outOfCredits.a" },
  { q: "pricingFaq.items.cashbackReview.q", a: "pricingFaq.items.cashbackReview.a" },
  { q: "pricingFaq.items.changePlan.q", a: "pricingFaq.items.changePlan.a" },
  { q: "pricingFaq.items.tax.q", a: "pricingFaq.items.tax.a" },
  { q: "pricingFaq.items.buyMoreCredits.q", a: "pricingFaq.items.buyMoreCredits.a" },
  { q: "pricingFaq.items.commercialUse.q", a: "pricingFaq.items.commercialUse.a" },
];

const PricingFAQ = (_props: PricingFAQProps) => {
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
              {t(item.q)}
            </AccordionTrigger>
            <AccordionContent className="text-neutral-400 text-sm pb-5">
              {t(item.a)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};

export default PricingFAQ;
