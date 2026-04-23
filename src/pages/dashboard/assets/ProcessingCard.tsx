import { Loader2, GitBranch, AlertTriangle, X, RotateCw } from "lucide-react";

interface Props {
  flowName: string;
  startedAt: number;
  status?: "processing" | "failed";
  errorMessage?: string;
  refunded?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ProcessingCard = ({
  flowName,
  startedAt,
  status = "processing",
  errorMessage,
  refunded,
  onDismiss,
  onRetry,
}: Props) => {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const ago =
    elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;

  const isFailed = status === "failed";

  const isClickable = isFailed && !!onRetry;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onRetry : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRetry?.();
              }
            }
          : undefined
      }
      className={
        isFailed
          ? `relative rounded-2xl bg-card/50 border border-destructive/40 overflow-hidden ${
              isClickable
                ? "cursor-pointer hover:border-destructive/70 hover:bg-card/70 transition focus:outline-none focus:ring-2 focus:ring-destructive/40"
                : ""
            }`
          : "relative rounded-2xl bg-card/50 border border-primary/30 overflow-hidden"
      }
    >
      {/* dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute top-2 right-2 z-10 h-6 w-6 rounded-md bg-black/50 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition"
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <div className="p-3 pb-0">
        <div
          className="relative rounded-xl overflow-hidden border border-strong"
          style={{ aspectRatio: 1 }}
        >
          {!isFailed && (
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                background:
                  "linear-gradient(90deg, hsl(220 25% 10%) 0%, hsl(220 25% 14%) 50%, hsl(220 25% 10%) 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          )}
          {isFailed && (
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 to-destructive/5" />
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            {isFailed ? (
              <>
                <div className="relative w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div className="text-[11px] text-destructive font-semibold uppercase tracking-wider">
                  Failed
                </div>
                {refunded && (
                  <div className="text-[10px] text-emerald-400/90 font-medium">
                    ✓ Credits refunded
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center pulse-ring">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
                <div className="text-[11px] text-primary font-semibold uppercase tracking-wider">
                  Generating…
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-3">
        <div
          className={
            isFailed
              ? "text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1"
              : "text-[10px] uppercase tracking-wider text-primary flex items-center gap-1"
          }
        >
          <GitBranch className="w-2.5 h-2.5" /> Workflow
        </div>
        <div className="mt-1 text-[13px] font-medium truncate text-foreground">
          {flowName}
        </div>
        {isFailed && errorMessage ? (
          <div
            className="mt-1 text-[11px] text-destructive/85 line-clamp-2"
            title={errorMessage}
          >
            {errorMessage}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-muted-foreground/70">
            {isFailed ? `Failed ${ago}` : `Started ${ago}`}
          </div>
        )}

        {isFailed && onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="mt-2 w-full h-7 rounded-md bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive text-[11px] font-medium flex items-center justify-center gap-1.5 transition"
          >
            <RotateCw className="w-3 h-3" /> Try again
          </button>
        )}
      </div>
    </div>
  );
};
