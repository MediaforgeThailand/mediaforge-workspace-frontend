import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const PartnerCTACard = () => {
  const navigate = useNavigate();
  return (
    <Card className="border-2 border-primary/50 bg-card p-6 sticky top-4 space-y-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-primary font-semibold">
        Earn Real Money
      </p>
      <h3 className="text-xl font-bold leading-tight" style={{ letterSpacing: "-0.02em" }}>
        Become a MediaForge Partner
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        สมัคร Partner Program รับค่าตอบแทน 30% ของเงินที่ user ที่คุณแนะนำชำระจริง พร้อมถอนเข้าบัญชีธนาคารได้
      </p>
      <Button className="w-full" onClick={() => navigate("/app/partner/apply")}>
        Apply for Partner Program
      </Button>
    </Card>
  );
};

export default PartnerCTACard;
