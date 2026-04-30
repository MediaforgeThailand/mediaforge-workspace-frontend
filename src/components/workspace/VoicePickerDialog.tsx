import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  GOOGLE_VOICES,
  GOOGLE_VOICE_TINT_GRADIENT,
  GOOGLE_VOICE_USE_CASES,
  type GoogleVoice,
  type GoogleVoiceLean,
  type GoogleVoiceUseCase,
} from "./googleTtsVoices";
import { GEMINI_VOICES as GEMINI_TTS_VOICES, type GeminiVoice as GeminiTTSVoice } from "./geminiVoices";
import {
  ELEVENLABS_VOICES,
  ELEVENLABS_VOICE_TINT_GRADIENT,
  type ElevenLabsVoice,
} from "./elevenlabsVoices";

type ProviderTab = "google" | "gemini" | "elevenlabs";
type VoiceRow = GoogleVoice;
type VoiceLean = GoogleVoiceLean;
type VoiceUseCase = GoogleVoiceUseCase;

type ElevenLabsApiVoice = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  preview_url?: string | null;
  lean?: "male" | "female" | "neutral";
  accent?: string | null;
  use_case?: string | null;
};

const PROVIDER_TABS: Array<{ id: ProviderTab; label: string }> = [
  { id: "google", label: "Google TTS" },
  { id: "gemini", label: "Gemini" },
  { id: "elevenlabs", label: "ElevenLabs" },
];

const VOICE_USE_CASES = GOOGLE_VOICE_USE_CASES;

const ALL_TINT_GRADIENT: Record<GoogleVoice["tint"], string> = {
  ...GOOGLE_VOICE_TINT_GRADIENT,
  ...ELEVENLABS_VOICE_TINT_GRADIENT,
};

interface Props {
  open: boolean;
  value?: string;
  modelName?: string;
  onClose: () => void;
  onSelect: (voiceId: string, modelName: string) => void;
}

function providerForModel(modelName?: string, voiceId?: string): ProviderTab {
  const model = String(modelName ?? "");
  if (model.startsWith("elevenlabs-") || model.startsWith("eleven_")) return "elevenlabs";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("google-")) return "google";
  if (ELEVENLABS_VOICES.some((v) => v.id === voiceId)) return "elevenlabs";
  if (GEMINI_TTS_VOICES.some((v) => v.id === voiceId)) return "gemini";
  return "google";
}

function modelForProvider(provider: ProviderTab, currentModel?: string): string {
  const model = String(currentModel ?? "");
  if (provider === "elevenlabs") {
    return model.startsWith("elevenlabs-") || model.startsWith("eleven_")
      ? model
      : "elevenlabs-multilingual-v2";
  }
  if (provider === "gemini") return "gemini-2.5-pro-preview-tts";
  return "google-tts-studio";
}

function geminiToRow(v: GeminiTTSVoice): VoiceRow {
  return {
    id: v.id,
    name: v.name,
    characteristic: v.characteristic,
    lean: v.lean,
    languageCode: "en-US",
    family: "Standard",
    flag: "AI",
    useCases: v.useCases,
    tint: v.tint,
  };
}

function elevenPresetToRow(v: ElevenLabsVoice): VoiceRow {
  return {
    id: v.id,
    name: v.name,
    characteristic: v.characteristic,
    lean: v.lean,
    languageCode: v.accent === "British" ? "en-GB" : "en-US",
    family: "Standard",
    flag: v.flag,
    useCases: v.useCases,
    tint: v.tint,
  };
}

function useCaseFromEleven(value?: string | null): VoiceUseCase[] {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("advert")) return ["advertisement"];
  if (raw.includes("educ") || raw.includes("inform")) return ["informative_educational"];
  if (raw.includes("narr") || raw.includes("story") || raw.includes("audiobook")) return ["narrative_story"];
  if (raw.includes("social")) return ["social_media"];
  return ["advertisement", "informative_educational", "narrative_story", "social_media"];
}

function tintFromName(name: string): VoiceRow["tint"] {
  const tints: VoiceRow["tint"][] = ["violet", "rose", "amber", "emerald", "sky", "zinc"];
  const total = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return tints[total % tints.length];
}

function elevenApiToRow(v: ElevenLabsApiVoice): VoiceRow {
  const accent = String(v.accent ?? "").toLowerCase();
  return {
    id: v.id,
    name: v.name,
    characteristic: v.description || v.category || v.accent || "ElevenLabs voice",
    lean: v.lean ?? "neutral",
    languageCode: accent.includes("british") || accent.includes("uk") ? "en-GB" : "en-US",
    family: "Standard",
    flag: accent.includes("british") || accent.includes("uk") ? "GB" : "EL",
    useCases: useCaseFromEleven(v.use_case),
    tint: tintFromName(v.name),
  };
}

function staticCatalogFor(provider: ProviderTab): VoiceRow[] {
  if (provider === "google") return GOOGLE_VOICES.slice();
  if (provider === "gemini") return GEMINI_TTS_VOICES.map(geminiToRow);
  return ELEVENLABS_VOICES.map(elevenPresetToRow);
}

const VoicePickerDialog = ({ open, value, modelName, onClose, onSelect }: Props) => {
  const [provider, setProvider] = useState<ProviderTab>(() => providerForModel(modelName, value));
  const [genderFilter, setGenderFilter] = useState<"all" | VoiceLean>("all");
  const [useCaseFilter, setUseCaseFilter] = useState<VoiceUseCase | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [genderOpen, setGenderOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState<"catalog" | "alpha">("catalog");
  const [elevenVoices, setElevenVoices] = useState<VoiceRow[]>([]);
  const [elevenLoading, setElevenLoading] = useState(false);
  const [elevenError, setElevenError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider(providerForModel(modelName, value));
  }, [modelName, open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || provider !== "elevenlabs") return;
    let cancelled = false;
    setElevenLoading(true);
    setElevenError(null);
    supabase.functions
      .invoke<{ voices?: ElevenLabsApiVoice[]; error?: string }>("voice-list", {
        body: { provider: "elevenlabs" },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) {
          setElevenError(error?.message || data?.error || "Cannot load ElevenLabs voices");
          setElevenVoices([]);
          return;
        }
        setElevenVoices((data?.voices ?? []).map(elevenApiToRow));
      })
      .catch((err) => {
        if (!cancelled) setElevenError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setElevenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, provider]);

  const catalog = useMemo(() => {
    if (provider !== "elevenlabs") return staticCatalogFor(provider);
    return elevenVoices.length > 0 ? elevenVoices : staticCatalogFor("elevenlabs");
  }, [elevenVoices, provider]);

  const filtered = useMemo(() => {
    let list = catalog.slice();
    if (genderFilter !== "all") list = list.filter((v) => v.lean === genderFilter);
    if (useCaseFilter) list = list.filter((v) => v.useCases.includes(useCaseFilter));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((v) => `${v.name} ${v.characteristic} ${v.id}`.toLowerCase().includes(q));
    }
    if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [catalog, genderFilter, query, sort, useCaseFilter]);

  const handleSelect = (voice: VoiceRow) => {
    onSelect(voice.id, modelForProvider(provider, modelName));
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ fontFamily: "'Prompt', system-ui, sans-serif" }}
    >
      <div
        className={cn(
          "relative flex h-[88vh] w-[min(1280px,94vw)] flex-col overflow-hidden",
          "rounded-2xl border border-white/10 bg-[hsl(220_10%_8%)]/95 backdrop-blur-2xl",
          "shadow-[0_24px_60px_-20px_hsl(0_0%_0%/0.7),0_0_0_1px_hsl(0_0%_100%/0.04)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        <div className="flex items-center gap-3 px-6 pb-4 pt-5">
          <h2 className="text-[18px] font-semibold tracking-tight text-zinc-50">Voices</h2>
          <div className="ml-auto flex items-center gap-2">
            <DropdownButton
              label={
                genderFilter === "all"
                  ? "All genders"
                  : genderFilter === "male"
                    ? "Male"
                    : genderFilter === "female"
                      ? "Female"
                      : "Neutral"
              }
              open={genderOpen}
              onToggle={() => setGenderOpen((v) => !v)}
              onClose={() => setGenderOpen(false)}
              items={[
                { label: "All genders", value: "all" },
                { label: "Female", value: "female" },
                { label: "Male", value: "male" },
                { label: "Neutral", value: "neutral" },
              ]}
              onSelect={(v) => setGenderFilter(v as "all" | VoiceLean)}
            />
            <DropdownButton
              label={sort === "catalog" ? "Provider order" : "A to Z"}
              open={sortOpen}
              onToggle={() => setSortOpen((v) => !v)}
              onClose={() => setSortOpen(false)}
              items={[
                { label: "Provider order", value: "catalog" },
                { label: "A to Z", value: "alpha" },
              ]}
              onSelect={(v) => setSort(v as "catalog" | "alpha")}
            />
            <ChromeIconBtn
              icon={Search}
              title="Search voices"
              active={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            />
            <ChromeIconBtn icon={X} title="Close (Esc)" onClick={onClose} />
          </div>
        </div>

        <div className="mx-6 mb-3 inline-flex w-fit items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 text-[12px]">
          {PROVIDER_TABS.map((t) => {
            const active = provider === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setProvider(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  active
                    ? "bg-white/[0.10] text-zinc-50"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {provider === "elevenlabs" && (elevenLoading || elevenError) && (
          <div
            className={cn(
              "mx-6 mb-3 rounded-xl border px-3 py-2 text-[12px]",
              elevenError
                ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-white/[0.04] text-zinc-300",
            )}
          >
            {elevenError
              ? `${elevenError}. Showing bundled ElevenLabs preset voices as a fallback.`
              : "Loading ElevenLabs account voices..."}
          </div>
        )}

        {searchOpen && (
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, provider id, or characteristic..."
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/10"
              />
            </div>
          </div>
        )}

        <div className="ws-scroll-hide flex-1 overflow-y-auto px-6 pb-8">
          <div className="mb-2 text-[12.5px] font-medium text-zinc-300">Use cases</div>
          <ul className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VOICE_USE_CASES.map((uc) => {
              const active = useCaseFilter === uc.id;
              return (
                <li key={uc.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setUseCaseFilter((current) => (current === uc.id ? null : uc.id))
                    }
                    className={cn(
                      "group relative h-[120px] w-full overflow-hidden rounded-2xl text-left transition-all",
                      active
                        ? "ring-2 ring-white/40"
                        : "ring-1 ring-inset ring-white/[0.06] hover:ring-white/20",
                    )}
                    style={{ background: uc.gradient }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-30"
                      style={{
                        background:
                          "radial-gradient(circle at 30% 30%, hsl(0 0% 100% / 0.2), transparent 60%)",
                      }}
                    />
                    <div className="absolute inset-0 flex items-end justify-between p-4">
                      <span className="text-[15px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_hsl(0_0%_0%/0.5)]">
                        {uc.labelLines ? (
                          <>
                            {uc.labelLines[0]}
                            <br />
                            {uc.labelLines[1]}
                          </>
                        ) : (
                          uc.label
                        )}
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/95 text-zinc-900 transition-transform group-hover:translate-x-0.5">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[12.5px] font-medium text-zinc-300">
              {useCaseFilter
                ? VOICE_USE_CASES.find((u) => u.id === useCaseFilter)?.label
                : "All voices"}
            </span>
            <span className="font-mono text-[10.5px] text-zinc-500">
              {filtered.length} voice{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-[12.5px] italic text-zinc-500">
              No voices match the filters.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((voice) => {
                const isSelected = value === voice.id;
                return (
                  <li key={voice.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(voice)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                        "ring-1 ring-inset",
                        isSelected
                          ? "bg-white/[0.10] ring-white/[0.18]"
                          : "bg-white/[0.025] ring-white/[0.06] hover:bg-white/[0.05] hover:ring-white/[0.12]",
                      )}
                      title={`${voice.name} - ${voice.id}`}
                    >
                      <VoiceAvatar voice={voice} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-zinc-50">
                          <span className="shrink-0 text-[10px]">{voice.flag}</span>
                          <span className="truncate">{voice.name}</span>
                          <FamilyBadge family={voice.family} />
                        </div>
                        <div className="truncate text-[11px] text-zinc-500">
                          {voice.characteristic} - {voice.id}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const VoiceAvatar = ({ voice }: { voice: VoiceRow }) => (
  <span
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white shadow-inner ring-1 ring-inset ring-white/15"
    style={{ background: ALL_TINT_GRADIENT[voice.tint] }}
  >
    {voice.name.charAt(0).toUpperCase()}
  </span>
);

const FamilyBadge = ({ family }: { family: GoogleVoice["family"] }) => {
  const label =
    family === "Studio" ? "Studio" : family === "Neural2" ? "N2" : family === "WaveNet" ? "Wav" : "Std";
  const tone =
    family === "Studio"
      ? "bg-amber-400/15 text-amber-200 ring-amber-300/20"
      : family === "Neural2"
        ? "bg-sky-400/12 text-sky-200 ring-sky-300/18"
        : "bg-white/[0.06] text-zinc-300 ring-white/[0.08]";
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide ring-1 ring-inset",
        tone,
      )}
      title={`${family} tier`}
    >
      {label}
    </span>
  );
};

const ChromeIconBtn = ({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className={cn(
      "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
      active
        ? "bg-white/[0.10] text-zinc-100 ring-1 ring-inset ring-white/[0.10]"
        : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
    )}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const DropdownButton = ({
  label,
  open,
  onToggle,
  onClose,
  items,
  onSelect,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: Array<{ label: string; value: string }>;
  onSelect: (value: string) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md bg-white/[0.04] px-3 text-[12px] text-zinc-200 ring-1 ring-inset ring-white/[0.06] transition-colors",
          "hover:bg-white/[0.08]",
          open && "bg-white/[0.08]",
        )}
      >
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-10 mt-1 w-[170px] overflow-hidden rounded-md border border-white/10 bg-[hsl(220_10%_10%)] py-1 shadow-lg">
          {items.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item.value);
                  onClose();
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.06]"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VoicePickerDialog;
