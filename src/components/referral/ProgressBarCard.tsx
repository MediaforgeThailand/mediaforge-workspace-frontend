import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { REFERRAL_CAP, MAX_FRIENDS } from "@/hooks/useReferralStats";

interface Props {
  earnedCredits: number;
  friendsJoined: number;
}

const MILESTONES = [1000, 2000, 3000, 4000, 5000];

const ProgressBarCard = ({ earnedCredits, friendsJoined }: Props) => {
  const percent = Math.min((earnedCredits / REFERRAL_CAP) * 100, 100);
  const capped = earnedCredits >= REFERRAL_CAP;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
          Your Progress
        </p>
        <p className="text-[40px] font-bold leading-tight mt-1" style={{ letterSpacing: "-0.02em" }}>
          {earnedCredits.toLocaleString()} / {REFERRAL_CAP.toLocaleString()} credits
        </p>
      </div>

      <Progress
        value={percent}
        className="h-3"
        aria-label="Referral progress"
        aria-valuenow={earnedCredits}
        aria-valuemin={0}
        aria-valuemax={REFERRAL_CAP}
      />

      {/* Milestone dots */}
      <div className="relative pt-1">
        <div className="absolute left-2 right-2 top-[15px] h-[2px] bg-border" />
        <div className="relative flex justify-between">
          {MILESTONES.map((m) => {
            const reached = earnedCredits >= m;
            return (
              <div key={m} className="flex flex-col items-center gap-2 z-10">
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border-2 transition-colors",
                    reached
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium tabular-nums",
                    reached ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {m.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {friendsJoined} of {MAX_FRIENDS} friends joined
      </p>

      {capped && (
        <Alert className="border-primary/40 bg-primary/5">
          <AlertDescription className="text-sm">
            You've reached the max. Upgrade to Partner for uncapped, withdrawable rewards.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ProgressBarCard;
