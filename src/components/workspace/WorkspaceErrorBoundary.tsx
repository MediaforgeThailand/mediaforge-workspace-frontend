import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Workspace error boundary — STATIC fallback, NO remount loop.
 *
 * This intentionally does NOT auto-recover or remount on catch.
 * Earlier versions tried both:
 *   1. A "smart" 3-attempt auto-recover → looked stuck behind the
 *      "Workspace ขัดข้อง" card after the budget ran out.
 *   2. A "silent" pass-through that bumped a key on every catch →
 *      if the underlying error was deterministic, every remount
 *      threw again, every catch bumped the key, the user was stuck
 *      in an invisible remount loop with NO escape hatch.
 *
 * Both made the user worse off than no boundary at all. This version
 * catches → freezes → shows TWO buttons: Reload (full page) and
 * back to /app/workspace. The escape hatches are guaranteed even if
 * the underlying state is unrecoverable. Logs the error to console
 * for debugging — that's where developers will look anyway.
 */
class WorkspaceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: `${error.name}: ${error.message}` };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[workspace] Caught error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-zinc-900/80 p-6 shadow-xl">
          <div className="mb-3 flex items-center gap-2 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-base font-semibold">Workspace ขัดข้อง</h2>
          </div>
          <p className="mb-3 text-sm text-zinc-300">
            กดปุ่มด้านล่างเพื่อ reload หรือกลับไปหน้า Dashboard
          </p>
          <div className="mb-4 max-h-32 overflow-auto rounded border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-[11px] text-rose-200">
            {this.state.message}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reload
            </button>
            <a
              href="/app/workspace"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-white/[0.10]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              กลับ Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default WorkspaceErrorBoundary;
