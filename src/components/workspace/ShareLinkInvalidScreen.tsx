/**
 * ShareLinkInvalidScreen — full-screen error card shown when the
 * share-token resolver returns valid:false. Replaces the canvas
 * for the duration; the user gets a clear reason + a button back to
 * /app/workspace.
 */

import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  reason: "expired" | "revoked" | "invalid" | "network";
}

type TitleKey =
  | "workspace.share_invalid.expired_title"
  | "workspace.share_invalid.revoked_title"
  | "workspace.share_invalid.invalid_title"
  | "workspace.share_invalid.network_title";

type BodyKey =
  | "workspace.share_invalid.expired_body"
  | "workspace.share_invalid.revoked_body"
  | "workspace.share_invalid.invalid_body"
  | "workspace.share_invalid.network_body";

const COPY_KEYS: Record<Props["reason"], { title: TitleKey; body: BodyKey }> = {
  expired: {
    title: "workspace.share_invalid.expired_title",
    body: "workspace.share_invalid.expired_body",
  },
  revoked: {
    title: "workspace.share_invalid.revoked_title",
    body: "workspace.share_invalid.revoked_body",
  },
  invalid: {
    title: "workspace.share_invalid.invalid_title",
    body: "workspace.share_invalid.invalid_body",
  },
  network: {
    title: "workspace.share_invalid.network_title",
    body: "workspace.share_invalid.network_body",
  },
};

const ShareLinkInvalidScreen = ({ reason }: Props) => {
  const { t } = useLanguage();
  const keys = COPY_KEYS[reason];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-zinc-300">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{t(keys.title)}</h2>
        <p className="max-w-md text-sm text-zinc-400">{t(keys.body)}</p>
      </div>
      <Link
        to="/app/workspace"
        className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.04]"
      >
        {t("workspace.share_invalid.back_btn")}
      </Link>
    </div>
  );
};

export default ShareLinkInvalidScreen;
