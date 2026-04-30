/**
 * Voice picker — full-viewport dialog for choosing a Google Cloud
 * Text-to-Speech voice. Mirrors Krea / ElevenLabs / Freepik
 * conventions:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Voices            [All genders ▾] [Last used ▾] [♡] [🔍] [×] │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Use cases                                                    │
 *   │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
 *   │ │  Ad     │ │ Informa │ │ Narra   │ │ Social  │              │
 *   │ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
 *   │                                                              │
 *   │ All voices                                                   │
 *   │ ┌─────────────────┐ ┌─────────────────┐ …                    │
 *   │ │  ⊙  Achernar    │ │  ⊙  Achird      │                      │
 *   │ │     All langs   │ │     All langs   │                      │
 *   │ └─────────────────┘ └─────────────────┘                      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Each voice row:
 *   - Avatar circle (initial letter on a tinted gradient — we don't
 *     have real photos for the API voices, so this stays minimal).
 *   - Name + language flag + family badge (Studio / Neural2 / WaveNet).
 *   - Hover reveals a play button. Click → fetches the pre-generated
 *     MP3 from Supabase Storage `voice-previews/google/<id>.mp3` and
 *     plays it via a real <audio> element. If the file is missing
 *     (e.g. before `scripts/generate-voice-previews.ts` has been
 *     run on a fresh project) the row falls back to a silent
 *     "preview unavailable" toast — picking still works.
 *   - Click the row body → selects + closes.
 *
 * Top filters:
 *   - Genders dropdown (male / female / all).
 *   - "Last used" dropdown (sort).
 *   - Favorite toggle (mock — no backing store yet).
 *   - Search opens an input that filters by name or characteristic.
 *
 * Use case cards filter the list to voices matching that case. Click
 * the same card again to clear the filter.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Heart,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GOOGLE_VOICES,
  GOOGLE_VOICE_USE_CASES,
  GOOGLE_VOICE_TINT_GRADIENT,
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

/* Aliases — the rest of this file was written against the legacy
 * Gemini types. Keeping the local names stable means the JSX body
 * below doesn't need to change shape, only the underlying data
 * source. */
type GeminiVoice = GoogleVoice;
type VoiceLean = GoogleVoiceLean;
type VoiceUseCase = GoogleVoiceUseCase;
const VOICE_USE_CASES = GOOGLE_VOICE_USE_CASES;
const VOICE_TINT_GRADIENT = GOOGLE_VOICE_TINT_GRADIENT;

/** Provider tabs let the user switch between Google Cloud TTS,
 *  Gemini's prebuilt voice family, and ElevenLabs presets without
 *  juggling three different pickers. Each catalog is normalised to
 *  the same row shape (defined by `GoogleVoice` fields) so the JSX
 *  below renders all three identically. */
type ProviderTab = "google" | "gemini" | "elevenlabs";

const PROVIDER_TABS: Array<{ id: ProviderTab; label: string }> = [
  { id: "google",     label: "Google TTS" },
  { id: "gemini",     label: "Gemini" },
  { id: "elevenlabs", label: "ElevenLabs" },
];

/** Coerce a Gemini voice (no language / family / flag fields) to the
 *  GoogleVoice shape so the row renderer doesn't need a per-provider
 *  branch. Gemini voices are non-localised in the API; we display
 *  them as "All langs" and surface an "AI" tier badge. */
function geminiToRow(v: GeminiTTSVoice): GoogleVoice {
  return {
    id: v.id,
    name: v.name,
    characteristic: v.characteristic,
    lean: v.lean === "neutral" ? "female" : v.lean,
    languageCode: "en-US", // Gemini voices speak any language Gemini supports
    family: "Standard",     // not really standard but the badge variant we want to render
    flag: "🌐",
    useCases: v.useCases,
    tint: v.tint,
  };
}

/** Same coercion for ElevenLabs — accent maps to the flag chip and
 *  we surface the ElevenLabs name where the Google voice family
 *  would normally sit. */
function elevenLabsToRow(v: ElevenLabsVoice): GoogleVoice {
  return {
    id: v.id,
    name: v.name,
    characteristic: v.characteristic,
    lean: v.lean === "neutral" ? "female" : v.lean,
    languageCode: v.accent === "British" ? "en-GB" : "en-US",
    family: "Standard",
    flag: v.flag,
    useCases: v.useCases,
    tint: v.tint,
  };
}

function catalogFor(p: ProviderTab): GoogleVoice[] {
  if (p === "google") return GOOGLE_VOICES.slice();
  if (p === "gemini") return GEMINI_TTS_VOICES.map(geminiToRow);
  return ELEVENLABS_VOICES.map(elevenLabsToRow);
}

/** Tint-gradient lookup that works for any provider's tint value
 *  (the palettes are kept identical across catalogs on purpose, but
 *  defensive merging means a future addition can't break the row). */
const ALL_TINT_GRADIENT: Record<GoogleVoice["tint"], string> = {
  ...GOOGLE_VOICE_TINT_GRADIENT,
  ...ELEVENLABS_VOICE_TINT_GRADIENT,
};

interface Props {
  open: boolean;
  /** Currently selected voice id — highlighted in the grid. */
  value?: string;
  onClose: () => void;
  onSelect: (voiceId: string) => void;
}

const VoicePickerDialog = ({ open, value, onClose, onSelect }: Props) => {
  const [provider, setProvider] = useState<ProviderTab>("google");
  const [genderFilter, setGenderFilter] = useState<"all" | VoiceLean>("all");
  const [useCaseFilter, setUseCaseFilter] = useState<VoiceUseCase | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [genderOpen, setGenderOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  // Catalog list reactive to provider tab.
  const GEMINI_VOICES: GeminiVoice[] = useMemo(() => catalogFor(provider), [provider]);

  // Mocked favorites — survives only the session; can be wired to
  // user_settings or a `voice_favorites` table later.
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

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

  const filtered = useMemo(() => {
    let list: GeminiVoice[] = GEMINI_VOICES.slice();
    if (genderFilter !== "all") list = list.filter((v) => v.lean === genderFilter);
    if (useCaseFilter) list = list.filter((v) => v.useCases.includes(useCaseFilter));
    if (favoritesOnly) list = list.filter((v) => favorites.has(v.id));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        `${v.name} ${v.characteristic}`.toLowerCase().includes(q),
      );
    }
    if (sort === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    // "recent" defaults to the catalogue order, which is alphabetical
    // by id in our source file — visually the same as "alpha". When
    // we ship a real "last used" timestamp we'll swap this for a
    // proper sort.
    return list;
  }, [genderFilter, useCaseFilter, favoritesOnly, query, sort, favorites]);

  if (!open) return null;

  // Voice preview is intentionally absent — see the comment near the
  // voice card render below. The dialog is select-only.
  };

  const handleSelect = (v: GeminiVoice) => {
    onSelect(v.id);
    onClose();
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        {/* Top sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
          <h2 className="text-[18px] font-semibold tracking-tight text-zinc-50">
            Voices
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {/* Gender dropdown */}
            <DropdownButton
              label={
                genderFilter === "all"
                  ? "All genders"
                  : genderFilter === "male"
                    ? "Male"
                    : "Female"
              }
              open={genderOpen}
              onToggle={() => setGenderOpen((v) => !v)}
              onClose={() => setGenderOpen(false)}
              items={[
                { label: "All genders", value: "all" },
                { label: "Female", value: "female" },
                { label: "Male", value: "male" },
              ]}
              onSelect={(v) =>
                setGenderFilter(v as "all" | VoiceLean)
              }
            />
            {/* Sort dropdown */}
            <DropdownButton
              label={sort === "recent" ? "Last used" : "A → Z"}
              open={sortOpen}
              onToggle={() => setSortOpen((v) => !v)}
              onClose={() => setSortOpen(false)}
              items={[
                { label: "Last used", value: "recent" },
                { label: "A → Z", value: "alpha" },
              ]}
              onSelect={(v) => setSort(v as "recent" | "alpha")}
            />
            {/* Favorites toggle */}
            <ChromeIconBtn
              icon={Heart}
              title="Show favorites only"
              active={favoritesOnly}
              onClick={() => setFavoritesOnly((v) => !v)}
            />
            {/* Search toggle */}
            <ChromeIconBtn
              icon={Search}
              title="Search voices"
              active={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            />
            <ChromeIconBtn
              icon={X}
              title="Close (Esc)"
              onClick={onClose}
            />
          </div>
        </div>

        {/* Preview-bucket-empty banner — shown after the first 404
         *  so users know the picker still works (selection is fine,
         *  preview MP3s just haven't been populated yet). */}
        {/* Provider tabs — Google / Gemini / ElevenLabs. Switching
         *  tabs swaps the entire grid; the selected voice id is
         *  preserved in the dialog's `value` prop so a row stays
         *  highlighted if the user comes back to its tab. */}
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

        {/* Inline search field — slides in below the header when toggled */}
        {searchOpen && (
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or characteristic…"
                className="w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/10"
              />
            </div>
          </div>
        )}

        <div className="ws-scroll-hide flex-1 overflow-y-auto px-6 pb-8">
          {/* ── Use-case cards ── */}
          <div className="mb-2 text-[12.5px] font-medium text-zinc-300">
            Use cases
          </div>
          <ul className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VOICE_USE_CASES.map((uc) => {
              const active = useCaseFilter === uc.id;
              return (
                <li key={uc.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setUseCaseFilter((current) =>
                        current === uc.id ? null : uc.id,
                      )
                    }
                    className={cn(
                      "group relative h-[120px] w-full overflow-hidden rounded-2xl text-left transition-all",
                      active
                        ? "ring-2 ring-white/40"
                        : "ring-1 ring-inset ring-white/[0.06] hover:ring-white/20",
                    )}
                    style={{ background: uc.gradient }}
                  >
                    {/* Subtle texture overlay so the cards don't read
                     *  as flat colour blocks. */}
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
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/95 text-zinc-900 transition-transform",
                          "group-hover:translate-x-0.5",
                        )}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── All voices ── */}
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
              {filtered.map((v) => {
                const isSelected = value === v.id;
                const isFav = favorites.has(v.id);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(v)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                        "ring-1 ring-inset",
                        isSelected
                          ? "bg-white/[0.10] ring-white/[0.18]"
                          : "bg-white/[0.025] ring-white/[0.06] hover:bg-white/[0.05] hover:ring-white/[0.12]",
                      )}
                      title={v.characteristic}
                    >
                      <VoiceAvatar voice={v} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-zinc-50">
                          <span className="shrink-0">{v.flag}</span>
                          <span className="truncate">{v.name}</span>
                          <FamilyBadge family={v.family} />
                        </div>
                        <div className="truncate text-[11px] text-zinc-500">
                          {v.characteristic} · {v.languageCode}
                        </div>
                      </div>
                      {/* Favourite — only shows on hover OR when set.
                       *  Voice preview play button removed per UX
                       *  rework — the cards are select-only until we
                       *  build a properly debounced preview pipeline. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(v.id);
                        }}
                        className={cn(
                          "shrink-0 rounded-md p-1.5 transition-colors",
                          isFav
                            ? "text-rose-300"
                            : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-rose-300",
                        )}
                        title={isFav ? "Unfavorite" : "Favorite"}
                      >
                        <Heart
                          className={cn("h-3.5 w-3.5", isFav && "fill-rose-300")}
                        />
                      </button>
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

/* ── Atoms ──────────────────────────────────────────────────── */

/** Initial-letter avatar — gradient background per voice tint, name
 *  initial in white. Cheap stand-in until we ship real avatars. */
const VoiceAvatar = ({ voice }: { voice: GeminiVoice }) => (
  <span
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white shadow-inner ring-1 ring-inset ring-white/15"
    style={{ background: ALL_TINT_GRADIENT[voice.tint] }}
  >
    {voice.name.charAt(0).toUpperCase()}
  </span>
);

/** Tiny pill that surfaces the Google TTS family — Studio is the
 *  premium tier (and most expensive), so it gets an amber accent so
 *  users notice when they're picking it. */
const FamilyBadge = ({ family }: { family: GoogleVoice["family"] }) => {
  const label =
    family === "Studio"
      ? "Studio"
      : family === "Neural2"
        ? "N2"
        : family === "WaveNet"
          ? "Wav"
          : "Std";
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
  icon: React.ComponentType<{ className?: string }>;
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
        <ul className="absolute right-0 top-full z-10 mt-1 w-[160px] overflow-hidden rounded-md border border-white/10 bg-[hsl(220_10%_10%)] py-1 shadow-lg">
          {items.map((it) => (
            <li key={it.value}>
              <button
                type="button"
                onClick={() => {
                  onSelect(it.value);
                  onClose();
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-zinc-200 hover:bg-white/[0.06]"
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ── Preview playback removed ──────────────────────────────────
 *
 * The dialog used to ship a per-row play button that synthesised a
 * sample via the `voice-preview` edge fn and / or fell back to the
 * browser SpeechSynthesis API. It was the source of repeated user-
 * facing errors (Chrome's "play() interrupted by pause()" race when
 * users clicked between voices, plus 502s when provider keys were
 * missing). The picker is now select-only — pick a voice and the
 * generation step itself produces real audio. */

export default VoicePickerDialog;
