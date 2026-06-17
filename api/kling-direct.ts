import { createHmac } from "node:crypto";

type KlingPreset = "text" | "image" | "frames" | "story" | "omni" | "motion";
type PollTarget = "text2video" | "image2video" | "omni" | "motion";

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface KlingSubmitBody {
  action?: "submit" | "poll" | "health";
  preset?: KlingPreset;
  task_id?: string;
  poll_target?: PollTarget;
  prompt?: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  duration?: number | string;
  has_audio?: boolean | string;
  image_url?: string;
  image_tail_url?: string;
  ref_image_url?: string;
  ref_image_urls?: string[];
  video_url?: string;
  refer_type?: "base" | "feature";
  keep_original_sound?: "yes" | "no" | boolean;
  character_orientation?: "image" | "video";
  multi_prompt?: Array<{ prompt?: string; duration?: number | string }>;
  elements?: Array<{
    name?: string;
    reference_image_urls?: string[];
    frontal_image_url?: string;
  }>;
}

const KLING_ENDPOINTS: Record<PollTarget, string> = {
  text2video: "https://api.klingai.com/v1/videos/text2video",
  image2video: "https://api.klingai.com/v1/videos/image2video",
  omni: "https://api.klingai.com/v1/videos/omni-video",
  motion: "https://api.klingai.com/v1/videos/motion-control",
};

const MAX_PROMPT_CHARS = 2500;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function sendJson(res: ApiResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseBody(req: ApiRequest): KlingSubmitBody {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body as KlingSubmitBody;
}

function getCredentials() {
  const accessKey =
    process.env.KLING_ACCESS_KEY_ID ||
    process.env.KLING_AK ||
    process.env.KLING_ACCESS_KEY ||
    "";
  const secretKey =
    process.env.KLING_SECRET_KEY ||
    process.env.KLING_SK ||
    process.env.KLING_SECRET ||
    "";
  return { accessKey, secretKey, configured: Boolean(accessKey && secretKey) };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function generateKlingJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5, iat: now };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secretKey).update(signingInput).digest();
  return `${signingInput}.${base64Url(signature)}`;
}

function clampDuration(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? 5), 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(3, Math.min(15, parsed));
}

function boolish(value: unknown): boolean {
  return value === true || value === "true" || value === "yes" || value === "on";
}

function normaliseImageInput(value: unknown): string {
  return String(value ?? "").trim();
}

function ensurePromptLimit(value: string, label: string) {
  if (value.length > MAX_PROMPT_CHARS) {
    throw new Error(`${label} is too long. Kling caps prompts at ${MAX_PROMPT_CHARS} characters.`);
  }
}

function stripDataImagePrefix(value: string): string {
  return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
}

function isDataImage(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function imageToKlingPayload(value: unknown): Promise<string | undefined> {
  const input = normaliseImageInput(value);
  if (!input) return undefined;

  if (isDataImage(input)) {
    const base64 = stripDataImagePrefix(input);
    const bytes = Math.ceil((base64.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) throw new Error("Image is too large for the quick Kling desk.");
    return base64;
  }

  if (!isHttpUrl(input)) {
    throw new Error("Image fields must be an http(s) URL or an uploaded image.");
  }

  try {
    const imageRes = await fetch(input);
    if (!imageRes.ok) return input;
    const contentType = imageRes.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return input;
    const arrayBuffer = await imageRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is too large for the quick Kling desk.");
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (err) {
    if (err instanceof Error && err.message.includes("too large")) throw err;
    return input;
  }
}

function videoUrl(value: unknown): string | undefined {
  const input = String(value ?? "").trim();
  if (!input) return undefined;
  if (!isHttpUrl(input)) throw new Error("Video fields must be public http(s) URLs.");
  return input;
}

async function buildElements(raw: KlingSubmitBody["elements"], maxItems: number) {
  const elements: Array<Record<string, unknown>> = [];
  for (const item of raw ?? []) {
    if (!item || typeof item !== "object") continue;
    const refs = Array.isArray(item.reference_image_urls) ? item.reference_image_urls : [];
    const convertedRefs: string[] = [];
    for (const ref of refs.slice(0, 4)) {
      const payload = await imageToKlingPayload(ref);
      if (payload) convertedRefs.push(payload);
    }
    const frontal = await imageToKlingPayload(item.frontal_image_url);
    if (convertedRefs.length === 0 && !frontal) continue;

    const entry: Record<string, unknown> = {
      name: String(item.name || `Element ${elements.length + 1}`).slice(0, 80),
    };
    if (convertedRefs.length > 0) entry.reference_image_urls = convertedRefs;
    if (frontal) entry.frontal_image_url = frontal;
    elements.push(entry);
    if (elements.length >= maxItems) break;
  }
  return elements;
}

function parseShots(body: KlingSubmitBody, fallbackDuration: number) {
  const shots = Array.isArray(body.multi_prompt) ? body.multi_prompt : [];
  const clean = shots
    .map((shot) => ({
      prompt: String(shot?.prompt ?? "").trim(),
      duration: clampDuration(shot?.duration ?? 3),
    }))
    .filter((shot) => shot.prompt.length > 0);

  if (clean.length === 0) return { enabled: false, totalDuration: fallbackDuration, multiPrompt: [] };
  const totalDuration = clean.reduce((sum, shot) => sum + shot.duration, 0);
  if (totalDuration < 3 || totalDuration > 15) {
    throw new Error("Multi-shot total duration must be between 3 and 15 seconds.");
  }
  clean.forEach((shot, index) => ensurePromptLimit(shot.prompt, `Shot ${index + 1}`));
  return {
    enabled: true,
    totalDuration,
    multiPrompt: clean.map((shot, index) => ({
      index: index + 1,
      prompt: shot.prompt,
      duration: String(shot.duration),
    })),
  };
}

async function submitStandard(body: KlingSubmitBody, jwt: string) {
  const preset = body.preset ?? "text";
  const startImage = await imageToKlingPayload(body.image_url);
  const endImage = await imageToKlingPayload(body.image_tail_url);
  const pollTarget: PollTarget = startImage ? "image2video" : "text2video";
  const endpoint = KLING_ENDPOINTS[pollTarget];
  const duration = clampDuration(body.duration);
  const prompt = String(body.prompt ?? "").trim();
  const negativePrompt = String(body.negative_prompt ?? "").trim();
  const shots = parseShots(body, duration);
  const finalDuration = shots.enabled ? shots.totalDuration : duration;

  if (preset === "image" && !startImage) throw new Error("Image mode requires a start frame.");
  if (preset === "frames" && (!startImage || !endImage)) throw new Error("Start-End mode requires both frames.");
  if (endImage && !startImage) throw new Error("End frame requires a start frame.");
  if (preset === "story" && !shots.enabled) throw new Error("Story mode requires at least one shot.");
  if (!shots.enabled && !prompt) throw new Error("Prompt is required.");

  ensurePromptLimit(prompt, "Prompt");
  ensurePromptLimit(negativePrompt, "Negative prompt");

  const payload: Record<string, unknown> = {
    model_name: "kling-v3",
    mode: "pro",
    duration: String(finalDuration),
    aspect_ratio: String(body.aspect_ratio || "9:16"),
  };

  if (startImage) payload.image = startImage;
  if (endImage) payload.image_tail = endImage;
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (boolish(body.has_audio)) payload.enable_audio = true;

  if (shots.enabled) {
    payload.multi_shot = true;
    payload.shot_type = "customize";
    payload.multi_prompt = shots.multiPrompt;
  } else {
    payload.prompt = prompt;
  }

  const elements = await buildElements(body.elements, 4);
  if (elements.length > 0) payload.elements = elements;

  return postKling(endpoint, jwt, payload, pollTarget);
}

async function submitMotion(body: KlingSubmitBody, jwt: string) {
  const imagePayload = await imageToKlingPayload(body.image_url || body.ref_image_url);
  const refVideoUrl = videoUrl(body.video_url);
  if (!imagePayload) throw new Error("Motion mode requires a reference image.");
  if (!refVideoUrl) throw new Error("Motion mode requires a reference video URL.");

  const payload: Record<string, unknown> = {
    model_name: "kling-v3",
    mode: "pro",
    image_url: imagePayload,
    video_url: refVideoUrl,
    keep_original_sound: boolish(body.keep_original_sound) ? "yes" : "no",
    character_orientation: body.character_orientation || "video",
  };

  const prompt = String(body.prompt ?? "").trim();
  ensurePromptLimit(prompt, "Prompt");
  if (prompt) payload.prompt = prompt;

  const elements = await buildElements(body.elements, 1);
  if (elements.length > 0) payload.elements = elements;

  return postKling(KLING_ENDPOINTS.motion, jwt, payload, "motion");
}

async function submitOmni(body: KlingSubmitBody, jwt: string) {
  const duration = clampDuration(body.duration);
  const prompt = String(body.prompt ?? "").trim();
  const negativePrompt = String(body.negative_prompt ?? "").trim();
  const shots = parseShots(body, duration);
  const finalDuration = shots.enabled ? shots.totalDuration : duration;
  const imageList: Array<Record<string, string>> = [];
  const videoList: Array<Record<string, string>> = [];

  const startImage = await imageToKlingPayload(body.image_url);
  const endImage = await imageToKlingPayload(body.image_tail_url);
  const refImages = [
    body.ref_image_url,
    ...(Array.isArray(body.ref_image_urls) ? body.ref_image_urls : []),
  ].filter(Boolean);
  const refVideoUrl = videoUrl(body.video_url);

  if (startImage) imageList.push({ image_url: startImage, type: "first_frame" });
  if (endImage && !startImage) throw new Error("End frame requires a start frame.");
  if (endImage) imageList.push({ image_url: endImage, type: "end_frame" });
  for (const raw of refImages.slice(0, 7)) {
    const payload = await imageToKlingPayload(raw);
    if (payload) imageList.push({ image_url: payload });
  }

  if (refVideoUrl) {
    videoList.push({
      video_url: refVideoUrl,
      refer_type: body.refer_type || "base",
      keep_original_sound: boolish(body.keep_original_sound) ? "yes" : "no",
    });
  }

  if (!shots.enabled && !prompt) throw new Error("Prompt is required.");
  ensurePromptLimit(prompt, "Prompt");
  ensurePromptLimit(negativePrompt, "Negative prompt");

  const payload: Record<string, unknown> = {
    model_name: "kling-v3-omni",
    mode: "pro",
    duration: String(finalDuration),
    aspect_ratio: String(body.aspect_ratio || "9:16"),
    sound: boolish(body.has_audio) && videoList.length === 0 ? "on" : "off",
  };

  if (shots.enabled) {
    payload.multi_shot = true;
    payload.shot_type = "customize";
    payload.multi_prompt = shots.multiPrompt;
  } else {
    payload.prompt = prompt;
  }
  if (negativePrompt) payload.negative_prompt = negativePrompt;
  if (imageList.length > 0) payload.image_list = imageList;
  if (videoList.length > 0) payload.video_list = videoList;

  const elements = await buildElements(body.elements, 4);
  if (elements.length > 0) payload.elements = elements;

  return postKling(KLING_ENDPOINTS.omni, jwt, payload, "omni");
}

async function postKling(endpoint: string, jwt: string, payload: Record<string, unknown>, pollTarget: PollTarget) {
  const klingRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });

  const resultText = await klingRes.text();
  let result: Record<string, unknown> = {};
  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { message: resultText };
  }

  if (!klingRes.ok || result.code !== 0) {
    const message = String(result.message || resultText || "Kling API error");
    throw new Error(`Kling API error (${klingRes.status}): ${message}`);
  }

  const taskId = String((result.data as Record<string, unknown> | undefined)?.task_id ?? "");
  if (!taskId) throw new Error("Kling API did not return a task_id.");

  console.info(`[kling-direct] submitted target=${pollTarget} task_id=${taskId}`);

  return {
    task_id: taskId,
    poll_target: pollTarget,
    status: "submitted",
  };
}

async function pollKling(body: KlingSubmitBody, jwt: string) {
  const taskId = String(body.task_id ?? "").trim();
  const pollTarget = body.poll_target;
  if (!taskId) throw new Error("Missing task_id.");
  if (!pollTarget || !KLING_ENDPOINTS[pollTarget]) throw new Error("Missing or invalid poll_target.");

  const statusRes = await fetch(`${KLING_ENDPOINTS[pollTarget]}/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}` },
  });

  const resultText = await statusRes.text();
  let result: Record<string, unknown> = {};
  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { message: resultText };
  }

  if (!statusRes.ok) {
    throw new Error(`Kling status error (${statusRes.status}): ${String(result.message || resultText).slice(0, 220)}`);
  }

  const data = (result.data ?? {}) as Record<string, unknown>;
  const status = String(data.task_status ?? "").toLowerCase() || "processing";
  const statusMessage = String(data.task_status_msg ?? result.message ?? "");
  const taskResult = (data.task_result ?? {}) as Record<string, unknown>;
  const videos = Array.isArray(taskResult.videos) ? taskResult.videos as Array<Record<string, unknown>> : [];
  const videoUrl = videos.length > 0 ? String(videos[0]?.url ?? "") : "";
  const succeeded = status === "succeed" || status === "success";

  console.info(
    `[kling-direct] poll target=${pollTarget} task_id=${taskId} status=${status} has_video=${Boolean(videoUrl)}`,
  );

  if (succeeded && !videoUrl) {
    throw new Error(`Kling task succeeded but returned no video URL. task_id=${taskId}`);
  }

  return {
    status,
    status_message: statusMessage,
    video_url: videoUrl || undefined,
    checked_at: Date.now(),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const body = req.method === "GET" ? { action: "health" as const } : parseBody(req);
    const { accessKey, secretKey, configured } = getCredentials();

    if (body.action === "health") {
      sendJson(res, 200, { ok: true, configured });
      return;
    }

    if (!configured) {
      sendJson(res, 503, {
        ok: false,
        error: "Kling credentials are not configured. Set KLING_ACCESS_KEY_ID and KLING_SECRET_KEY.",
      });
      return;
    }

    const jwt = generateKlingJwt(accessKey, secretKey);

    if (body.action === "poll") {
      const result = await pollKling(body, jwt);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (body.action !== "submit") {
      sendJson(res, 400, { ok: false, error: "Invalid action." });
      return;
    }

    const preset = body.preset ?? "text";
    const result = preset === "motion"
      ? await submitMotion(body, jwt)
      : preset === "omni"
        ? await submitOmni(body, jwt)
        : await submitStandard(body, jwt);

    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Kling API error.";
    sendJson(res, 400, { ok: false, error: message });
  }
}
