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
  Play,
  Pause,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GOOGLE_VOICES,
  GOOGLE_VOICE_USE_CASES,
  GOOGLE_VOICE_TINT_GRADIENT,
  voicePreviewUrl,
  type GoogleVoice,
  type GoogleVoiceLean,
  type GoogleVoiceUseCase,
} from "./googleTtsVoices";

/* Aliases — the rest of this file was written against the legacy
 * Gemini types. Keeping the local names stable means the JSX body
 * below doesn't need to change shape, only the underlying data
 * source. */
type GeminiVoice = GoogleVoice;
type VoiceLean = GoogleVoiceLean;
type VoiceUseCase = GoogleVoiceUseCase;
const GEMINI_VOICES = GOOGLE_VOICES;
const VOICE_USE_CASES = GOOGLE_VOICE_USE_CASES;
const VOICE_TINT_GRADIENT = GOOGLE_VOICE_TINT_GRADIENT;

interface Props {
  open: boolean;
  /** Currently selected voice id — highlighted in the grid. */
  value?: string;
  onClose: () => void;
  onSelect: (voiceId: string) => void;
}

/* Sample text the preview button speaks. (Used by the offline
 * fallback only — the real preview is a pre-generated MP3 served
 * from Supabase Storage.) Kept short so first-byte latency is low
 * and the user gets a feel for the voice without waiting for a
 * paragraph to play out. */
const PREVIEW_TEXT =
  "Hi, I'm a sample voice from Google Cloud. Try me out for your next project.";

const VoicePickerDialog = ({ open, value, onClose, onSelect }: Props) => {
  const [genderFilter, setGenderFilter] = useState<"all" | VoiceLean>("all");
  const [useCaseFilter, setUseCaseFilter] = useState<VoiceUseCase | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [genderOpen, setGenderOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  const [playing, setPlaying] = useState<string | null>(null);
  // Banner state — shown once when the first preview 404s, so users
  // know previews aren't broken (the bucket just hasn't been
  // populated yet by the generate-voice-previews script).
  const [previewMissing, setPreviewMissing] = useState(false);

  // One <audio> element per dialog instance — re-target by setting
  // .src when a new voice is picked. Keeping a single element means
  // a fresh play implicitly stops the previous one.
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Cancel any running preview when the dialog closes — leaving a
  // half-played MP3 in the background is unsettling.
  useEffect(() => {
    if (!open) {
      stopPreview();
      stopAudio(audioRef.current);
      setPlaying(null);
    }
  }, [open]);

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

  const handlePreview = (v: GeminiVoice, e: React.MouseEvent) => {
    e.stopPropagation();
    // Re-click the playing voice → stop.
    if (playing === v.id) {
      stopAudio(audioRef.current);
      setPlaying(null);
      return;
    }
    // Stop any currently-playing audio before kicking off a new one.
    stopAudio(audioRef.current);

    const url = voicePreviewUrl(v.id);
    if (!url) {
      // No Supabase URL configured (env var missing) — skip the
      // network round-trip and surface the banner.
      setPreviewMissing(true);
      return;
    }

    setPlaying(v.id);
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
    const a = audioRef.current;
    a.src = url;
    a.onended = () => setPlaying(null);
    a.onerror = () => {
      // 404 / CORS / decoding error → show the banner once and clear
      // the spinner. Common during local dev before the previews
      // bucket has been populated by the generator script.
      setPreviewMissing(true);
      setPlaying(null);
    };
    a.play().catch(() => {
      setPreviewMissing(true);
      setPlaying(null);
    });
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
      style={{ fontFamily: "var(--font-sans)" }}
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
        {previewMissing && (
          <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-[11.5px] text-amber-200">
            <span aria-hidden>⚠</span>
            <span>
              Voice previews not generated yet — voices still work, but
              the play button stays silent until an admin runs
              <code className="mx-1 rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
                scripts/generate-voice-previews.ts
              </code>
              .
            </span>
          </div>
        )}

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
                const isPlaying = playing === v.id;
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
                      {/* Favourite — only shows on hover OR when set */}
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
                      {/* Preview play */}
                      <button
                        type="button"
                        onClick={(e) => handlePreview(v, e)}
                        className={cn(
                          "shrink-0 rounded-full bg-white/[0.08] p-1.5 text-zinc-200 ring-1 ring-inset ring-white/[0.08] transition-all",
                          "hover:bg-white/[0.16] hover:text-white",
                          isPlaying && "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30",
                        )}
                        title={isPlaying ? "Stop preview" : "Play preview"}
                      >
                        {isPlaying ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
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
    style={{ background: VOICE_TINT_GRADIENT[voice.tint] }}
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

/* ── Preview playback ──────────────────────────────────────────
 *
 * Primary path: a real <audio> element fetches the pre-generated
 * MP3 from `voice-previews/google/<voice-id>.mp3` (Supabase Storage
 * public bucket). Each voice gets one short clip (~5s) generated
 * by `scripts/generate-voice-previews.ts`. The dialog's per-row
 * play handler points the audio element at the URL and calls
 * `.play()`.
 *
 * Fallback (kept for offline / no-Supabase-URL local dev): the
 * browser's `SpeechSynthesis` API speaks a sample line. The actual
 * Google voice timbre obviously isn't reproduced — the browser
 * uses its OS voices — but the user gets at least *some* signal.
 * We DON'T auto-fall-through to this from the primary path on a
 * 404; instead we surface a "preview unavailable" banner so the
 * user knows the bucket needs populating. The `speakPreview`
 * helper stays exported only for ad-hoc reuse.
 */

/** Stop a possibly-playing <audio> element. Safe on null/undefined. */
function stopAudio(a: HTMLAudioElement | null) {
  if (!a) return;
  try {
    a.pause();
    a.removeAttribute("src");
    a.load();
  } catch {
    /* fine — element may already be torn down */
  }
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

function stopPreview() {
  if (typeof window === "undefined") return;
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakPreview(v: GeminiVoice, onEnd: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd();
    return;
  }
  const utt = new SpeechSynthesisUtterance(PREVIEW_TEXT);
  // Pick a local voice that loosely matches the Gemini voice's
  // perceptual lean. The browser's SpeechSynthesis API exposes
  // voices that have a name + lang; on most platforms only a
  // handful are male/female-tagged in the name, so we fall back to
  // index-based selection deterministic per Gemini name (so clicking
  // the same voice always sounds the same on a given machine).
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter((vv) => /^en[-_]/i.test(vv.lang));
  const pool = enVoices.length > 0 ? enVoices : voices;
  if (pool.length > 0) {
    // Hash voice id → pool index. Same name always → same index, so
    // playing "Achernar" twice picks the same browser voice.
    let h = 0;
    for (let i = 0; i < v.id.length; i++) h = (h * 31 + v.id.charCodeAt(i)) | 0;
    utt.voice = pool[Math.abs(h) % pool.length];
  }
  // Soft tweaks based on characteristic — nudges pitch / rate so the
  // preview gives at least *some* variety beyond "the default OS
  // voice for everyone". Numbers are conservative so it doesn't
  // sound cartoonish.
  const c = v.characteristic.toLowerCase();
  if (c.includes("bright") || c.includes("upbeat") || c.includes("lively"))
    utt.rate = 1.1, utt.pitch = 1.15;
  else if (c.includes("mature") || c.includes("warm") || c.includes("smooth"))
    utt.rate = 0.95, utt.pitch = 0.9;
  else if (c.includes("breezy") || c.includes("youthful"))
    utt.rate = 1.05, utt.pitch = 1.1;
  else if (c.includes("firm") || c.includes("informative"))
    utt.rate = 1.0, utt.pitch = 0.95;

  utt.onend = () => {
    currentUtterance = null;
    onEnd();
  };
  utt.onerror = () => {
    currentUtterance = null;
    onEnd();
  };
  currentUtterance = utt;
  window.speechSynthesis.speak(utt);
}

export default VoicePickerDialog;
