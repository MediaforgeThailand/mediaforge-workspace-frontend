import {
  Clipboard,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video,
  Wand2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

type PresetId = "text" | "image" | "frames" | "story" | "omni" | "motion";
type PollTarget = "text2video" | "image2video" | "omni" | "motion";

type ImageSource = {
  url: string;
  dataUrl: string;
  fileName: string;
};

type ShotDraft = {
  id: string;
  prompt: string;
  duration: number;
};

type ElementDraft = {
  id: string;
  name: string;
  image: ImageSource;
};

type JobStatus = "submitted" | "processing" | "queued" | "succeed" | "success" | "failed" | "fail" | "error";

type KlingJob = {
  id: string;
  taskId: string;
  pollTarget: PollTarget;
  preset: PresetId;
  title: string;
  status: JobStatus;
  statusMessage?: string;
  videoUrl?: string;
  createdAt: number;
  updatedAt: number;
};

const EMPTY_IMAGE: ImageSource = { url: "", dataUrl: "", fileName: "" };
const JOB_STORAGE_KEY = "mediaforge:kling-direct-jobs:v1";
const MAX_IMAGE_MB = 7;

const PRESETS: Array<{
  id: PresetId;
  title: string;
  model: string;
  icon: typeof Sparkles;
  hint: string;
}> = [
  { id: "text", title: "Text", model: "Kling 3 Pro", icon: Sparkles, hint: "Prompt only" },
  { id: "image", title: "Image", model: "Kling 3 Pro", icon: ImagePlus, hint: "Start frame" },
  { id: "frames", title: "Start-End", model: "Kling 3 Pro", icon: Film, hint: "Two frames" },
  { id: "story", title: "Story", model: "Kling 3 Pro", icon: Layers3, hint: "Multi-shot" },
  { id: "omni", title: "Omni", model: "Kling 3 Omni", icon: Wand2, hint: "Refs + video" },
  { id: "motion", title: "Motion", model: "Kling 3 Motion", icon: Video, hint: "Image + video" },
];

const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function imageValue(source: ImageSource) {
  return source.dataUrl || source.url.trim();
}

function fileName(source: ImageSource) {
  return source.fileName || (source.url.trim() ? "URL" : "");
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

async function parseApiResponse(res: Response) {
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  const text = await res.text();
  throw new Error(
    text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")
      ? "Kling API route is not available on this dev server. Use the Vercel deployment or vercel dev."
      : text.slice(0, 240) || "Kling API route returned a non-JSON response.",
  );
}

function statusTone(status: JobStatus) {
  if (status === "succeed" || status === "success") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  if (status === "failed" || status === "fail" || status === "error") return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
}

function isActiveJob(job: KlingJob) {
  return !["succeed", "success", "failed", "fail", "error"].includes(job.status);
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-normal text-zinc-400">{children}</span>;
}

function ImageField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: ImageSource;
  onChange: (next: ImageSource) => void;
  required?: boolean;
}) {
  const [fileError, setFileError] = useState("");

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileError("Image only");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFileError(`Max ${MAX_IMAGE_MB}MB`);
      event.target.value = "";
      return;
    }
    setFileError("");
    const dataUrl = await readImageFile(file);
    onChange({ ...value, dataUrl, fileName: file.name });
  };

  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <FieldLabel>
          {label}
          {required ? " *" : ""}
        </FieldLabel>
        {fileName(value) && (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_IMAGE })}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
        <input
          value={value.url}
          onChange={(event) => onChange({ ...value, url: event.target.value })}
          placeholder="https://..."
          className="h-9 min-w-0 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/70"
        />
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]">
          <ImagePlus className="h-3.5 w-3.5" />
          Upload
          <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        </label>
      </div>
      {(fileName(value) || fileError) && (
        <span className={`truncate text-[11px] ${fileError ? "text-rose-300" : "text-zinc-500"}`}>
          {fileError || fileName(value)}
        </span>
      )}
    </label>
  );
}

export default function KlingDesk() {
  const [preset, setPreset] = useState<PresetId>("text");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("9:16");
  const [duration, setDuration] = useState(5);
  const [hasAudio, setHasAudio] = useState(false);
  const [startFrame, setStartFrame] = useState<ImageSource>({ ...EMPTY_IMAGE });
  const [endFrame, setEndFrame] = useState<ImageSource>({ ...EMPTY_IMAGE });
  const [refImage, setRefImage] = useState<ImageSource>({ ...EMPTY_IMAGE });
  const [refVideoUrl, setRefVideoUrl] = useState("");
  const [keepOriginalSound, setKeepOriginalSound] = useState(false);
  const [characterOrientation, setCharacterOrientation] = useState<"video" | "image">("video");
  const [shots, setShots] = useState<ShotDraft[]>([
    { id: makeId("shot"), prompt: "", duration: 3 },
    { id: makeId("shot"), prompt: "", duration: 2 },
  ]);
  const [elements, setElements] = useState<ElementDraft[]>([]);
  const [jobs, setJobs] = useState<KlingJob[]>(() => {
    try {
      const raw = localStorage.getItem(JOB_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 24) : [];
    } catch {
      return [];
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const pollingRef = useRef(new Set<string>());

  const activePreset = PRESETS.find((item) => item.id === preset) ?? PRESETS[0];
  const shotTotal = useMemo(
    () => shots.reduce((sum, shot) => sum + (shot.prompt.trim() ? Number(shot.duration) || 0 : 0), 0),
    [shots],
  );
  const usesShots = preset === "story";
  const needsStart = preset === "image" || preset === "frames";
  const needsEnd = preset === "frames";
  const needsMotionRefs = preset === "motion";
  const canUseRefs = preset === "text" || preset === "image" || preset === "frames" || preset === "omni" || preset === "motion";

  useEffect(() => {
    localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(jobs.slice(0, 24)));
  }, [jobs]);

  const updateJob = useCallback((jobId: string, patch: Partial<KlingJob>) => {
    setJobs((current) =>
      current.map((job) => (job.id === jobId ? { ...job, ...patch, updatedAt: Date.now() } : job)),
    );
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      const job = jobs.find((item) => item.id === jobId);
      if (!job || !isActiveJob(job) || pollingRef.current.has(jobId)) return;

      pollingRef.current.add(jobId);
      try {
        const res = await fetch("/api/kling-direct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "poll",
            task_id: job.taskId,
            poll_target: job.pollTarget,
          }),
        });
        const data = await parseApiResponse(res);
        if (!res.ok || !data.ok) throw new Error(data.error || "Polling failed");
        updateJob(jobId, {
          status: String(data.status || "processing").toLowerCase() as JobStatus,
          statusMessage: data.status_message || "",
          videoUrl: data.video_url || job.videoUrl,
        });
      } catch (err) {
        updateJob(jobId, {
          status: "error",
          statusMessage: err instanceof Error ? err.message : "Polling failed",
        });
      } finally {
        pollingRef.current.delete(jobId);
      }
    },
    [jobs, updateJob],
  );

  useEffect(() => {
    const active = jobs.filter(isActiveJob);
    if (active.length === 0) return;
    const timer = window.setInterval(() => {
      active.slice(0, 4).forEach((job) => void pollJob(job.id));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [jobs, pollJob]);

  const addShot = () => {
    setShots((current) => [...current, { id: makeId("shot"), prompt: "", duration: 3 }].slice(0, 5));
  };

  const addElement = () => {
    setElements((current) =>
      [
        ...current,
        { id: makeId("element"), name: `Ref ${current.length + 1}`, image: { ...EMPTY_IMAGE } },
      ].slice(0, preset === "motion" ? 1 : 4),
    );
  };

  const buildPayload = () => {
    const cleanPrompt = prompt.trim();
    const cleanShots = shots
      .filter((shot) => shot.prompt.trim())
      .map((shot) => ({ prompt: shot.prompt.trim(), duration: Number(shot.duration) || 3 }));

    if (!usesShots && !cleanPrompt) throw new Error("Add a prompt.");
    if (needsStart && !imageValue(startFrame)) throw new Error("Add a start frame.");
    if (needsEnd && !imageValue(endFrame)) throw new Error("Add an end frame.");
    if (usesShots && cleanShots.length === 0) throw new Error("Add at least one shot.");
    if (usesShots && (shotTotal < 3 || shotTotal > 15)) throw new Error("Story shots must total 3-15 seconds.");
    if (needsMotionRefs && !imageValue(refImage)) throw new Error("Add a motion reference image.");
    if (needsMotionRefs && !refVideoUrl.trim()) throw new Error("Add a motion reference video URL.");

    const submittedElements = elements
      .map((item) => ({
        name: item.name.trim() || "Element",
        reference_image_urls: imageValue(item.image) ? [imageValue(item.image)] : [],
      }))
      .filter((item) => item.reference_image_urls.length > 0);

    return {
      action: "submit",
      preset,
      prompt: cleanPrompt,
      negative_prompt: negativePrompt.trim(),
      aspect_ratio: aspectRatio,
      duration: usesShots ? shotTotal : duration,
      has_audio: hasAudio,
      image_url:
        preset === "motion"
          ? imageValue(refImage)
          : preset === "image" || preset === "frames" || preset === "omni"
            ? imageValue(startFrame)
            : "",
      image_tail_url: preset === "frames" || preset === "omni" ? imageValue(endFrame) : "",
      ref_image_url: preset === "omni" ? imageValue(refImage) : "",
      video_url: preset === "omni" || preset === "motion" ? refVideoUrl.trim() : "",
      keep_original_sound: keepOriginalSound ? "yes" : "no",
      character_orientation: characterOrientation,
      refer_type: preset === "omni" ? "base" : "feature",
      multi_prompt: usesShots ? cleanShots : [],
      elements: submittedElements,
    };
  };

  const submitJob = async () => {
    setFormError("");
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/kling-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Kling submit failed");

      const job: KlingJob = {
        id: makeId("job"),
        taskId: String(data.task_id),
        pollTarget: data.poll_target as PollTarget,
        preset,
        title: usesShots ? cleanTitle(shots.find((shot) => shot.prompt.trim())?.prompt || activePreset.title) : cleanTitle(prompt || activePreset.title),
        status: "submitted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setJobs((current) => [job, ...current].slice(0, 24));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to submit Kling job.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyTask = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard is optional; keep the button silent in restricted contexts.
    }
  };

  return (
    <main className="min-h-screen bg-[#10110f] text-zinc-100">
      <header className="border-b border-white/10 bg-[#151612]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-lime-300 text-black">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-6">Comfy Kling</h1>
              <p className="truncate text-xs text-zinc-400">Kling 3.0 direct desk</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/kling"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              /kling
            </a>
            <a
              href="/comfy"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-lime-300 px-3 text-xs font-semibold text-black hover:bg-lime-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              /comfy
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <aside className="grid content-start gap-3">
          <section className="rounded-md border border-white/10 bg-[#181914] p-3">
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Presets</FieldLabel>
              <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400">No login</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((item) => {
                const Icon = item.icon;
                const selected = item.id === preset;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id)}
                    className={`min-h-20 rounded-md border p-3 text-left transition ${
                      selected
                        ? "border-lime-300/80 bg-lime-300/10 text-lime-50"
                        : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Icon className={`h-4 w-4 ${selected ? "text-lime-200" : "text-zinc-400"}`} />
                      <span className="text-[10px] text-zinc-500">{item.model.replace("Kling ", "")}</span>
                    </div>
                    <div className="text-sm font-semibold leading-4">{item.title}</div>
                    <div className="mt-1 text-[11px] leading-4 text-zinc-500">{item.hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-white/10 bg-[#181914] p-3">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-200" />
              <FieldLabel>Defaults</FieldLabel>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <FieldLabel>Aspect</FieldLabel>
                <div className="grid grid-cols-3 gap-1.5">
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`h-8 rounded-md border text-xs font-medium ${
                        ratio === aspectRatio
                          ? "border-cyan-300/80 bg-cyan-300/10 text-cyan-50"
                          : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </label>

              {!usesShots && (
                <label className="grid gap-1.5">
                  <span className="flex items-center justify-between">
                    <FieldLabel>Duration</FieldLabel>
                    <span className="text-xs text-zinc-300">{duration}s</span>
                  </span>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    step={1}
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="accent-cyan-300"
                  />
                </label>
              )}

              {preset !== "motion" && (
                <label className="flex h-9 items-center justify-between rounded-md border border-white/10 bg-black/20 px-3">
                  <span className="text-xs font-medium text-zinc-300">Native audio</span>
                  <input
                    type="checkbox"
                    checked={hasAudio}
                    onChange={(event) => setHasAudio(event.target.checked)}
                    className="h-4 w-4 accent-lime-300"
                  />
                </label>
              )}
            </div>
          </section>
        </aside>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid content-start gap-4">
            <section className="rounded-md border border-white/10 bg-[#181914] p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">{activePreset.title}</h2>
                  <p className="text-xs text-zinc-400">{activePreset.model}</p>
                </div>
                <button
                  type="button"
                  onClick={submitJob}
                  disabled={submitting}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-lime-300 px-4 text-sm font-semibold text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Create
                </button>
              </div>

              <div className="grid gap-4">
                {!usesShots ? (
                  <label className="grid gap-1.5">
                    <FieldLabel>Prompt *</FieldLabel>
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      maxLength={2500}
                      placeholder="A polished product shot, smooth camera move, cinematic lighting..."
                      className="min-h-28 resize-y rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-300/70"
                    />
                    <span className="text-right text-[11px] text-zinc-500">{prompt.length}/2500</span>
                  </label>
                ) : (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <FieldLabel>Shots *</FieldLabel>
                      <span className={`text-[11px] ${shotTotal >= 3 && shotTotal <= 15 ? "text-zinc-400" : "text-rose-300"}`}>
                        {shotTotal || 0}s total
                      </span>
                    </div>
                    {shots.map((shot, index) => (
                      <div key={shot.id} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-2 sm:grid-cols-[72px_minmax(0,1fr)_34px]">
                        <label className="grid gap-1">
                          <span className="text-[11px] text-zinc-500">Shot {index + 1}</span>
                          <input
                            type="number"
                            min={1}
                            max={15}
                            value={shot.duration}
                            onChange={(event) =>
                              setShots((current) =>
                                current.map((item) => (item.id === shot.id ? { ...item, duration: Number(event.target.value) } : item)),
                              )
                            }
                            className="h-9 rounded-md border border-white/10 bg-black/30 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/70"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] text-zinc-500">Prompt</span>
                          <input
                            value={shot.prompt}
                            onChange={(event) =>
                              setShots((current) =>
                                current.map((item) => (item.id === shot.id ? { ...item, prompt: event.target.value } : item)),
                              )
                            }
                            maxLength={512}
                            placeholder="Camera pushes in..."
                            className="h-9 min-w-0 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-300/70"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShots((current) => current.filter((item) => item.id !== shot.id))}
                          className="mt-5 inline-flex h-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 sm:mt-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addShot}
                      className="inline-flex h-8 w-fit items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.06]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add shot
                    </button>
                  </div>
                )}

                <label className="grid gap-1.5">
                  <FieldLabel>Negative Prompt</FieldLabel>
                  <textarea
                    value={negativePrompt}
                    onChange={(event) => setNegativePrompt(event.target.value)}
                    maxLength={2500}
                    placeholder="blur, warped hands, broken product logo..."
                    className="min-h-16 resize-y rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/70"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-md border border-white/10 bg-[#181914] p-4">
              <div className="mb-3 flex items-center justify-between">
                <FieldLabel>Inputs</FieldLabel>
                <span className="text-[11px] text-zinc-500">{activePreset.hint}</span>
              </div>
              <div className="grid gap-4">
                {(preset === "image" || preset === "frames" || preset === "omni") && (
                  <ImageField label="Start frame" value={startFrame} onChange={setStartFrame} required={needsStart} />
                )}
                {(preset === "frames" || preset === "omni") && (
                  <ImageField label="End frame" value={endFrame} onChange={setEndFrame} required={needsEnd} />
                )}
                {(preset === "omni" || preset === "motion") && (
                  <ImageField
                    label={preset === "motion" ? "Motion image" : "Reference image"}
                    value={refImage}
                    onChange={setRefImage}
                    required={needsMotionRefs}
                  />
                )}
                {(preset === "omni" || preset === "motion") && (
                  <label className="grid gap-1.5">
                    <FieldLabel>{preset === "motion" ? "Motion video URL *" : "Reference video URL"}</FieldLabel>
                    <input
                      value={refVideoUrl}
                      onChange={(event) => setRefVideoUrl(event.target.value)}
                      placeholder="https://..."
                      className="h-9 min-w-0 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/70"
                    />
                  </label>
                )}
                {preset === "motion" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <FieldLabel>Orientation</FieldLabel>
                      <select
                        value={characterOrientation}
                        onChange={(event) => setCharacterOrientation(event.target.value as "video" | "image")}
                        className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300/70"
                      >
                        <option value="video">Follow video</option>
                        <option value="image">Follow image</option>
                      </select>
                    </label>
                    <label className="flex h-9 items-center justify-between self-end rounded-md border border-white/10 bg-black/20 px-3">
                      <span className="text-xs font-medium text-zinc-300">Keep sound</span>
                      <input
                        type="checkbox"
                        checked={keepOriginalSound}
                        onChange={(event) => setKeepOriginalSound(event.target.checked)}
                        className="h-4 w-4 accent-lime-300"
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>

            {canUseRefs && (
              <section className="rounded-md border border-white/10 bg-[#181914] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <FieldLabel>Character / Object Refs</FieldLabel>
                    <p className="mt-1 text-xs text-zinc-500">Optional, up to {preset === "motion" ? "1" : "4"}.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addElement}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.06]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add ref
                  </button>
                </div>
                {elements.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-xs text-zinc-500">
                    Add a product, character, or logo reference when identity matters.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {elements.map((element) => (
                      <div key={element.id} className="grid gap-2 rounded-md border border-white/10 bg-black/20 p-3">
                        <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_34px]">
                          <label className="grid gap-1.5">
                            <FieldLabel>Name</FieldLabel>
                            <input
                              value={element.name}
                              onChange={(event) =>
                                setElements((current) =>
                                  current.map((item) => (item.id === element.id ? { ...item, name: event.target.value } : item)),
                                )
                              }
                              className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300/70"
                            />
                          </label>
                          <ImageField
                            label="Image"
                            value={element.image}
                            onChange={(next) =>
                              setElements((current) =>
                                current.map((item) => (item.id === element.id ? { ...item, image: next } : item)),
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setElements((current) => current.filter((item) => item.id !== element.id))}
                            className="mt-5 inline-flex h-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 sm:mt-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="grid content-start gap-4">
            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">{formError}</span>
              </div>
            )}

            <section className="rounded-md border border-white/10 bg-[#181914] p-3">
              <div className="mb-3 flex items-center justify-between">
                <FieldLabel>Jobs</FieldLabel>
                <button
                  type="button"
                  onClick={() => setJobs([])}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>

              {jobs.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 px-3 py-10 text-center text-sm text-zinc-500">
                  Submitted Kling jobs will appear here.
                </div>
              ) : (
                <div className="grid gap-3">
                  {jobs.map((job) => (
                    <article key={job.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-zinc-100">{job.title}</h3>
                          <p className="text-[11px] text-zinc-500">
                            {PRESETS.find((item) => item.id === job.preset)?.title || job.preset} · {new Date(job.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${statusTone(job.status)}`}>
                          {job.status}
                        </span>
                      </div>

                      {job.videoUrl ? (
                        <video src={job.videoUrl} controls className="mb-2 aspect-video w-full rounded-md bg-black object-contain" />
                      ) : (
                        <div className="mb-2 grid aspect-video place-items-center rounded-md border border-dashed border-white/10 bg-black/25 text-xs text-zinc-500">
                          {isActiveJob(job) ? "Rendering..." : "No preview"}
                        </div>
                      )}

                      {job.statusMessage && (
                        <p className="mb-2 line-clamp-2 text-xs leading-5 text-zinc-400">{job.statusMessage}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void pollJob(job.id)}
                          disabled={!isActiveJob(job)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Poll
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyTask(job.taskId)}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                        >
                          <Clipboard className="h-3 w-3" />
                          Task
                        </button>
                        {job.videoUrl && (
                          <>
                            <a
                              href={job.videoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open
                            </a>
                            <a
                              href={job.videoUrl}
                              download
                              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-cyan-300 px-2 text-[11px] font-semibold text-black hover:bg-cyan-200"
                            >
                              <Download className="h-3 w-3" />
                              Save
                            </a>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function cleanTitle(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 56 ? `${compact.slice(0, 56)}...` : compact || "Kling job";
}
