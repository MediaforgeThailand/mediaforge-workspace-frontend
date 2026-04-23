import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useReferralList, type ReferralWithCommission } from "@/hooks/usePartnerStats";

const ATTR_TONE: Record<ReferralWithCommission["attribution_status"], string> = {
  pending: "bg-muted text-muted-foreground",
  confirmed: "bg-primary/15 text-primary border-primary/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  fraud: "bg-destructive/15 text-destructive border-destructive/30",
};

const fmt = (v: number) =>
  `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const maskUserId = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

const ReferralListCard = () => {
  const [open, setOpen] = useState(true);
  const referralsQ = useReferralList(50);

  return (
    <Card className="p-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between gap-2 text-left">
            <div>
              <h2
                className="text-base font-semibold"
                style={{ letterSpacing: "-0.02em" }}
              >
                Referrals
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                รายชื่อคนที่สมัครผ่าน code ของคุณ พร้อม commission สะสม
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          {referralsQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !referralsQ.data || referralsQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              ยังไม่มี referral — แชร์ลิงก์ของคุณเพื่อเริ่มหาคนสมัคร
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signup</TableHead>
                    <TableHead>Code / Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Commissions</TableHead>
                    <TableHead className="text-right">Total earned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralsQ.data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">
                          {new Date(r.created_at).toLocaleDateString("th-TH")}
                        </div>
                        <div className="font-mono text-muted-foreground text-[11px]">
                          {maskUserId(r.referred_user_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">
                          {r.code ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {r.campaign_label && (
                          <div className="text-[11px] text-muted-foreground">
                            {r.campaign_label}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={ATTR_TONE[r.attribution_status]}
                          variant="outline"
                        >
                          {r.attribution_status}
                        </Badge>
                        {r.risk_score > 30 && (
                          <div className="text-[10px] text-destructive mt-0.5">
                            risk {r.risk_score}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {r.commission_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.commission_sum_thb > 0 ? (
                          fmt(r.commission_sum_thb)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {referralsQ.data.length >= 50 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  แสดง 50 รายการล่าสุด
                </p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default ReferralListCard;
