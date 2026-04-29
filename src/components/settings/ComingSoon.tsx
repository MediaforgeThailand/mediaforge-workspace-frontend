import { type LucideIcon } from "lucide-react";

/**
 * Shared empty-state for placeholder Settings sections.
 *
 * Used for items the team / org rollout hasn't shipped yet (Stock
 * downloads, My Team, People, Security SSO). Renders the section's
 * icon + a friendly "ships in the next wave" message so the surface
 * feels intentional instead of broken.
 */
interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

const ComingSoon = ({ icon: Icon, title, description }: ComingSoonProps) => (
  <div className="max-w-2xl">
    <h2 className="text-xl font-semibold text-zinc-100 mb-1">{title}</h2>
    <div className="mt-10 flex flex-col items-center text-center py-16 rounded-xl border border-dashed border-white/10 bg-white/[0.015]">
      <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-zinc-500" />
      </div>
      <p className="text-sm font-medium text-zinc-200 mb-1.5">Coming soon</p>
      <p className="text-xs text-zinc-500 max-w-xs">
        {description ?? "This surface is part of the team / org rollout and will arrive in the next wave."}
      </p>
    </div>
  </div>
);

export default ComingSoon;
