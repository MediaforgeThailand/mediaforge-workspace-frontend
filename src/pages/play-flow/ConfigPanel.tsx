import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Loader2, Play, Clock, Coins, ChevronDown, RotateCcw, AlertCircle, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { ShineBorderV2 } from "@/components/ShineBorderV2";
import FlowReviewForm from "@/components/flow/FlowReviewForm";
import FigmaFileUploadField from "./FigmaFileUploadField";
import ExecutionPanel from "./ExecutionPanel";
import AspectRatioPanel from "./AspectRatioPanel";
import type { InputField, ExposedField, ExecutionState, TextInputField } from "./types";

interface ConfigPanelProps {
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
  creditsBalance: number;
  finalPrice: number;
  hasEnoughCredits: boolean;
  /** When true, the user is unauthenticated — Generate stays clickable and triggers the auth redirect. */
  isGuest?: boolean;
  isRunning: boolean;
  isPricing?: boolean;
  pricingError?: string | null;
  lastRunId: string | null;
  lastCreditCost: number;
  reviewed: boolean;
  setupInstructions?: string;
  flowDescription?: string;
  /** Aggregate node-progress for multi-node pipelines */
  nodeProgress?: { completed: number; total: number; failed?: number };
  /** Credits refunded for partially-failed nodes */
  partialRefundCredits?: number;
  onUpdateValue: (key: string, value: unknown) => void;
  onFileSelect: (nodeId: string, file: File | null) => void;
  onSubmit: () => void;
  onReset: () => void;
  onReviewed: () => void;
  onNavigatePricing: () => void;
  /** When true, render with relative positioning (for embedding in a parent container, e.g. Bundle page) */
  inline?: boolean;
}

/* ─── Field Label ─── */
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold tracking-[0.6px] uppercase text-white/65 mb-2">
      {label}
      {required && <span className="text-[#c15173] ml-1">*</span>}
    </label>
  );
}

/* ─── Styled Select (violet) ─── */
function StyledSelect({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-[42px] rounded-xl pl-3.5 pr-10 text-[13px] font-medium text-white/90 appearance-none cursor-pointer focus:outline-none transition-colors bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] focus:border-violet-400/50"
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

/* ─── Styled Slider (violet) ─── */
function StyledSlider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold text-white/70">{label}</label>
        <span className="text-[11px] font-mono font-semibold text-violet-300 tabular-nums">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full bg-white/[0.08] appearance-none cursor-pointer accent-violet-400"
        style={{
          background: `linear-gradient(to right, #a78bfa 0%, #a78bfa ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}

/* ─── Styled Textarea ─── */
function StyledTextarea({
  label, value, placeholder, required, exampleText, rows = 3, onChange,
}: {
  label: string; value: string; placeholder?: string; required?: boolean;
  exampleText?: string; rows?: number; onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] focus-within:border-violet-400/50 transition-colors">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={exampleText || placeholder || "Enter text..."}
          rows={rows}
          className="w-full bg-transparent rounded-xl px-3.5 py-3 text-[13px] text-white/90 placeholder:text-white/30 resize-none focus:outline-none leading-[1.55]"
        />
      </div>
    </div>
  );
}

export default function ConfigPanel({
  inputs, exposed, textInputs, formValues, fileUploads, filePreviews,
  executionState, statusMessage, pollProgress, elapsedSeconds,
  resultUrl, resultType, resultHistory, errorMessage, wasRefunded,
  flowName, creditsBalance, finalPrice, hasEnoughCredits, isGuest = false, isRunning, isPricing, pricingError,
  lastRunId, lastCreditCost, reviewed,
  setupInstructions, flowDescription,
  nodeProgress, partialRefundCredits,
  onUpdateValue, onFileSelect, onSubmit, onReset, onReviewed, onNavigatePricing,
  inline = false,
}: ConfigPanelProps) {
  const { t } = useLanguage();
  const hasFields = inputs.length > 0 || exposed.length > 0 || textInputs.length > 0;
  const descriptionText = setupInstructions || flowDescription || t("pfConfigDesc");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const requiredFieldsMissing = (() => {
    for (const inp of inputs) {
      if (inp.required && !fileUploads[inp.nodeId]) return true;
    }
    for (const ti of textInputs) {
      if (ti.required) {
        const val = formValues[`__textinput__${ti.nodeId}`] ?? ti.defaultValue;
        if (!val || String(val).trim() === "") return true;
      }
    }
    return false;
  })();

  const textareaFields = exposed.filter(f => f.paramType === "textarea" || f.paramType === "text");
  const aspectRatioFields = exposed.filter(f => f.paramType === "select" && f.paramKey === "aspect_ratio");
  const selectFields = exposed.filter(f => f.paramType === "select" && f.paramKey !== "aspect_ratio");
  const sliderFields = exposed.filter(f => f.paramType === "slider");

  const handleReset = () => {
    const defaults: Record<string, unknown> = {};
    exposed.forEach(f => { defaults[`${f.nodeId}__${f.paramKey}`] = f.defaultValue; });
    textInputs.forEach(ti => { defaults[`__textinput__${ti.nodeId}`] = ti.defaultValue; });
    Object.keys(defaults).forEach(k => onUpdateValue(k, defaults[k]));
  };

  // Guests are always allowed to click Generate — handleSubmit redirects to /auth.
  // NOTE: We intentionally do NOT disable the button while `isPricing` is true.
  // Re-quoting happens on every config change (debounced 500ms) and would otherwise
  // cause the button to flicker to a disabled/dim state, which feels broken to users.
  // The server-side quote at submit time is the source of truth for credits charged.
  const submitDisabled = requiredFieldsMissing || isRunning || !!pricingError || (!isGuest && !hasEnoughCredits);

  return (
    <aside
      ref={panelRef}
      className={
        inline
          ? "relative w-full h-full flex flex-col rounded-3xl glass-panel overflow-hidden"
          : "fixed left-3 top-[56px] bottom-3 z-40 hidden lg:flex w-[400px] min-w-[360px] flex-col rounded-3xl glass-panel overflow-hidden"
      }
    >
      <ShineBorderV2 className="rounded-3xl" />
      {/* Scrollable body */}
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-5 pt-5 pb-2">
        {/* Header */}
        <div className="pb-4">
          <h2 className="font-bold text-[22px] text-white tracking-[-0.5px] leading-[1.15] font-prompt">
            {t("pfConfigure") || "Configure"}
          </h2>
          <p className="text-[12px] text-white/55 leading-[1.55] mt-1.5 font-prompt whitespace-pre-line">
            {descriptionText}
          </p>
        </div>

        <div className="h-px bg-white/[0.06]" />

        <AnimatePresence mode="wait">
          {executionState === "idle" ? (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-col gap-4 pt-4"
            >
              {!hasFields && (
                <div className="bg-white/[0.04] rounded-xl p-5 text-center border border-white/[0.06]">
                  <div className="w-9 h-9 mx-auto rounded-xl bg-violet-400/12 border border-violet-400/25 flex items-center justify-center mb-2">
                    <Sparkles className="w-4 h-4 text-violet-300" />
                  </div>
                  <p className="text-[13px] font-semibold text-white">{t("pfDefaultSettings")}</p>
                  <p className="text-[11px] text-white/55 mt-1">{t("pfNoInputNeeded")}</p>
                </div>
              )}

              {/* File upload inputs */}
              {inputs.map((inp) => (
                <FigmaFileUploadField
                  key={inp.nodeId}
                  field={inp}
                  file={fileUploads[inp.nodeId] ?? null}
                  preview={filePreviews[inp.nodeId]}
                  onSelect={(f) => onFileSelect(inp.nodeId, f)}
                />
              ))}

              {/* TextInput fields */}
              {textInputs.map((ti) => {
                const fieldKey = `__textinput__${ti.nodeId}`;
                const value = formValues[fieldKey] ?? ti.defaultValue;
                return (
                  <StyledTextarea
                    key={fieldKey}
                    label={ti.fieldLabel || ti.label}
                    value={String(value ?? "")}
                    placeholder={ti.placeholder || "Enter text..."}
                    required={ti.required}
                    exampleText={ti.exampleText}
                    rows={2}
                    onChange={(v) => onUpdateValue(fieldKey, v)}
                  />
                );
              })}

              {/* Textarea/text exposed fields */}
              {textareaFields.map((field) => {
                const fieldKey = `${field.nodeId}__${field.paramKey}`;
                const value = formValues[fieldKey] ?? field.defaultValue;
                return (
                  <StyledTextarea
                    key={fieldKey}
                    label={field.paramLabel}
                    value={String(value ?? "")}
                    placeholder={t("pfDescribeVision")}
                    rows={3}
                    onChange={(v) => onUpdateValue(fieldKey, v)}
                  />
                );
              })}

              {/* Aspect Ratio panel */}
              {aspectRatioFields.map((field) => {
                const fieldKey = `${field.nodeId}__${field.paramKey}`;
                const value = formValues[fieldKey] ?? field.defaultValue;
                return (
                  <AspectRatioPanel
                    key={fieldKey}
                    anchorRef={panelRef}
                    value={String(value ?? "Auto")}
                    options={field.options || []}
                    onChange={(v) => onUpdateValue(fieldKey, v)}
                  />
                );
              })}

              {/* Select exposed fields */}
              {selectFields.map((field) => {
                const fieldKey = `${field.nodeId}__${field.paramKey}`;
                const value = formValues[fieldKey] ?? field.defaultValue;
                return (
                  <StyledSelect
                    key={fieldKey}
                    label={field.paramLabel}
                    value={String(value ?? "")}
                    options={field.options || []}
                    onChange={(v) => onUpdateValue(fieldKey, v)}
                  />
                );
              })}

              {/* Advanced (sliders) */}
              {sliderFields.length > 0 && (
                <div>
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="w-full h-10 flex items-center justify-between px-3.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl border border-white/[0.06] transition-colors"
                  >
                    <span className="flex items-center gap-2 text-[12px] font-semibold text-white/75">
                      <Sparkles className="w-3 h-3 text-violet-300" />
                      {t("pfAdvancedSettings")}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-white/55 transition-transform duration-200",
                        advancedOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {advancedOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 flex flex-col gap-4 p-3.5 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                        {sliderFields.map((field) => {
                          const fieldKey = `${field.nodeId}__${field.paramKey}`;
                          const value = Number(formValues[fieldKey] ?? field.defaultValue);
                          return (
                            <StyledSlider
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
                    </motion.div>
                  )}
                </div>
              )}

              <div className="h-2" />
            </motion.div>
          ) : (
            <motion.div
              key="execution"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="pt-4"
            >
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
                nodeProgress={nodeProgress}
                partialRefundCredits={partialRefundCredits}
                onReset={onReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-white/[0.06] flex flex-col gap-2.5 bg-gradient-to-b from-transparent to-black/40">
        {/* Credit + time pill */}
        {executionState === "idle" && (
          <div className="flex items-center gap-2 text-[11px] text-white/55 font-prompt">
            <Clock className="w-3 h-3" />
            <span>~45 วินาที</span>
            <div className="flex-1" />
            <span className="font-mono font-semibold text-emerald-300 tabular-nums">
              {creditsBalance.toLocaleString()} เครดิต
            </span>
          </div>
        )}

        {!isGuest && !hasEnoughCredits && executionState === "idle" && (
          <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-2.5 space-y-1.5">
            <p className="text-[10px] text-rose-300 font-medium">
              {t("pfNeedMore", { count: (finalPrice - creditsBalance).toLocaleString() })}
            </p>
            <div className="flex gap-2">
              <button
                className="text-[10px] h-7 flex-1 rounded-lg border border-rose-500/20 text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1"
                onClick={onNavigatePricing}
              >
                <Crown className="w-2.5 h-2.5" /> {t("pfUpgrade")}
              </button>
              <button
                className="text-[10px] h-7 flex-1 rounded-lg border border-rose-500/20 text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1"
                onClick={onNavigatePricing}
              >
                <Coins className="w-2.5 h-2.5" /> {t("pfTopUp")}
              </button>
            </div>
          </div>
        )}

        {pricingError && executionState === "idle" && (
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-2.5">
            <p className="text-[10px] text-amber-300 font-medium">{pricingError}</p>
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          disabled={submitDisabled}
          onClick={onSubmit}
          className={cn(
            "w-full h-12 rounded-2xl flex items-center justify-between px-4 text-[14px] font-bold tracking-[0.2px] transition-all",
            submitDisabled ? "btn-glass text-white/30 cursor-not-allowed" : "btn-primary-violet"
          )}
        >
          {isRunning ? (
            <span className="flex-1 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("pfGenerating")}
            </span>
          ) : pricingError ? (
            <span className="flex-1 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Pricing unavailable
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2 relative z-[1]">
                <Play className="w-3 h-3 fill-current" />
                {t("pfGenerate")}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-mono font-bold tabular-nums relative z-[1]",
                  submitDisabled ? "bg-white/[0.04]" : "bg-black/25"
                )}
                title={`${finalPrice.toLocaleString()} เครดิต`}
              >
                <Coins className="w-2.5 h-2.5" />
                {isPricing ? "…" : finalPrice.toLocaleString()}
              </span>
            </>
          )}
        </button>

        {requiredFieldsMissing && executionState === "idle" && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-rose-300">
            <AlertCircle className="w-2.5 h-2.5" />
            {t("pfFillRequired")}
          </div>
        )}

        {executionState === "idle" && hasFields && (
          <button
            onClick={handleReset}
            className="h-8 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-medium text-white/55 hover:text-white/80 bg-transparent transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset
          </button>
        )}

        {executionState === "done" && lastRunId && !reviewed && (
          <div className="mt-2">
            <FlowReviewForm
              flowRunId={lastRunId}
              creditsUsed={lastCreditCost}
              cashbackPercent={0}
              onReviewed={onReviewed}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
