import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import type { RecentReferral } from "@/hooks/useReferralStats";

interface Props {
  referrals: RecentReferral[];
}

function maskEmail(email: string | null): string {
  if (!email) return "anonymous";
  if (!email.includes("@")) {
    // It's a display name, mask similarly
    return email.length <= 2 ? email + "***" : email.slice(0, 2) + "***";
  }
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return (
        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
          Earned +1,000
        </Badge>
      );
    case "pending":
      return <Badge variant="outline" className="text-muted-foreground">Pending verify</Badge>;
    case "fraud":
    case "rejected":
      return <Badge variant="destructive">Not eligible</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground capitalize">{status}</Badge>;
  }
}

const RecentReferralsCard = ({ referrals }: Props) => {
  return (
    <Card className="p-6 space-y-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        Recent Referrals
      </p>
      {referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No referrals yet. Share your link to get started.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {referrals.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{maskEmail(r.email)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Joined {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </p>
              </div>
              {statusBadge(r.attribution_status)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default RecentReferralsCard;
