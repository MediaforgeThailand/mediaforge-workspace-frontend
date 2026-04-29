/**
 * ShareLinkInvalidScreen — full-screen error card shown when the
 * share-token resolver returns valid:false. Replaces the canvas
 * for the duration; the user gets a clear reason + a button back to
 * /app/workspace.
 */

import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";

interface Props {
  reason: "expired" | "revoked" | "invalid" | "network";
}

const COPY: Record<Props["reason"], { title: string; body: string }> = {
  expired: {
    title: "This share link has expired",
    body: "The owner can mint a new link from their workspace's Share dialog.",
  },
  revoked: {
    title: "This share link was revoked",
    body: "The workspace owner has disabled this link. Ask them for a fresh one.",
  },
  invalid: {
    title: "This share link isn't valid",
    body: "Double-check the URL with the person who sent it to you.",
  },
  network: {
    title: "Couldn't verify this link",
    body: "Check your connection and try again. If the issue keeps happening, ask the owner to send a fresh link.",
  },
};

const ShareLinkInvalidScreen = ({ reason }: Props) => {
  const c = COPY[reason];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-zinc-300">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{c.title}</h2>
        <p className="max-w-md text-sm text-zinc-400">{c.body}</p>
      </div>
      <Link
        to="/app/workspace"
        className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.04]"
      >
        Back to workspaces
      </Link>
    </div>
  );
};

export default ShareLinkInvalidScreen;
