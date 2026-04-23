# Background Processing & Notification System

> **For:** Developers & Contributors | **Updated:** 2026-04-05  
> **Related files:** `src/pages/play-flow/index.tsx`, `src/store/useBackgroundExecutionStore.ts`, `src/components/GlobalExecutionWatcher.tsx`, `supabase/functions/run-flow-init/index.ts`, `supabase/functions/run-flow-status/index.ts`

---

## Overview

เมื่อผู้ใช้กด "Run" บนหน้า PlayFlow ระบบจะ **ไม่รอ** ให้ AI สร้างผลลัพธ์เสร็จ แต่จะแสดงสถานะทันทีผ่าน **Optimistic UI** และทำงานเบื้องหลัง (Fire-and-Forget)

ผู้ใช้สามารถเปลี่ยนหน้าหรือรัน Flow อื่นได้โดยไม่ต้องรอ

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (React SPA)                                           │
│                                                                 │
│  1. User clicks "Run"                                           │
│     │                                                           │
│     ▼                                                           │
│  2. Generate UUID → runId = crypto.randomUUID()                 │
│     │                                                           │
│     ▼                                                           │
│  3. addBackgroundTask({ runId, flowId, status: "processing" })  │
│     │  ← UI shows notification card IMMEDIATELY                 │
│     ▼                                                           │
│  4. fetch('run-flow-init', { run_id: runId, ... })              │
│     │  ← Non-blocking: user can navigate away                  │
│     │                                                           │
│  ┌──┴──────────────────────────────────────────┐                │
│  │  GlobalExecutionWatcher (polls every 7s)    │                │
│  │  - Checks run-flow-status for each task     │                │
│  │  - Updates store on complete/fail           │                │
│  │  - Shows floating cards at top-right        │                │
│  └─────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Supabase Edge Functions)                              │
│                                                                 │
│  run-flow-init                                                  │
│  ├── Accept run_id from frontend                                │
│  ├── Insert flow_runs row with id = run_id, status = processing │
│  ├── Deduct credits upfront (consume_credits RPC)               │
│  ├── Call AI Provider (Kling / Lovable Gateway / etc.)          │
│  └── Return task_id (for async providers like Kling)            │
│                                                                 │
│  run-flow-status (called by GlobalExecutionWatcher)             │
│  ├── Poll AI provider for task status                           │
│  ├── If succeed → update flow_runs, upload to storage           │
│  ├── If failed  → update flow_runs, refund credits              │
│  └── Return { status, output_url, refunded }                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Zustand Store (`useBackgroundExecutionStore`)

**File:** `src/store/useBackgroundExecutionStore.ts`

จัดเก็บรายการงานที่กำลังทำงานอยู่ ข้อมูลถูก persist ลง `localStorage` (key: `mf-background-tasks`) เพื่อให้อยู่รอดแม้ refresh หน้า

```typescript
interface BackgroundTask {
  runId: string;        // UUID ที่สร้างจาก frontend
  flowId: string;       // ID ของ flow ที่รัน
  flowName: string;     // ชื่อ flow (แสดงบน notification)
  status: "processing" | "completed" | "failed";
  taskId?: string;      // Task ID จาก AI provider (e.g. Kling)
  creditCost?: number;  // เครดิตที่หักไป
  startedAt: number;    // timestamp เริ่มต้น
  completedAt?: number;
  refunded?: boolean;   // true ถ้าคืนเครดิตแล้ว
}
```

**Actions:**
| Action | Description |
|---|---|
| `addTask(task)` | เพิ่มงานใหม่ (เรียกก่อน fetch) |
| `completeTask(runId)` | เปลี่ยนสถานะเป็น completed |
| `failTask(runId, opts)` | เปลี่ยนสถานะเป็น failed + ข้อมูล refund |
| `dismissTask(runId)` | ลบออกจาก UI (ผู้ใช้กดปิด) |

### 2. GlobalExecutionWatcher

**File:** `src/components/GlobalExecutionWatcher.tsx`  
**Mounted in:** `App.tsx` (global, ทุกหน้า)

- แสดง floating notification cards ที่มุมขวาบน
- Poll ทุก 7 วินาทีสำหรับงานที่ยังเป็น `processing`
- แต่ละ card มี:
  - ไอคอนสถานะ (spinner / ✓ / ✗)
  - ชื่อ Flow
  - Timer แบบ realtime (เฉพาะ processing)
  - ปุ่ม dismiss (✕)
  - คลิกเพื่อนำทางไปหน้า `/play/:flowId`
  - เอฟเฟกต์ขอบเรืองแสง (CardShineEffect)

### 3. Notification System (`useNotifications`)

**File:** `src/hooks/useNotifications.ts`

ระบบแจ้งเตือนแยกจาก Background Tasks — ใช้ตาราง `notifications` ใน DB

- Realtime subscription ผ่าน Supabase channel
- Browser Notification API (เมื่อ tab ไม่ active)
- In-app toast popup
- Mark as read / Mark all / Clear all

---

## Execution Flow (Step-by-Step)

### Happy Path ✅

```
1. User กด "Run"
2. Frontend สร้าง runId = crypto.randomUUID()
3. Frontend เรียก addBackgroundTask({ runId, status: "processing" })
   → Notification card ปรากฏทันที พร้อม spinner + timer
4. Frontend ส่ง fetch('run-flow-init', { run_id: runId, ... })
5. Backend:
   a. Insert flow_runs (id = runId, status = 'processing')
   b. Deduct credits via consume_credits RPC
   c. Call AI provider → get task_id
   d. Update flow_runs.outputs with task_id
   e. Return { id: runId, task_id }
6. Frontend รับ response → store taskId ลง store
7. GlobalExecutionWatcher polls run-flow-status ทุก 7s
8. AI provider เสร็จ → run-flow-status returns { status: "succeed" }
9. GlobalExecutionWatcher เรียก completeTask(runId)
   → Card เปลี่ยนเป็น ✓ "Completed! Click to view result"
10. User คลิก card → navigate ไป /play/:flowId เพื่อดูผลลัพธ์
```

### Failure Path ❌

```
1-6. เหมือน Happy Path
7. GlobalExecutionWatcher polls run-flow-status
8. AI provider ล้มเหลว → run-flow-status detects failure
9. Backend:
   a. Create refund credit_batch (30-day expiry, source = 'topup')
   b. Increment user_credits.balance
   c. Log credit_transaction (type = 'refund')
   d. Update flow_runs.status = 'failed_refunded'
   e. Return { status: "failed_refunded", refunded: true }
10. GlobalExecutionWatcher เรียก failTask(runId, { refunded: true })
    → Card เปลี่ยนเป็น ✗ "Failed — credits refunded"
```

### Edge Cases

#### Frontend fetch ล้มเหลวทันที (network error)
```
1-3. สร้าง runId + addBackgroundTask
4. fetch throws error
5. catch block → failBackgroundTask(runId)
   → Card แสดง error ทันที
```

#### 504 Gateway Timeout
```
1-4. เหมือนปกติ
5. Backend ทำงานเสร็จแต่ HTTP response timeout
6. Frontend ได้รับ error แต่ DB มี row แล้ว
7. GlobalExecutionWatcher ยังคง poll ได้ เพราะ runId ตรงกับ DB
8. Poll สำเร็จ → completeTask ตามปกติ
```

#### User refresh หน้า
```
1. Store persist อยู่ใน localStorage
2. หลัง refresh → GlobalExecutionWatcher อ่าน store
3. พบ processing tasks → เริ่ม poll ต่อทันที
4. Flow ทำงานต่อได้ไม่สะดุด
```

#### Force Timeout (งานค้างนานเกิน)
```
1. Frontend ส่ง force_timeout: true ไปยัง run-flow-status
2. Backend บังคับเปลี่ยนสถานะเป็น failed_refunded
3. คืนเครดิตอัตโนมัติ
```

---

## Provider Retry Strategy (Unified 12 + 6)

ทั้ง `run-flow-init` (single-node) และ `execute-pipeline-step` (multi-node) ใช้ helper เดียวกันที่ `supabase/functions/_shared/providerRetry.ts`

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1 — PRIMARY_RETRIES = 12                             │
│  Backoff: 3s × 2^attempt, cap 120s + jitter (~20 นาที)      │
│  Permanent error (billing/safety/prompt) → หยุดทันที + refund │
└──────────────────────────┬──────────────────────────────────┘
                           │ exhausted (12 attempts failed)
                           ▼
                ┌──────────────────────┐
                │  Health Probe        │  → ping provider's
                │  (Kling/Gemini/      │     lightweight endpoint
                │   Replicate)         │
                └─────────┬────────────┘
                  healthy │ unhealthy
            ┌─────────────┘ └────────────┐
            ▼                            ▼
┌─────────────────────────────┐  ┌──────────────────────────┐
│ Phase 2 — EXTENDED_RETRIES  │  │ Provider DOWN            │
│ = 6 (high demand assumed)   │  │ → refund immediately     │
│ Backoff continues curve     │  │   (classification:       │
│ ~12 นาที                     │  │    provider_down)        │
│ → success OR refund         │  └──────────────────────────┘
│   (classification:          │
│    high_demand)             │
└─────────────────────────────┘
```

**Total worst-case:** ~32 นาที (12 + 6 attempts ที่ cap 120s)
**Sweep threshold:** `STUCK_THRESHOLD_MINUTES = 35` ใน `sweep-stuck-runs` เผื่อให้ retry budget เสร็จก่อนถูก force-refund

### Classifications ใน outcome
- `success` — ทำงานได้, ไม่มีปัญหา
- `permanent` — error ที่ retry ไม่ช่วย (billing/safety/prompt) → refund
- `provider_down` — phase 1 หมด + health probe = unhealthy → refund (ข้าม phase 2)
- `high_demand` — phase 1 หมด + provider healthy → ลอง phase 2 → ยังไม่ผ่าน → refund
- `exhausted` — fallback (ไม่ค่อยเกิด)


---

## Credit Flow During Execution

```
  ┌─────────────────────────────┐
  │  Before Run                 │
  │  Balance: 5,000 credits     │
  │  Cost: 1,750 credits        │
  └─────────────┬───────────────┘
                │
                ▼
  ┌─────────────────────────────┐
  │  Credits Deducted Upfront   │
  │  Balance: 3,250 credits     │
  │  (consume_credits RPC)      │
  └─────────────┬───────────────┘
                │
         ┌──────┴──────┐
         │             │
    SUCCESS          FAILURE
         │             │
         ▼             ▼
  ┌──────────┐  ┌─────────────────┐
  │ Keep     │  │ Auto-Refund     │
  │ deducted │  │ +1,750 credits  │
  │          │  │ Balance: 5,000  │
  └──────────┘  └─────────────────┘
```

---

## File Reference

| File | Role |
|---|---|
| `src/pages/play-flow/index.tsx` | Execution trigger (handleSubmit) — generates optimistic runId |
| `src/store/useBackgroundExecutionStore.ts` | Zustand store for background tasks |
| `src/components/GlobalExecutionWatcher.tsx` | Floating UI + polling logic |
| `src/hooks/useNotifications.ts` | DB-backed notification system (separate) |
| `supabase/functions/run-flow-init/index.ts` | Backend: accept run_id, deduct credits, call AI |
| `supabase/functions/run-flow-status/index.ts` | Backend: poll AI provider, handle refunds |
| `src/lib/flowPricing.ts` | Credit cost calculation |

---

## Debugging Tips

1. **Task ไม่ขึ้น UI?** → ตรวจ `localStorage` key `mf-background-tasks` ว่ามี task อยู่ไหม
2. **Poll ไม่ทำงาน?** → เปิด DevTools Console ดู log จาก GlobalExecutionWatcher
3. **เครดิตไม่คืน?** → ตรวจ `flow_runs.status` ใน DB ว่าเป็น `failed_refunded` หรือไม่
4. **504 Timeout?** → ระบบจะ recover ผ่าน polling ถ้า DB row ถูกสร้างแล้ว
5. **ทดสอบ UI?** → ใช้ Debug button บนหน้า PlayFlow (สร้าง fake task ด้วย `fake-` prefix)

---

*End of Document*
