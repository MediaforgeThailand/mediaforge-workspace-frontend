# Post-merge Error Fixes — Deep Dive

หลัง PR `#8 fix/workspace-i18n-merge-recovery` (commit `9b9d0e5`) ถูก merge เข้า
main, มี 7 commits เพิ่มเติม โดย **4 ตัวเป็น error fix** ที่เกี่ยวกับ AI providers
และ runtime ของ workspace canvas — เอกสารนี้อธิบายสิ่งที่แก้, logic
หลังบ้าน/หน้าบ้าน, mechanics ของ API แต่ละเจ้า, สาเหตุที่ bug เกิด, และ
issues อื่น ๆ ที่อาจตามมา

| # | Commit | Title | Class |
|---|---|---|---|
| 1 | `4a93f76` | Fix standalone start frame crash | JS scoping bug |
| 2 | `a67e3b1` | Guard Seedance reference video duration | Provider input validation |
| 3 | `1d88a71` | Extend workspace generation visible timeout | Async job lifecycle |
| 4 | `01b07e4` | Show provider generation errors in friendly copy | Error mapping |

---

## Fix 1 — `4a93f76` Fix standalone start frame crash

### อาการ
หน้า workspace dashboard / canvas crash ด้วย `ReferenceError: language is not defined`
เมื่อ user เปิดส่วนของ `Frame to Video` (มี start/end frame slot)

### จุดที่แก้
`src/components/workspace/CreateImagePanel.tsx`

ก่อน:
```tsx
function usePanelCopy() {
  const { t } = useLanguage();              // <-- destructure แค่ t
  return { /* ... */ };
}

// แล้วในอีก scope ของ FrameReferenceSlot (sub-component):
function FrameReferenceSlot({ ... }) {
  // ...
  return (
    <span>
      {language === "th" ? "คลิกเพื่อเปลี่ยน" : "Click to replace"}
      {/* ^^^^^ — `language` ไม่ถูก destructure ไม่มีในขอบเขตนี้ */}
    </span>
  );
}
```

หลัง:
```tsx
function usePanelCopy() {
  const { language, t } = useLanguage();    // <-- ดึง language มาด้วย
  return {
    // ...
    clickToReplace: language === "th" ? "คลิกเพื่อเปลี่ยน" : "Click to replace",
  };
}

function FrameReferenceSlot({ ... }) {
  // ...
  return <span>{copy.clickToReplace}</span>;   // <-- ใช้ผ่าน copy
}
```

### Logic
- `usePanelCopy()` เป็น hook ที่ pre-compute label ทุกตัวของ panel แล้ว return เป็น
  object รวม
- การย้าย ternary string ขึ้นมาคำนวณใน `usePanelCopy` ทำให้ทุก consumer (รวม
  sub-components) ใช้ผ่าน `copy.clickToReplace` โดยไม่ต้องเข้าถึง `language`
  ตรง ๆ

### สาเหตุที่ bug เกิด
**Closure scoping ของ JS** ในเทคนิคการ refactor sub-component แบบไม่รอบคอบ:

1. `FrameReferenceSlot` เคยอยู่ใน parent component (มี `language` ใน scope)
2. มีคนแยก `FrameReferenceSlot` ออกเป็นฟังก์ชัน top-level
3. JSX ที่อ้าง `language` ตามมาด้วยโดยไม่มีการแก้
4. JS ไม่จับเป็น compile error เพราะมี `language` เป็นชื่อตัวแปรใน Web API
   (`navigator.language`) แต่ที่นี่คือ identifier ลอย ๆ ไม่ได้ผ่าน `navigator.`
5. Runtime — ถ้า `FrameReferenceSlot` ไม่ render → ไม่ throw (latent bug); render
   เมื่อไหร่ → throw ทันที

**บั๊กชนิดเดียวกับที่ branch เราแก้** ในรอบ i18n recovery (`EducationLockedToolView`,
`EducationClassDashboard`, `AssetTile`, `Settings`) — แต่ตัวนั้นอ้าง
`i18n("...")` ส่วนตัวนี้อ้าง `language` เปล่า ๆ → audit ของเราเลย miss
(scan แค่ pattern `i18n(`)

### ทำไมถึงไม่ใช่ AI-related
แม้ commit message พูดถึง "standalone start frame" (ดูเหมือน feature ของ video gen)
แต่ root cause ไม่ใช่ provider API — เป็นแค่ scope bug ที่ทำให้ panel render
ไม่สำเร็จเลย

### Issues อื่นที่อาจตามมา (กลุ่มนี้)
- Lint rule `@typescript-eslint/no-undef-init` หรือ `no-undef` ปิดอยู่ที่ root config
  → ตัว `language` ลอย ๆ TypeScript compile ผ่าน เพราะ `language` เป็น global ของ
  browser DOM (เป็น property ของ `Window.navigator.language`) — TS อาจไม่ flag
- ป้องกันโดย: เปิด `noImplicitGlobals` หรือใส่ rule `eslint-plugin-react/no-undef`
  ที่ check JSX expression context

---

## Fix 2 — `a67e3b1` Guard Seedance reference video duration

### อาการ
User ใส่ video เป็น reference ใน Seedance 2.0 (Pro / Lite) → backend submit ไป
ByteDance Ark API → API คืน 400 พร้อมข้อความ raw แบบ `content[2].video duration
must be 2-15s`. User เห็น toast เป็นภาษาอังกฤษเทคนิคจัด, ไม่รู้ว่าต้องแก้ตรงไหน

### จุดที่แก้
ฝั่ง frontend:
- `src/components/workspace/WorkspaceToolNode.tsx`:
  - เพิ่ม `SEEDANCE_REF_VIDEO_MIN_SEC = 2`, `MAX_SEC = 15`
  - เพิ่ม `validateSeedanceReferenceVideos(inputs)` — async, อ่าน duration ผ่าน
    `<video preload=metadata>` element แล้วเช็คก่อน submit
  - Hook ใน main run path: `if (schemaKey === "videoGenNode" &&
    isSeedanceV2VideoModel(selectedModel)) await
    validateSeedanceReferenceVideos(inputs);`
- `src/components/workspace/StandaloneGenerator.tsx`: เพิ่ม validation ฝั่ง standalone
- `src/lib/friendlyError.ts`: เพิ่ม mapping pattern คุม "Seedance 2.0 reference
  videos must be 2-15..." → Thai/EN/JA

### Logic ของ validator
```ts
async function readReferenceVideoDuration(url: string): Promise<number | null> {
  // ถ้า url เป็น Supabase storage path (ไม่ใช่ http/blob/data)
  // → ขอ signed URL ผ่าน getSignedUrl() ก่อน
  const readableUrl = /^(https?:|blob:|data:)/i.test(url) ? url : await getSignedUrl(url);
  return readVideoDurationFromSource(readableUrl);
}

function readVideoDurationFromSource(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";        // ดาวน์โหลดแค่ metadata, ไม่ได้ buffer วิดีโอเต็ม
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 5000);  // 5s hard timeout
    video.src = src;
  });
}
```

ใช้ `<video preload="metadata">` ของ HTML5 — browser จะ HTTP Range request เฉพาะ
ส่วนหัวของไฟล์เพื่ออ่าน duration metadata (ไม่ดาวน์โหลดทั้งคลิป) → fast +
ประหยัด bandwidth

### Mechanics ของ Seedance 2.0 API
จาก `_shared/seedance.ts` + comment ในไฟล์:

```
POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks
Body (Seedance 2.0):
{
  model: "dreamina-seedance-2-0-260128",   // หรือ -fast- (lite tier)
  ratio: "16:9",
  duration: 5,                              // output video duration
  resolution: "720p",
  generate_audio: true,
  watermark: false,
  content: [
    { type: "text", text: "<prompt>" },
    { type: "image_url", image_url: {...}, role: "first_frame" },  // keyframe mode
    { type: "image_url", image_url: {...}, role: "last_frame" },
    { type: "image_url", image_url: {...}, role: "reference_image" }, // reference mode
    { type: "video_url", video_url: {...}, role: "reference_video" }, // <-- ตัวนี้
    { type: "audio_url", audio_url: {...}, role: "reference_audio" },
  ]
}
```

**Constraint สำคัญของ reference_video** ที่ ByteDance API บังคับ:
- แต่ละคลิป: 2-15 วินาที (ตามที่ frontend validate)
- รวมกัน: ≤ 15 วินาที
- รวมไม่เกิน 3 คลิป (ใน script `slice(0, 3)`)
- Format: MP4, MOV (H.264 codec)
- Mode 1 (keyframe: first_frame/last_frame) **ผสมกับ** Mode 2 (reference_*) ใน
  request เดียว → reject 400

### สาเหตุที่ bug เกิด
1. Frontend ไม่ validate ฝั่ง client → ส่งไป backend
2. Backend forward ไป ByteDance Ark
3. Ark ตอบ 400 พร้อม error string → backend bubble ขึ้นเป็น error
4. Frontend toast แสดง raw text → user งง (ภาษาอังกฤษเทคนิค + ตัวเลขนาทีในข้อความ
   ไม่บอกว่าทำไม 2-15s, ทำไม total 15s)

แทนที่จะให้ user รอยิงไปทุกครั้งแล้วเสีย time-to-error ~3-5 วินาที, validator
หน้าบ้านจับก่อน → 0 round-trip + ข้อความบอกได้ละเอียดกว่า

### Issues อื่นที่อาจเกิดกับ Seedance 2.0 API
| ปัญหา | อาการ | ป้องกัน |
|---|---|---|
| Reference image > 9 รูป | API 400: "reference_image limit exceeded" | frontend cap ที่ 9 |
| Mixing keyframe + reference modes | API 400: "first/last frame content mixed with reference media" | UI ต้องมี XOR — ถ้ามี start_frame ก็ห้ามให้ใส่ reference_image พร้อมกัน |
| `ratio` ไม่ใช่หนึ่งใน 16:9 / 9:16 / 4:3 / 3:4 / 1:1 | API 400: invalid ratio | enum ใน schema |
| `resolution` 1080p + duration > 5s | บางรุ่น API 400 | เช็ค combo ก่อน submit |
| Reference video เป็น HTTPS แต่ URL หมดอายุก่อน Ark fetch | API 400: "could not fetch video_url" (signed URL TTL) | ใช้ TTL ≥ 60 นาที + re-sign ก่อน submit |
| Video codec ไม่ใช่ H.264 (เช่น HEVC/AV1) | API 400 หรือ silently fail | transcode ฝั่ง storage หรือ block ที่ upload |
| Audio reference > 30s | API 400 | validator audio (เหมือน video, ยังไม่ทำ) |
| `generate_audio: true` แต่ output 1080p | บางคอมโบไม่ support | ตรวจ matrix |
| Watermark forced บน free tier | output มี logo ByteDance | check tier |
| Concurrent task limit (5/account default) | 429 หรือ task queue ค้าง | ดู `enqueueRetryJob` กับ retry budget |

### TODO / improvement ที่อาจทำเพิ่ม
- Validate audio reference duration เหมือน video (≤ 30s ตาม spec)
- Validate file format/codec ฝั่ง client (ใช้ `video.videoTracks` หรือ MediaSource
  type check)
- รวม validator ลง `_shared/seedance.ts` (ฝั่ง backend) เป็น defense-in-depth —
  ตอนนี้ validation อยู่ frontend อย่างเดียว ถ้าใครเรียก edge function ตรงก็ผ่าน

---

## Fix 3 — `1d88a71` Extend workspace generation visible timeout

### อาการ
User submit งาน video gen → 30 นาทีผ่านไปยังไม่เสร็จ → frontend timeout, แสดง "การ
ประมวลผลใช้เวลานานเกินไป" → user reload → **เห็น output โผล่ใน asset library**
(เพราะ backend generate เสร็จจริงหลังจากนั้น) → confusing UX

### จุดที่แก้
`src/components/workspace/WorkspaceToolNode.tsx`:
```diff
- const MAX_VISIBLE_RUN_MS = 30 * 60_000;   // 30 minutes
+ const MAX_VISIBLE_RUN_MS = 60 * 60_000;   // 60 minutes (= worker deadline)
```

และ comment เปลี่ยน:
```diff
- // Hard wall — sweep cron will already have marked the
- // row failed long before this fires (5-min threshold vs
- // 30-min wall here), but keep the timer as a safety net
- // in case the realtime channel disconnects silently.
+ // Hard wall — keep this aligned with the durable worker's
+ // one-hour deadline in case the realtime channel disconnects
+ // silently.
```

### Logic
3 ตัวจับเวลาที่ทำงานพร้อมกัน:

1. **Frontend visible timeout** (`MAX_VISIBLE_RUN_MS`):
   - หลัง user กด Run, ตั้ง `setTimeout` ไว้ 60 นาที
   - ถ้าครบ → mark node เป็น `error` + แสดง toast "ใช้เวลานานเกินไป"
   - Safety net เผื่อ Supabase Realtime channel หลุดเงียบ ๆ
2. **Realtime polling** (Supabase channel + polling fallback):
   - subscribe ที่ `workspace_generation_jobs` row
   - ทุก 5 วินาที poll status field (กรณี realtime delay)
3. **Backend durable worker deadline** (= 60 นาที):
   - Edge function spawn job → row ถูกเขียนใน `workspace_generation_jobs`
   - Background worker (cron / scheduled function) วนเช็ค row → ถ้าเกินเวลา → mark
     `permanent_failed` + refund credits

### Mechanics ของ async job lifecycle
```
[user click Run]
      │
      ▼
POST /workspace-run-node
      │
      ├── INSERT INTO workspace_generation_jobs
      │   (status='queued', provider, model, params, ...)
      │
      ▼
[provider.submitTask] (fire-and-forget pattern)
      │
      ├── Provider returns task_id (Kling/Seedance/Veo/Hyper3D)
      ├── UPDATE workspace_generation_jobs SET provider_task_id=..., status='running'
      │
      ▼
[edge function returns 200 immediately] ←── client polls/subscribes from here
      
[Background polling (in-process, then queue)]
      │
      ├── INLINE_BUDGET_ATTEMPTS = 4 ครั้งใน-process retry
      │   (ถ้า provider 5xx / queue busy)
      │
      ├── ถ้าเกิน inline budget → enqueue retry to provider_retry_queue
      │   → cron worker ดึงไป retry ภายหลัง
      │
      ▼
[provider task done] → UPDATE row (status='succeeded' + output_url)
                    OR (status='permanent_failed' + error)
      │
      ▼
[Supabase Realtime ส่ง postgres_changes event]
      │
      ▼
[client subscribes, อัปเดต UI ตาม row]
```

### สาเหตุที่ bug เกิด
**Mismatch ระหว่าง 3 timer**:
- Frontend timeout = 30 นาที (เก่า)
- Backend worker deadline = 60 นาที
- Frontend จึง give up ก่อน worker จะให้คำตอบสุดท้าย
- พอ user ปิด tab/reload → realtime channel หลุด → ตอน worker เขียน row จริง
  ภายหลัง, frontend ไม่รับ event แล้ว → ตอน user เปิดใหม่จึงเห็น output (เพราะ
  initial fetch รวม row ที่ status='succeeded')

ทำไม backend ใช้ 60 นาที? — Veo 3.1 / Kling Omni v2.6 รุ่นใหญ่ generation ทาง
provider จริงใช้ 5-30 นาที + inline retry budget (4 ครั้ง × initial 30s + back-
off) อาจทำให้รวม wall-clock ถึง 50-55 นาที โดย worst-case

### Issues อื่นเกี่ยวกับ async job pattern
| ปัญหา | อาการ | ป้องกัน |
|---|---|---|
| Realtime channel หลุดเงียบ | UI ค้าง running ทั้ง ๆ ที่ row done แล้ว | hard timeout 60min + 5s polling fallback |
| Browser tab sleep (mobile/laptop sleep) | timer ไม่ tick → ฟังต่อหลังตื่น | ใช้ `setTimeout` แทน `Date.now()` snapshot จะ skip ตอน sleep |
| Worker crash mid-generation | row status=running ค้างตลอด | sweep cron ที่ mark row > N นาทีเป็น failed + refund |
| Refund ตอน user ปิด tab | client ไม่รับ event credit refund | server-side refund ต้องเป็น authoritative — `refundCreditsAtomic` ใน edge fn |
| Multi-tab race | user open 2 tabs ทั้งคู่ subscribe ตัวเดียวกัน | OK เพราะ realtime broadcasts ไป subscribers ทั้งหมด, refund เกิดที่ DB ครั้งเดียว |
| Provider cancel flow | user กด Cancel — frontend แค่ mark UI แต่ provider ยัง process | ต้องเรียก provider's cancel endpoint (ส่วนใหญ่ Seedance/Kling/Veo มี API ให้) แล้ว refund |
| Stale row read on mount | client mount ตอน status=running แต่ realtime สาย → ส่ง running ค้าง | initial fetch ต้องเช็ค `created_at` < 60min ago, ถ้าเก่าให้ถือว่า timeout |

---

## Fix 4 — `01b07e4` Show provider generation errors in friendly copy

### อาการ
- User generate ด้วย Veo 3.1 ที่มี start_frame เป็น signed URL (Supabase storage) →
  Veo backend fetch URL ไม่ได้ (TTL หมด หรือ permission ผิด) → toast แสดง
  `Veo: failed to fetch start/end frame (404)`
- หรือ provider queue หนัก → toast แสดง `HTTP 503` / `Provider queue was busy`

### จุดที่แก้
- `src/lib/friendlyError.ts`: เพิ่ม 2 mapping ใหม่
  ```ts
  {
    match: /Veo: failed to fetch start\/end frame \((?:400|401|403|404|410)\)/i,
    th: "โหลดรูป Start/End Frame ไม่ได้ ไฟล์อาจหมดอายุหรือไม่มีสิทธิ์เข้าถึง ...",
    en: "The start/end frame could not be loaded. Re-upload or choose ...",
  },
  {
    match: /Provider queue was busy|provider.*busy|503|temporarily unavailable|high demand|overload/i,
    th: "ตอนนี้ผู้ให้บริการ AI มีคิวเยอะหรือโหลดสูง ระบบจะลองให้อัตโนมัติ ...",
    en: "The AI provider is busy right now. We'll keep retrying ...",
  },
  ```
- `src/components/workspace/WorkspaceToolNode.tsx`:
  - **2 จุด** ที่เคยแสดง raw error → แปลผ่าน `friendlyError`:
    1. Catch block ตอน submit (rejected by edge function)
    2. Realtime job-status event ที่บอก `failed` / `permanent_failed`
  - Insufficient credits ยังคงแสดง raw (เพราะ UI มี `<InsufficientCreditsDialog>`
    แยก parse ตัวเลข amount/short ออกมา)

### Mechanics ของ Veo 3.1 image input
จาก `_shared/veo.ts`:

```ts
export async function fetchImageAsInline(url: string): Promise<VeoImage> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Veo: failed to fetch start/end frame (${res.status})`);
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return { mimeType, data: btoa(binary) };
}
```

### ทำไม Veo ต้อง inline?
**Google Veo 3.1 REST API** (ผ่าน Vertex AI / Google AI Studio):
```
POST https://generativelanguage.googleapis.com/v1beta/models/veo-3.1:predictLongRunning
Body:
{
  instances: [{
    prompt: "...",
    image: {                     // ← start frame
      bytesBase64Encoded: "...",
      mimeType: "image/png"
    },
    lastFrame: {                 // ← end frame (optional)
      bytesBase64Encoded: "...",
      mimeType: "image/png"
    }
  }],
  parameters: {
    aspectRatio: "16:9",
    resolution: "720p" | "1080p",
    durationSeconds: 4 | 6 | 8,
    personGeneration: "allow_adult"
  }
}
```

Veo **ไม่รับ public URL** — ต้องเป็น base64 inline เท่านั้น
- (ต่างจาก Kling, Seedance, Tripo3D ที่รับ HTTPS URL)
- ดังนั้น backend ต้อง:
  1. ดึง bytes จาก URL (รองรับ Supabase storage signed URL, public S3, ฯลฯ)
  2. Base64 encode
  3. ใส่ลง request payload

ถ้า fetch ไม่สำเร็จ (เช่น signed URL TTL หมด) → throw error string เฉพาะ —
`Veo: failed to fetch start/end frame (<status>)`

### สาเหตุที่ bug เกิด
1. Supabase storage signed URL TTL default 60 นาที
2. User upload image, รอนานก่อน submit (เช่น เปิด tab ทิ้งไว้)
3. กด Run → frontend ส่ง `start_frame_url` (signed) ไป edge function
4. Edge function call `fetchImageAsInline(start_frame_url)` → 410 Gone (URL
   หมดอายุ)
5. Throw error → user เห็น `Veo: failed to fetch start/end frame (410)` ตรง ๆ

### Constraints + Quirks ของ Veo 3.1 ที่ควรรู้
| Param | ค่า | หมายเหตุ |
|---|---|---|
| `resolution` | `720p` / `1080p` | 1080p บังคับ `durationSeconds=8`; ถ้าส่ง 4 หรือ 6 → silently coerce (โค้ดทำให้แล้วใน `buildVeoRequest`) |
| `durationSeconds` | 4 / 6 / 8 | เลขอื่น API 400 |
| `aspectRatio` | 16:9 / 9:16 / 1:1 | อื่น ๆ ไม่รองรับ |
| `personGeneration` | allow_adult / dont_allow / allow_all | safety filter — เปลี่ยนได้ใน schema |
| Image input | base64 inline เท่านั้น | URL ไม่รองรับ — เป็นเหตุของ fetch failure |
| Image format | PNG / JPEG / WebP | HEIC/AVIF อาจ reject |
| Image size | ≤ 8MB ต่อรูป | ใหญ่กว่านี้ payload ใหญ่ + อาจ 413 |
| Output URL | TTL 7 วันใน GCS หลัง operation done | ต้อง download + re-upload ลง storage ของเรา |

### Issues อื่นที่อาจเกิดกับ Veo 3.1 API
| ปัญหา | สถานะที่เห็น | ทาง mitigate |
|---|---|---|
| Signed URL TTL หมด | `failed to fetch start/end frame (410)` | extend TTL เป็น 24 hr สำหรับ workspace, หรือ re-sign ใน edge fn ก่อน fetch |
| Image input bug ใน early Veo 3.1 (Apr 2026) | `Veo image input was rejected` | mapping มีอยู่แล้ว — แนะนำให้ user ลอง Text-to-Video |
| `models/veo.* not found` | API rotated model id | update `VEO_MODEL_MAP` |
| Concurrent quota (Vertex/AI Studio) | 429 / rate limit | retry queue + per-user concurrency limit |
| Long generation (>15min) timing out | client visible timeout | fix #3 ขยายเป็น 60min |
| Output watermark (Google's SynthID) | ฝังในวิดีโอเสมอ | แจ้งใน UI, ไม่สามารถปิด |
| Region availability | บาง model ใช้ได้เฉพาะ us-central1 | check `loadVeoApiKey()` + endpoint `VEO_BASE` |

### Mechanics ของ provider retry budget (`_shared/providerRetry.ts`)
```ts
INLINE_BUDGET_ATTEMPTS = 4;       // ใน edge function call เดียว
PRIMARY_RETRIES        = 6;       // queued retry (ระยะแรก)
EXTENDED_RETRIES       = 12;      // queued retry (ระยะยาว, exponential backoff)
TOTAL_MAX_RETRIES      = 18;      // = PRIMARY + EXTENDED
```

Flow:
1. Edge function เรียก `executeWithInlineBudget()` — 4 attempts inline
2. ถ้ายัง fail → `enqueueRetryJob(provider_retry_queue)` → background cron retry
3. Backoff: เริ่ม 30s, doubling จนถึง ~5min
4. ครบ 18 attempts → mark row `permanent_failed` + refund credits

ดังนั้นเวลา user เห็นข้อความ "ระบบจะลองให้อัตโนมัติจนกว่าจะครบเวลา หากไม่สำเร็จ
จะคืนเครดิตให้" — มันจริงตามนี้

---

## ตารางเปรียบเทียบ AI providers

| Provider | Image input format | URL TTL ที่จำเป็น | Output URL TTL | API base |
|---|---|---|---|---|
| **Veo 3.1** (Google) | base64 inline เท่านั้น | ไม่เกี่ยว (server-side fetch) | 7 วัน (GCS signed) | `generativelanguage.googleapis.com/v1beta` |
| **Seedance 2.0** (ByteDance) | HTTPS URL (server fetches) | ≥ duration ของ task (~5-30min) | 24 ชม. | `ark.ap-southeast.bytepluses.com/api/v3` |
| **SeedDream** (ByteDance image) | HTTPS URL | เหมือน Seedance | 24 ชม. | เดียวกับ Seedance |
| **Kling AI** | HTTPS URL | ≥ task duration | 30 วัน | Kling APIv1 (proxied) |
| **Hyper3D / Tripo3D** | HTTPS URL | ≥ task duration | 7 วัน | `api.tripo3d.ai` |

ความหมายของตาราง: **ระวัง signed URL TTL** ให้ยาวพอสำหรับ provider ดึงไฟล์ — ปัญหาที่
fix #4 แก้คือเพราะตอน submit ไป Veo, signed URL ของ start_frame หมดอายุระหว่างทาง

---

## สรุป

| Fix | กลุ่ม | Root cause | Lesson |
|---|---|---|---|
| 1. start frame crash | JS scope | Sub-component refactor ทิ้ง `language` ให้กลายเป็น undefined identifier | Audit ต้อง scan ทั้ง `i18n(`, `language`, `t(` ไม่ใช่แค่ตัวเดียว |
| 2. Seedance ref video | Provider input validation | ไม่มี client-side guard, raw API error bubble | Validate constraints ของ provider ที่ฝั่ง client ก่อน submit |
| 3. timeout 30→60min | Async job timing | Frontend timer สั้นกว่า worker deadline → race | Document timer hierarchy + sync ค่าระหว่าง layers |
| 4. friendly errors | UX / error mapping | Raw provider strings แสดงตรง ๆ | Funnel ทุก toast.error ผ่าน `friendlyError()` + ขยาย mapping เมื่อเจอ pattern ใหม่ |

ทั้ง 4 fix เป็น **incremental UX improvements** บน foundation เดิมของ workspace
canvas — ไม่มี architecture change ใหญ่
