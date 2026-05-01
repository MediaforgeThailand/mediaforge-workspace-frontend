/**
 * ShareModeBanner — slim coloured strip across the top of the
 * canvas reminding the user they're not the owner.
 *
 * Renders nothing for owner mode. Renders a sky-tinted "View only"
 * strip for viewer mode and an amber "Editor — runs use your
 * credits" strip for editor mode. Both stay docked above the canvas
 * surface so the affordance is impossible to miss without taking
 * meaningful canvas real-estate.
 */

import { Eye, Pencil } from "lucide-react";
import { useWorkspaceShareRole } from "@/store/useWorkspaceShareRole";
import { useLanguage } from "@/contexts/LanguageContext";

const ShareModeBanner = () => {
  const role = useWorkspaceShareRole((s) => s.role);
  const ownerLabel = useWorkspaceShareRole((s) => s.ownerLabel);
  const { t } = useLanguage();

  if (role === "owner") return null;

  if (role === "viewer") {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[12px] text-sky-100">
        <Eye className="h-3.5 w-3.5" />
        <span>
          {t("workspace.share_banner.viewer_prefix")}{" "}
          <span className="font-medium">{ownerLabel || t("workspace.share_banner.another_user")}</span>
          {t("workspace.share_banner.viewer_suffix")}
        </span>
      </div>
    );
  }

  // editor
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-100">
      <Pencil className="h-3.5 w-3.5" />
      <span>
        {t("workspace.share_banner.editor_prefix")}{" "}
        <span className="font-medium">{ownerLabel || t("workspace.share_banner.another_user")}</span>
        {t("workspace.share_banner.editor_suffix_a")}{" "}
        <span className="font-semibold">{t("workspace.share_banner.editor_suffix_b")}</span>
        {t("workspace.share_banner.editor_suffix_c")}
      </span>
    </div>
  );
};

export default ShareModeBanner;
