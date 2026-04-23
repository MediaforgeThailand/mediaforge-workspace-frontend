import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Feature = { text: string; highlighted?: boolean };

const tiers: {
  name: string;
  price: string;
  period: string;
  desc: string;
  features: Feature[];
  cta: string;
  highlight: boolean;
}[] = [
  {
    name: "Starter",
    price: "฿540",
    period: "/month",
    desc: "Perfect for small businesses getting started with AI content.",
    features: [
      { text: "67,500 Credits/month" },
      { text: "Access to all Flows (Official + Community)" },
      { text: "Unlimited Flow Executions" },
      { text: "Standard Support" },
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Growth",
    price: "฿1,290",
    period: "/month",
    desc: "For growing brands that need volume and variety.",
    features: [
      { text: "161,250 Credits/month" },
      { text: "Access to all Flows (Official + Community)" },
      { text: "Unlimited Flow Executions" },
      { text: "Priority Support" },
      { text: "5% off Official Flows", highlighted: true },
      { text: "Flow Request" },
    ],
    cta: "Start Growing",
    highlight: true,
  },
  {
    name: "Professional",
    price: "฿1,990",
    period: "/month",
    desc: "For professionals who need more power and discounts.",
    features: [
      { text: "248,750 Credits/month" },
      { text: "Access to all Flows (Official + Community)" },
      { text: "Unlimited Flow Executions" },
      { text: "Priority Support" },
      { text: "10% off Official Flows", highlighted: true },
      { text: "Flow Request" },
    ],
    cta: "Go Pro",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "฿2,990",
    period: "/month",
    desc: "For agencies and enterprises with high-volume needs.",
    features: [
      { text: "373,750 Credits/month" },
      { text: "Access to all Flows (Official + Community)" },
      { text: "Unlimited Flow Executions" },
      { text: "Priority Support" },
      { text: "20% off Official Flows", highlighted: true },
      { text: "Flow Request" },
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

export default function PricingSection() {
  const navigate = useNavigate();
  return (
    <section id="pricing" className="mx-auto max-w-[1600px] px-8 py-24">
      <div className="mx-auto max-w-[1536px]">
        <div className="mb-14 text-center">
          <h2 className="mb-4 text-[40px] font-bold leading-tight text-foreground">Simple, Transparent Pricing</h2>
          <p className="mx-auto max-w-[500px] text-base text-muted-foreground">
            Choose the plan that fits your content needs. All plans include access to our AI Flow Marketplace.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, i) => (
            <Card
              key={i}
              className={`glass-border relative flex flex-col border-0 ${
                tier.highlight
                  ? "bg-card shadow-xl shadow-primary/10"
                  : "bg-card"
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-foreground">{tier.name}</CardTitle>
                <div className="mt-3">
                  <span className="text-[40px] font-bold leading-none text-foreground">{tier.price}</span>
                  <span className="ml-1 text-sm text-muted-foreground">{tier.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pt-2">
                <ul className="mb-8 flex flex-1 flex-col gap-3">
                  {tier.features.map((f, j) => (
                    <li key={j} className={`flex items-start gap-2.5 text-sm ${f.highlighted ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      <Check size={14} className="mt-0.5 shrink-0 text-green-500" />
                      {f.text}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => navigate("/auth")}
                  className={`h-[50px] w-full rounded-xl text-sm font-medium ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {tier.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Save up to 20% with annual plans.{" "}
          <a href="mailto:support@mediaforge.ai" className="text-foreground underline">
            Contact us
          </a>{" "}
          for custom enterprise pricing.
        </p>
      </div>
    </section>
  );
}
