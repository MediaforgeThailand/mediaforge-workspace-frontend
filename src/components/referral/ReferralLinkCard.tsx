import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface Props {
  code: string | null;
}

const ReferralLinkCard = ({ code }: Props) => {
  const [copied, setCopied] = useState(false);
  const link = code
    ? `https://mediaforge.co/?ref=${code}`
    : "https://mediaforge.co/";

  const shareText = "Join me on MediaForge — AI-powered video & image generation.";

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const shareUrls = {
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
    email: `mailto:?subject=${encodeURIComponent("Join me on MediaForge")}&body=${encodeURIComponent(`${shareText}\n\n${link}`)}`,
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        Your Referral Link
      </p>
      <div className="flex gap-2">
        <Input readOnly value={link} className="font-mono text-sm" />
        <Button onClick={handleCopy} disabled={!code} variant="secondary" className="shrink-0">
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-1.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1.5" /> Copy
            </>
          )}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Share via:</span>
        {(["x", "line", "facebook", "email"] as const).map((p) => (
          <a
            key={p}
            href={shareUrls[p]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors capitalize"
          >
            {p === "x" ? "X" : p === "line" ? "LINE" : p === "facebook" ? "Facebook" : "Email"}
          </a>
        ))}
      </div>
    </div>
  );
};

export default ReferralLinkCard;
