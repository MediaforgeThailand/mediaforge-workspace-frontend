/**
 * MobileConfigDrawer — Custom bottom sheet (replaces Vaul drawer)
 *
 * Per handoff v2 mobile spec: backdrop scrim + slide-up sheet + ShineBorder
 * conic gradient + drag handle + close X. Preserves the existing dynamic
 * schema rendering (file uploads, text inputs, exposed select/slider/aspect).
 */

import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnimatePresence, motion } from "framer-motion";
import { ShineBorderV2 } from "@/components/ShineBorderV2";
import FigmaFileUploadField from "./FigmaFileUploadField";
import ExecutionPanel from "./ExecutionPanel";
import AspectRatioInline from "./AspectRatioInline";
import type { InputField, ExposedField, ExecutionState, TextInputField } from "./types";
import { cn } from "@/lib/utils";
import { ChevronDown, RotateCcw, Sliders, X } from "lucide-react";

interface MobileConfigDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputs: InputField[];
  exposed: ExposedField[];
  textInputs: TextInputField[];
  formValues: Record<string, unknown>;
  fileUploads: Record<string, File | null>;
  filePreviews: Record<string, string>;
  executionState: ExecutionState;
  statusMessage: string;
  pollProgress: number;
  elapsedSeconds: number;
  resultUrl: string | null;
  resultType: "video" | "image" | "text";
  resultHistory?: Array<{ url: string; type: "video" | "image" | "text" }>;
  errorMessage: string | null;
  wasRefunded: boolean;
  flowName: string;
  setupInstructions?: string;
  flowDescription?: string;
  onUpdateValue: (key: string, value: unknown) => void;
  onFileSelect: (nodeId: string, file: File | null) => void;
  onReset: () => void;
}

/* ─── Field Label (Mobile) ─── */
function MFieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-[11.5px] font-semibold text-white/70">
        {label}
        {required && <span className="text-[#c15173] ml-1">*</span>}
      </label>
      {hint && <span className="text-[10px] text-white/35">· {hint}</span>}
    </div>
  );
}

/* ─── Mobile Textarea ─── */
function MobileTextarea({
  label, value, placeholder, required, exampleText, onChange,
}: {
  label: string; value: string; placeholder?: string; required?: boolean;
  exampleText?: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <MFieldLabel label={label} required={required} />
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] focus-within:border-violet-400/50 transition-colors">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={exampleText || placeholder || "Enter text..."}
          rows={2}
          className="w-full bg-transparent rounded-xl px-3.5 py-3 text-[13.5px] text-white/90 placeholder:text-white/30 resize-none focus:outline-none leading-[1.55]"
        />
      </div>
    </div>
  );
}

/* ─── Mobile Select ─── */
function MobileSelect({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <MFieldLabel label={label} />
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-11 rounded-xl pl-3.5 pr-10 text-[13px] font-medium text-white/90 appearance-none cursor-pointer focus:outline-none bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] focus:border-violet-400/50 transition-colors"
        >
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-[#141417] text-white">
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
      </div>
    </div>
  );
}

/* ─── Mobile Slider ─── */
function MobileSlider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11.5px] font-semibold text-white/70">{label}</label>
        <span className="text-[11px] font-mono font-semibold text-violet-300 tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-violet-400"
        style={{
          background: `linear-gradient(to right, #a78bfa 0%, #a78bfa ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}

export default function MobileConfigDrawer({
  open, onOpenChange,
  inputs, exposed, textInputs, formValues, fileUploads, filePreviews,
  executionState, statusMessage, pollProgress, elapsedSeconds,
  resultUrl, resultType, resultHistory, errorMessage, wasRefunded,
  flowName, setupInstructions, flowDescription,
  onUpdateValue, onFileSelect, onReset,
}: MobileConfigDrawerProps) {
  const { t } = useLanguage();
  const hasFields = inputs.length > 0 || exposed.length > 0 || textInputs.length > 0;
  const descriptionText = setupInstructions || flowDescription || t("pfConfigDesc");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const textareaFields = exposed.filter(f => f.paramType === "textarea" || f.paramType === "text");
  const aspectRatioFields = exposed.filter(f => f.paramType === "select" && f.paramKey === "aspect_ratio");
  const selectFields = exposed.filter(f => f.paramType === "select" && f.paramKey !== "aspect_ratio");
  const sliderFields = exposed.filter(f => f.paramType === "slider");

  const handleResetFields = () => {
    const defaults: Record<string, unknown> = {};
    exposed.forEach(f => { defaults[`${f.nodeId}__${f.paramKey}`] = f.defaultValue; });
    textInputs.forEach(ti => { defaults[`__textinput__${ti.nodeId}`] = ti.defaultValue; });
    Object.keys(defaults).forEach(k => onUpdateValue(k, defaults[k]));
  };

  const close = () => onOpenChange(false);

  // Lock body scroll when sheet is open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // ESC to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={close}
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm animate-fade-in"
      />

      {/* Sheet */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("pfConfiguration")}
        className="fixed left-2 right-2 bottom-2 z-[90] glass-panel overflow-hidden animate-sheet-up"
        style={{ borderRadius: 24, maxHeight: "85vh" }}
      >
        <ShineBorderV2 className="rounded-[24px]" />

        {/* Drag handle */}
        <div className="relative z-10 flex justify-center pt-2 pb-1">
          <button
            onClick={close}
            aria-label="Close"
            className="w-10 h-1.5 rounded-full bg-white/25 hover:bg-white/40 transition-colors"
          />
        </div>

        {/* Header */}
        <header className="relative z-10 px-5 pb-3 flex items-start justify-between gap-3 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-white tracking-[-0.3px] font-prompt">
              {t("pfConfiguration")}
            </h2>
            <p className="mt-0.5 text-[12px] text-white/55 font-prompt line-clamp-2">
              {descriptionText}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center bg-white/[0.05] hover:bg-white/[0.08] text-white/70 transition-colors"
          >
            <X size={14} />
          </button>
        </header>

        {/* Body — preserves all dynamic field rendering */}
        <div
          ref={panelRef}
          className="relative z-10 flex flex-col gap-4 px-5 pb-6 pt-4 overflow-y-auto scrollbar-hide"
          style={{ maxHeight: "calc(85vh - 96px)" }}
        >
          <AnimatePresence mode="wait">
            {executionState === "idle" ? (
              <motion.div
                key="config"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-4"
              >
                {!hasFields && (
                  <div className="bg-white/[0.04] rounded-xl p-5 text-center border border-white/[0.06]">
                    <p className="text-[13px] font-semibold text-white">{t("pfDefaultSettings")}</p>
                    <p className="text-[11px] text-white/55 mt-1">{t("pfNoInputNeeded")}</p>
                  </div>
                )}

                {/* File uploads */}
                {inputs.map((inp) => (
                  <FigmaFileUploadField
                    key={inp.nodeId}
                    field={inp}
                    file={fileUploads[inp.nodeId] ?? null}
                    preview={filePreviews[inp.nodeId]}
                    onSelect={(f) => onFileSelect(inp.nodeId, f)}
                  />
                ))}

                {/* Text inputs */}
                {textInputs.map((ti) => {
                  const fieldKey = `__textinput__${ti.nodeId}`;
                  const value = formValues[fieldKey] ?? ti.defaultValue;
                  return (
                    <MobileTextarea
                      key={fieldKey}
                      label={ti.fieldLabel || ti.label}
                      value={String(value ?? "")}
                      placeholder={ti.placeholder || "Enter text..."}
                      required={ti.required}
                      exampleText={ti.exampleText}
                      onChange={(v) => onUpdateValue(fieldKey, v)}
                    />
                  );
                })}

                {/* Textarea exposed */}
                {textareaFields.map((field) => {
                  const fieldKey = `${field.nodeId}__${field.paramKey}`;
                  const value = formValues[fieldKey] ?? field.defaultValue;
                  return (
                    <MobileTextarea
                      key={fieldKey}
                      label={field.paramLabel}
                      value={String(value ?? "")}
                      placeholder={t("pfDescribeVision")}
                      onChange={(v) => onUpdateValue(fieldKey, v)}
                    />
                  );
                })}

                {/* Aspect ratio — inline chip grid (touch-friendly) */}
                {aspectRatioFields.map((field) => {
                  const fieldKey = `${field.nodeId}__${field.paramKey}`;
                  const value = formValues[fieldKey] ?? field.defaultValue;
                  return (
                    <AspectRatioInline
                      key={fieldKey}
                      label={field.paramLabel}
                      value={String(value ?? "Auto")}
                      options={field.options || []}
                      onChange={(v) => onUpdateValue(fieldKey, v)}
                    />
                  );
                })}

                {/* Selects */}
                {selectFields.map((field) => {
                  const fieldKey = `${field.nodeId}__${field.paramKey}`;
                  const value = formValues[fieldKey] ?? field.defaultValue;
                  return (
                    <MobileSelect
                      key={fieldKey}
                      label={field.paramLabel}
                      value={String(value ?? "")}
                      options={field.options || []}
                      onChange={(v) => onUpdateValue(fieldKey, v)}
                    />
                  );
                })}

                {/* Sliders (advanced) */}
                {sliderFields.length > 0 && (
                  <div>
                    <button
                      onClick={() => setAdvancedOpen(!advancedOpen)}
                      className="w-full h-11 flex items-center justify-between px-3.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl border border-white/[0.06] transition-colors"
                    >
                      <span className="flex items-center gap-2 text-[12px] font-semibold text-white/75">
                        <Sliders className="w-3 h-3 text-violet-300" />
                        Advanced
                      </span>
                      <ChevronDown className={cn("w-3.5 h-3.5 text-white/55 transition-transform duration-200", advancedOpen && "rotate-180")} />
                    </button>
                    {advancedOpen && (
                      <div className="mt-3 flex flex-col gap-4 p-3.5 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                        {sliderFields.map((field) => {
                          const fieldKey = `${field.nodeId}__${field.paramKey}`;
                          const value = Number(formValues[fieldKey] ?? field.defaultValue);
                          return (
                            <MobileSlider
                              key={fieldKey}
                              label={field.paramLabel}
                              value={value}
                              min={field.min ?? 0}
                              max={field.max ?? 1}
                              step={field.step ?? 0.05}
                              onChange={(v) => onUpdateValue(fieldKey, v)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {hasFields && (
                  <button
                    onClick={handleResetFields}
                    className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-[12px] font-medium text-white/55 hover:text-white/80 bg-transparent transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div key="execution" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ExecutionPanel
                  state={executionState}
                  flowName={flowName}
                  statusMessage={statusMessage}
                  progress={pollProgress}
                  elapsedSeconds={elapsedSeconds}
                  resultUrl={resultUrl}
                  resultType={resultType}
                  resultHistory={resultHistory}
                  errorMessage={errorMessage}
                  wasRefunded={wasRefunded}
                  onReset={onReset}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}
