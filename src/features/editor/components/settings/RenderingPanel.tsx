import React, { useEffect, useState } from "react";
import { Label } from "@/components/openreel-ui";
import { CircuitBoard, Cpu, Lock } from "lucide-react";
import {
  useSettingsStore,
  type RendererMode,
} from "../../stores/settings-store";
import {
  RendererFactory,
  type RendererAdapterInfo,
  isWebGPUSupported,
} from "@/lib/openreel-core";

/**
 * Shape we keep for the live JS-heap readout. Wrapped in a guard since
 * `performance.memory` is Chromium-only and may be absent or zeroed out
 * in privacy-mode windows.
 */
interface HeapStats {
  used: number;
  total: number;
  limit: number;
}

/** Format bytes as MB, one decimal place. */
const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * "Rendering & Performance" panel for the Settings dialog.
 *
 * Goals (in priority order):
 *   1. Make it OBVIOUS that all rendering happens on the user's device.
 *   2. Let the user pick which renderer is used (auto / WebGPU / Canvas2D).
 *   3. Display GPU adapter info so the user can verify which device is doing
 *      the work.
 *   4. Show live memory usage so the user understands resource consumption.
 *   5. Expose the existing preview FPS control as the canonical location.
 */
export const RenderingPanel: React.FC = () => {
  const rendererMode = useSettingsStore((s) => s.rendererMode);
  const setRendererMode = useSettingsStore((s) => s.setRendererMode);
  const previewFps = useSettingsStore((s) => s.previewFps);
  const setPreviewFps = useSettingsStore((s) => s.setPreviewFps);

  // The active renderer is owned by Preview.tsx but the factory keeps the
  // last-created instance accessible. We poll it on mount + when the user
  // changes the mode so the panel always reflects the live state.
  const [adapterInfo, setAdapterInfo] = useState<RendererAdapterInfo | null>(
    null,
  );

  useEffect(() => {
    const refresh = () => {
      const renderer = RendererFactory.getInstance().getCurrentRenderer();
      if (renderer) {
        setAdapterInfo(renderer.getAdapterInfo());
      } else {
        setAdapterInfo(null);
      }
    };
    refresh();
    // Adapter info can shift after a renderer rebuild; poll briefly so the
    // panel updates even if the user is watching it during a mode switch.
    const interval = setInterval(refresh, 1500);
    return () => clearInterval(interval);
  }, [rendererMode]);

  // Live JS-heap readout. Chromium exposes `performance.memory`; other
  // browsers don't, so we gracefully skip the section in those cases.
  const [heap, setHeap] = useState<HeapStats | null>(null);
  useEffect(() => {
    const memoryApi = (
      performance as unknown as { memory?: HeapStats & { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }
    ).memory;
    if (!memoryApi) {
      setHeap(null);
      return;
    }
    const sample = () => {
      const m = (
        performance as unknown as {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }
      ).memory;
      if (!m) return;
      setHeap({
        used: m.usedJSHeapSize,
        total: m.totalJSHeapSize,
        limit: m.jsHeapSizeLimit,
      });
    };
    sample();
    const interval = setInterval(sample, 2000);
    return () => clearInterval(interval);
  }, []);

  const webGPUAvailable = isWebGPUSupported();
  const activeType = adapterInfo?.type ?? "canvas2d";

  const FPS_OPTIONS = [15, 24, 30, 45, 60];

  const renderModeOption = (
    value: RendererMode,
    title: string,
    desc: string,
    disabled = false,
  ) => (
    <label
      key={value}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        rendererMode === value
          ? "border-primary bg-primary/5"
          : "border-border hover:border-border/80 bg-background-elevated/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name="renderer-mode"
        value={value}
        checked={rendererMode === value}
        disabled={disabled}
        onChange={() => setRendererMode(value)}
        className="mt-0.5 accent-primary"
        data-testid={`renderer-mode-${value}`}
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-text-primary">{title}</div>
        <div className="text-xs text-text-muted mt-0.5">{desc}</div>
      </div>
    </label>
  );

  return (
    <div className="space-y-6 pb-4">
      {/* "Local rendering" hero banner — directly addresses the user's
          confusion. Loud and explicit. */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <Lock size={18} className="text-primary mt-0.5 flex-shrink-0" />
        <div className="text-xs">
          <div className="text-sm font-semibold text-text-primary mb-0.5">
            Everything renders on your device
          </div>
          <p className="text-text-muted">
            MediaForge composites preview frames and exports video entirely in
            your browser. Source files, raw frames, and rendered output never
            leave your machine.
          </p>
        </div>
      </div>

      {/* Renderer choice */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <CircuitBoard size={14} className="text-primary" />
          Preview renderer
        </h3>
        <p className="text-xs text-text-muted">
          Both options run locally. WebGPU is faster and supports more effects
          on the GPU; Canvas2D is broader but CPU-only.
        </p>
        <div className="space-y-2">
          {renderModeOption(
            "auto",
            "Auto (recommended)",
            "Use WebGPU when available, fall back to Canvas2D.",
          )}
          {renderModeOption(
            "webgpu",
            "Force WebGPU",
            webGPUAvailable
              ? "Always use the GPU. Warns if no adapter is available."
              : "WebGPU is not available in this browser — selecting will warn and fall back.",
          )}
          {renderModeOption(
            "canvas2d",
            "Force Canvas2D",
            "Skip WebGPU entirely. CPU-only, lower quality, more compatible.",
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* GPU info */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Cpu size={14} className="text-primary" />
          GPU info
        </h3>
        <div
          data-testid="gpu-info-block"
          className="rounded-md border border-border bg-background-elevated/40 p-3 text-xs font-mono space-y-1"
        >
          <InfoRow
            label="Active renderer"
            value={
              activeType === "webgpu"
                ? "WebGPU (hardware)"
                : "Canvas2D (CPU-only)"
            }
          />
          {activeType === "webgpu" && adapterInfo?.adapterInfoAvailable ? (
            <>
              <InfoRow
                label="Adapter vendor"
                value={adapterInfo.vendor || "—"}
              />
              <InfoRow
                label="Architecture"
                value={adapterInfo.architecture || "—"}
              />
              <InfoRow
                label="Device"
                value={adapterInfo.device || "(hidden by browser)"}
              />
              <InfoRow
                label="Compatibility mode"
                value={adapterInfo.isCompatibilityMode ? "yes" : "no"}
              />
              <InfoRow
                label="Max texture size"
                value={
                  adapterInfo.maxTextureDimension2D
                    ? `${adapterInfo.maxTextureDimension2D}px`
                    : "—"
                }
              />
            </>
          ) : activeType === "webgpu" ? (
            <div className="text-text-muted italic">
              Adapter info unavailable (browser hid the details).
            </div>
          ) : (
            <div className="text-text-muted italic">
              No GPU adapter — all compositing is CPU-side.
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Preview FPS — canonical location for this control. The badge on
          the preview pane also exposes it for quick access. */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">
          Preview frame rate
        </h3>
        <p className="text-xs text-text-muted">
          Cap on the preview render loop. Higher values look smoother but use
          more CPU/GPU. Default 30 matches most timeline content.
        </p>
        <div className="flex gap-1.5" data-testid="preview-fps-options">
          {FPS_OPTIONS.map((fps) => (
            <button
              key={fps}
              data-testid={`preview-fps-pick-${fps}`}
              onClick={() => setPreviewFps(fps)}
              className={`px-3 py-1.5 rounded-md text-sm font-mono transition-colors ${
                previewFps === fps
                  ? "bg-primary text-black"
                  : "bg-background-elevated text-text-secondary hover:text-text-primary hover:bg-background-secondary"
              }`}
            >
              {fps} fps
            </button>
          ))}
        </div>
      </div>

      {heap && (
        <>
          <div className="h-px bg-border" />
          {/* Live memory readout — Chromium-only; we render nothing in
              browsers that don't expose performance.memory. */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">
              Memory usage (live)
            </h3>
            <div
              data-testid="memory-usage-block"
              className="rounded-md border border-border bg-background-elevated/40 p-3 text-xs font-mono space-y-1"
            >
              <InfoRow label="JS heap used" value={fmtMB(heap.used)} />
              <InfoRow label="JS heap total" value={fmtMB(heap.total)} />
              <InfoRow label="Heap limit" value={fmtMB(heap.limit)} />
            </div>
            <p className="text-xs text-text-muted">
              Numbers are reported by your browser and refresh every 2s.
              MediaForge releases video frames as soon as they're rendered.
            </p>
          </div>
        </>
      )}

      <Label className="sr-only">end of rendering settings</Label>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex justify-between gap-4">
    <span className="text-text-muted">{label}:</span>
    <span className="text-text-primary truncate" title={value}>
      {value}
    </span>
  </div>
);
