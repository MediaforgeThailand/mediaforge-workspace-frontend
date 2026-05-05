import { useLanguage } from "@/contexts/LanguageContext";

interface PageLoadingAnimProps {
  label?: string;
}

/**
 * Page-level loading state — pure CSS spinner.
 *
 * Replaces the previous 878 KB /loading.gif. The spinner is a single
 * SVG circle with `animate-spin` (Tailwind's built-in 1s linear
 * rotation), so it renders instantly with no network request and
 * costs ~0 KB on the wire.
 *
 * Component API is unchanged from the gif-based version — callers
 * continue to render `<PageLoadingAnim />` or `<PageLoadingAnim label="…" />`.
 */
const PageLoadingAnim = ({ label }: PageLoadingAnimProps) => {
  const { t } = useLanguage();
  const loadingLabel = label ?? t("ui.loading");
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4" role="status" aria-label={loadingLabel}>
        <svg
          className="animate-spin h-16 w-16 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        {label && <p className="text-muted-foreground">{label}</p>}
        <span className="sr-only">{loadingLabel}</span>
      </div>
    </div>
  );
};

export default PageLoadingAnim;
