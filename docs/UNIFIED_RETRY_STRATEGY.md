# Unified Provider Retry Strategy (12 + Health Probe + 6)

> **Status:** Production
> **Owner:** Execution Engine
> **Last updated:** 2026-04-21
> **Files:** `supabase/functions/_shared/providerRetry.ts`, `run-flow-init`, `execute-pipeline-step`, `sweep-stuck-runs`

---

## 1. Why this exists

ก่อนหน้านี้ **single-node** กับ **multi-node** ใช้ retry คนละตัว (5 vs 12 ครั้ง) ทำให้ user เจอ refund บ่อยเกินจำเป็นเวลา provider แค่ "คิว
ล้น" ชั่วคราว

เป้าหมายของระบบใหม่:

1. **ลดอัตรา failure ที่ user เห็น** — user กดเจนแล้วไปทำอย่างอื่น เขาต้องการผลลัพธ์ ไม่ใช่ refund
2. **แยก "provider ล้ม" ออกจาก "provider ยุ่ง"** — ถ้า upstream ตายจริง ไม่ต้องรอเสียเวลา
3. **ใช้ logic เดียวกันทั้ง single และ multi-node** — ลด drift, แก้ที่เดียวจบ

---

## 2. กลยุทธ์ภาพรวม

```
┌────────────────────────────────────────────────────────────────┐
│  Phase 1: PRIMARY_RETRIES = 12 ครั้ง                          │
│  Backoff: 3s × 2^n, cap ที่ 60s + jitter                       │
│  งบเวลาสูงสุด: ~10 นาที                                        │
└────────────────────────────────────────────────────────────────┘
                          │
                  fail ทั้ง 12 ครั้ง
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  Health Probe → ping provider โดยตรง                           │
└────────────────────────────────────────────────────────────────┘
            │                                  │
      healthy ✓                          unhealthy ✗
            │                                  │
            ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│  Phase 2: EXTENDED_RETRIES=6 │   │  refund ทันที            │
│  สมมติว่า "high demand"      │   │  classification:         │
│  งบเวลาเพิ่ม: ~6 นาที        │   │  "provider_down"         │
└──────────────────────────────┘   └──────────────────────────┘
            │
            ▼
   success / exhausted / permanent
```

**งบเวลารวมแย่สุด:** ~16 นาที (ก่อน refund)
**Cron sweep:** ตั้งไว้ 20 นาที ใน `sweep-stuck-runs`

---

## 3. Error Classification

`classifyError(errMsg)` คืน 3 ค่า:

| ประเภท | ตัวอย่าง | พฤติกรรม |
|---|---|---|
| `permanent` | billing, safety, prompt blocked, invalid input | **หยุดทันที** ไม่ retry, ไม่ probe |
| `transient` | 5xx, 429, timeout, ECONNRESET, overload, queue, rate limit | retry ตาม phase |
| `unknown` | error อื่นๆ | retry แบบปลอดภัย แล้ว probe ตอนจบ phase 1 |

→ **Permanent error short-circuit ที่ phase ไหนก็ได้** (ไม่ต้องรอครบ 12)

---

## 4. Health Probe

`defaultProbeProviderHealth(provider)` ยิง endpoint เบาๆ เพื่อเช็ค provider จริง:

| Provider | Endpoint ที่ probe |
|---|---|
| `kling`, `kling_extension`, `motion_control` | `GET /v1/videos/text2video?pageSize=1` (พร้อม JWT) |
| `banana`, `chat_ai` | `GET /v1beta/models?key=...` (Google AI) |
| `remove_bg` | `GET /v1/account` (Replicate) |
| อื่นๆ | สมมติ healthy |

ผลลัพธ์: `{ healthy: boolean, reason: string }` — เก็บลง `RetryOutcome.health_probe` เพื่อ debug

---

## 5. Classifications ที่ caller ได้รับ

`RetryOutcome.classification`:

| Value | ความหมาย | Action ที่ caller ควรทำ |
|---|---|---|
| `success` | สำเร็จ | บันทึก output, ไม่ refund |
| `permanent` | error ที่ retry ไม่ช่วย (billing/safety) | refund + แสดง error ชัดเจนให้ user |
| `provider_down` | phase 1 หมด + probe บอก unhealthy | refund + log "upstream down" |
| `high_demand` | phase 1+2 หมด แต่ provider healthy | refund + แนะนำ user ลองใหม่ภายหลัง |
| `exhausted` | (สำรอง — ปกติไม่เกิด) | refund |

---

## 6. การใช้งาน (Caller pattern)

ทั้ง `run-flow-init` (single-node) และ `execute-pipeline-step` (per-node ใน multi-node pipeline) ใช้ pattern เดียวกัน:

```ts
import {
  executeWithUnifiedRetry,
  defaultProbeProviderHealth,
} from "../_shared/providerRetry.ts";

const outcome = await executeWithUnifiedRetry(
  async () => {
    // ยิง provider call ครั้งเดียว, throw ถ้า fail
    return await callKlingOrGeminiOrWhatever();
  },
  () => defaultProbeProviderHealth(providerKey),
  `[step-executor ${nodeId}]`,
);

if (outcome.classification === "success") {
  // เก็บ outcome.result
} else {
  // refund + บันทึก outcome.classification + outcome.health_probe
}
```

**Logging:** ทุก attempt มี prefix `[logTag]` พร้อมเลข attempt + delay → ค้น log ง่าย

---

## 7. Retry timing reference

| Attempt | Delay (ก่อน attempt นี้) | Cumulative time |
|---:|---:|---:|
| 1 | 0s | 0s |
| 2 | 3s | 3s |
| 3 | 6s | 9s |
| 4 | 12s | 21s |
| 5 | 24s | 45s |
| 6 | 48s | 1m 33s |
| 7 | 60s (cap) | 2m 33s |
| 8–12 | 60s × 5 | ~5m 33s |
| **probe** | ~1s | ~5m 34s |
| 13–18 (extended) | 60s × 6 | **~9m 34s** |

(+ jitter 0–750ms ต่อ attempt)

---

## 8. ปรับแต่ง constants

แก้ที่ `supabase/functions/_shared/providerRetry.ts`:

```ts
export const PRIMARY_RETRIES = 12;     // phase 1
export const EXTENDED_RETRIES = 6;     // phase 2 (high demand)
const BASE_DELAY_MS = 3000;            // 3s starting
const MAX_DELAY_MS = 60_000;           // 60s cap
```

**ถ้าจะลดงบเวลา:** ลด `MAX_DELAY_MS` ก่อน (impact ใหญ่สุด เพราะ attempts 7+ ติด cap)
**ถ้าจะเพิ่มความอดทน:** เพิ่ม `EXTENDED_RETRIES` (แต่ต้องขยับ `STUCK_THRESHOLD_MINUTES` ใน `sweep-stuck-runs` ด้วย)

---

## 9. ของที่ต้องระวัง

1. **Cron sweep timeout** — `sweep-stuck-runs` ตั้งไว้ 20 นาที ถ้าจะเพิ่ม retry ต้องขยับด้วย ไม่งั้น sweep จะตัด run ก่อน retry จบ
2. **Permanent error patterns** — regex ใน `classifyError` ครอบคลุมเฉพาะ error ที่เจอบ่อย ถ้า provider เพิ่ม error ใหม่ต้อง update regex
3. **Probe credentials** — ถ้า `KLING_*` / `GOOGLE_AI_STUDIO_KEY` / `REPLICATE_API_TOKEN` ขาด → probe คืน `unhealthy` → refund ทันที (จงใจ)
4. **Cost ของ probe** — endpoint ที่เลือกเป็น read-only / list 1 record → ไม่กิน quota จริง
5. **HTTP polling ฝั่ง frontend** — Kling video ที่ได้ `task_id` แล้ว frontend ยัง poll ทุก 7s แยกต่างหาก ระบบ retry นี้ครอบเฉพาะ "ตอนส่ง dispatch" เท่านั้น

---

## 10. Quick FAQ

**Q: ถ้า user ปิด browser ระหว่าง retry งานยังเดินต่อไหม?**
A: เดินต่อ. ทั้ง `run-flow-init` (single) และ `execute-pipeline-step` (multi) ทำงานเป็น background process ใน edge function. Frontend แค่ poll สถานะ.

**Q: ทำไมไม่ใช้ exponential backoff แบบสั้นกว่านี้?**
A: provider AI (โดยเฉพาะ Kling) มี cooldown หลังคิวล้นค่อนข้างนาน (10–60s) ใช้ delay สั้นจะ retry เปล่า ไม่ช่วยอะไร. patient backoff ลด wasted attempts ได้มาก.

**Q: ทำไม probe ถึงทำหลัง phase 1 ไม่ทำก่อน?**
A: 99% ของ run สำเร็จใน attempt 1–2 — probe ทุกครั้งจะเสีย latency ฟรี. probe หลัง 12 fails คือจุดที่คุ้มค่าที่สุด.

**Q: `permanent` กับ `provider_down` ต่างกันยังไงในการ refund?**
A: ทั้งคู่ refund แต่ message ต่างกัน — `permanent` = "input ของคุณมีปัญหา" / `provider_down` = "ระบบ AI ขัดข้อง ลองใหม่ภายหลัง"

---

*End of doc*
