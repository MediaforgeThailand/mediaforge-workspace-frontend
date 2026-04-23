# MediaForge — ระบบคำนวณ Credits (Credit Pricing System)

> **เอกสารนี้อธิบายการทำงานทั้งหมดของระบบ Credits** ตั้งแต่โครงสร้างฐานข้อมูล, การคำนวณราคาต่อโหนด, การคำนวณราคา Flow ทั้งก้อน, ไปจนถึงการตั้งค่าราคาใน Admin Panel  
> อัปเดตล่าสุด: 2026-04-06

---

## สารบัญ

1. [ภาพรวมระบบ (System Overview)](#1-ภาพรวมระบบ)
2. [อัตราแลกเปลี่ยน (Exchange Rate)](#2-อัตราแลกเปลี่ยน)
3. [ตาราง credit_costs — แหล่งข้อมูลราคาหลัก](#3-ตาราง-credit_costs)
4. [การค้นหาราคา (lookupBaseCost)](#4-การคนหาราคา-lookupbasecost)
5. [สูตรคำนวณราคาขาย (calculatePricing)](#5-สูตรคำนวณราคาขาย-calculatepricing)
6. [การคำนวณราคา Flow ทั้งก้อน (quoteFlowCost)](#6-การคำนวณราคา-flow-ทั้งก้อน)
7. [ส่วนลดสมาชิก (Subscription Discounts)](#7-สวนลดสมาชิก)
8. [Creator Revenue Share](#8-creator-revenue-share)
9. [กระบวนการหักเครดิตและคืนเครดิต (Deduct & Refund)](#9-กระบวนการหักเครดิตและคืนเครดิต)
10. [Strict Mode — ไม่มี Fallback](#10-strict-mode)
11. [ตัวอย่างการคำนวณแบบครบวงจร](#11-ตัวอย่างการคำนวณแบบครบวงจร)
12. [การตั้งค่าราคาผ่าน Admin Panel](#12-การตั้งค่าราคาผ่าน-admin-panel)
13. [Appendix: ราคา Base Cost ปัจจุบัน](#13-appendix-ราคา-base-cost-ปัจจุบัน)

---

## 1. ภาพรวมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (PlayFlow)                      │
│  User เลือกพารามิเตอร์ → Debounce → เรียก /quote-flow       │
└───────────────┬─────────────────────────────────────────────┘
                │ POST { flow_id, graph_nodes, all_node_params }
                ▼
┌─────────────────────────────────────────────────────────────┐
│              Edge Function: quote-flow                        │
│  1. ดึงข้อมูล Flow (markup_multiplier, is_official)          │
│  2. ดึง Subscription discount ของ User                       │
│  3. วน Loop ทุก Action Node → lookupBaseCost()               │
│  4. รวม Total Base Cost → calculatePricing()                 │
│  5. Return { price, base_cost, discount, breakdown }         │
└───────────────┬─────────────────────────────────────────────┘
                │ SELECT ... FROM credit_costs
                ▼
┌─────────────────────────────────────────────────────────────┐
│              Database: credit_costs table                     │
│  Exact match: feature + model + duration + has_audio          │
│  ⚠️ ไม่มี Row = PricingConfigError → Block Execution         │
└─────────────────────────────────────────────────────────────┘
```

**หลักการสำคัญ:**
- ทุกราคาต้องมีอยู่ในตาราง `credit_costs` เท่านั้น (Strict Mode)
- ไม่มี Hardcoded Fallback — ถ้าไม่มีราคาในตาราง ระบบจะ **บล็อกการทำงาน**
- การคำนวณทุกอย่างเกิดที่ **Backend** (Edge Functions) เท่านั้น
- Frontend เป็นแค่ **Display** ไม่มีการคำนวณราคาจริง

---

## 2. อัตราแลกเปลี่ยน

| หน่วย | ค่า |
|--------|-----|
| 1 THB | = 25 Credits |
| 1 Credit | = 0.04 THB |

> ⚠️ **การคำนวณทั้งหมดใช้ INTEGER เท่านั้น** — ไม่มี floating-point เพื่อป้องกันปัญหาทศนิยม

---

## 3. ตาราง credit_costs

ตาราง `credit_costs` คือ **Single Source of Truth** สำหรับราคาต้นทุนของทุก AI Model

### Schema

| Column | Type | คำอธิบาย |
|--------|------|----------|
| `id` | UUID | Primary key |
| `feature` | TEXT | ประเภทฟีเจอร์: `chat_ai`, `generate_freepik_image`, `generate_freepik_video` |
| `model` | TEXT | Model slug (ต้องตรงกับ Frontend Schema เป๊ะ) |
| `label` | TEXT | ชื่อแสดงผล เช่น "Kling 2.6 Pro 5s Silent" |
| `cost` | INTEGER | **Base Cost** เป็นจำนวนเครดิต |
| `pricing_type` | TEXT | `per_operation`, `fixed`, `per_second` |
| `duration_seconds` | INTEGER | ความยาววิดีโอ (เฉพาะ video) |
| `has_audio` | BOOLEAN | มีเสียงหรือไม่ (เฉพาะ video) |

### กฎสำคัญ

1. **Model slug ต้องตรง 100%** — ไม่มี fuzzy matching
2. **Video ต้องมีหลาย Row** — 1 model อาจมี 4 rows (5s/10s × audio/silent)
3. **Image & Chat ใช้ 1 Row ต่อ 1 Model** — ไม่มี duration/audio

---

## 4. การค้นหาราคา (lookupBaseCost)

ฟังก์ชัน `lookupBaseCost()` ใน `_shared/pricing.ts` ทำหน้าที่ค้นหา Base Cost ตาม Provider:

### 4.1 Image (Banana Pro Node)

```
Query: SELECT cost FROM credit_costs
  WHERE feature = 'generate_freepik_image'
  AND   model   = params.model_name
```

**Parameter ที่ใช้:** `model_name` เท่านั้น  
**ตัวอย่าง:** `model_name = "nano-banana-pro"` → cost = **104 credits**

### 4.2 Chat AI (Chat AI Node)

```
Query: SELECT cost FROM credit_costs
  WHERE feature = 'chat_ai'
  AND   model   = params.model_name
```

**Parameter ที่ใช้:** `model_name` (full slug รวม provider prefix)  
**ตัวอย่าง:** `model_name = "google/gemini-3.1-pro-preview"` → cost = **75 credits**

### 4.3 Video (Kling I2V / Motion Control)

```
Query: SELECT cost FROM credit_costs
  WHERE feature          = 'generate_freepik_video'
  AND   model            = params.model_name
  AND   duration_seconds = params.duration
  AND   has_audio        = params.has_audio
```

**Parameters ที่ใช้:** `model_name` + `duration` + `has_audio`  
**ตัวอย่าง:** `model_name = "kling-v2-6-pro"`, `duration = 5`, `has_audio = false` → cost = **700 credits**

> 🔴 ถ้า Query ไม่เจอ Row → โยน `PricingConfigError` → Frontend แสดง Toast และ **ล็อกปุ่ม Run**

---

## 5. สูตรคำนวณราคาขาย (calculatePricing)

เมื่อได้ Base Cost แล้ว ระบบจะคำนวณราคาขายตามสูตร:

### 5.1 Consumer Run (ผู้ใช้ทั่วไป)

```
Raw Price    = ⌈ Base Cost × Markup Multiplier ⌉     (ปัดขึ้น)
Discount     = ⌊ Raw Price × Discount% / 100 ⌋       (ปัดลง)
Final Price  = max(Raw Price − Discount, 1)
Rev Share    = ⌊ (Final Price − Base Cost) × 20% ⌋
```

- **Markup Multiplier** = 2.5× (ค่าคงที่สำหรับทุก Flow)
- **Discount%** = ขึ้นอยู่กับแพลนสมาชิกของผู้ใช้

### 5.2 Owner Test Run (เจ้าของ Flow ทดสอบเอง)

```
Deduction = ⌈ Base Cost × 1.1 ⌉     (เสีย 110% ของ Base Cost, ไม่มี Rev Share)
```

---

## 6. การคำนวณราคา Flow ทั้งก้อน

Flow หนึ่งอาจมีหลายโหนด (Node) ระบบจะ:

1. **วน Loop ทุก Action Node** ใน Graph (ข้าม Input/Output Node)
2. **lookupBaseCost()** ของแต่ละ Node
3. **รวม Total Base Cost** = ผลรวมของทุก Node
4. **calculatePricing()** บน Total เพียงครั้งเดียว

```
Flow: [Image Gen] → [Video Gen] → [Output]
         104     +     700      = 804 Base Cost

Consumer Price = ⌈804 × 2.5⌉ = 2,010 credits (ก่อนส่วนลด)
```

### Node Type Registry

| Node Type | Provider | Feature | Output |
|-----------|----------|---------|--------|
| `klingVideoNode` | kling | generate_freepik_video | video_url |
| `klingExtensionNode` | kling_extension | generate_freepik_video | video_url |
| `motionControlNode` | motion_control | generate_freepik_video | video_url |
| `bananaProNode` | banana | generate_freepik_image | image_url |
| `chatAiNode` | chat_ai | chat_ai | text |

---

## 7. ส่วนลดสมาชิก

ส่วนลดคำนวณที่ Backend จาก `subscription_plans` ของผู้ใช้:

| แพลน | ส่วนลด Official Flow | ส่วนลด Community Flow | Cashback |
|-------|----------------------|----------------------|----------|
| Starter | 0% | 0% | 0% |
| Growth | 10% | 5% | 3% |
| Scale | 20% | 10% | 5% |

**ตัวอย่าง:** User แพลน Growth ใช้ Official Flow  
```
Raw Price  = 2,010 credits
Discount   = ⌊2,010 × 10%⌋ = 201 credits
Final      = 2,010 − 201 = 1,809 credits
```

---

## 8. Creator Revenue Share

Creator ของ Flow จะได้ส่วนแบ่ง **20% ของ Profit** ต่อการรันแต่ละครั้ง:

```
Profit     = Final Price − Base Cost
Rev Share  = ⌊ Profit × 20% ⌋
```

**ตัวอย่าง:**
```
Final Price  = 1,809 credits
Base Cost    = 804 credits
Profit       = 1,005 credits
Rev Share    = ⌊1,005 × 20%⌋ = 201 credits → Creator ได้
```

> Creator ที่มี Performance Bonus จะได้เพิ่มเติม (สูงสุด 50% ของ Profit)

---

## 9. กระบวนการหักเครดิตและคืนเครดิต

### 9.1 การหัก (consume_credits RPC)

```
1. ตรวจสอบยอดเครดิตรวมใน credit_batches ที่ยังไม่หมดอายุ
2. pg_advisory_xact_lock(user_id) — ล็อกเพื่อป้องกัน Race Condition
3. หักจาก Batch ตามลำดับ: Top-up ก่อน → Subscription ทีหลัง (FIFO by expiry)
4. อัปเดต user_credits.balance
5. บันทึก credit_transactions
```

### 9.2 การคืน (refund_credits RPC)

ถ้า AI API ล้มเหลว ระบบจะคืนเครดิตอัตโนมัติ:

```
1. pg_advisory_xact_lock(user_id) — ล็อก
2. สร้าง credit_batch ใหม่ (type = 'refund', หมดอายุ 30 วัน)
3. เพิ่ม balance กลับ
4. บันทึก credit_transactions (type = 'refund')
```

### 9.3 Flow ของเงิน

```
                    ┌──────────────────┐
                    │   User Balance    │
                    └────────┬─────────┘
                             │ consume_credits (Deduct upfront)
                             ▼
                    ┌──────────────────┐
                    │  Pipeline Start   │
                    │  (run-flow-init)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Execute Node 1   │── ❌ Fail → refund_credits
                    └────────┬─────────┘
                             │ ✅ Success
                    ┌────────▼─────────┐
                    │  Execute Node 2   │── ❌ Fail → refund_credits
                    └────────┬─────────┘
                             │ ✅ Success
                    ┌────────▼─────────┐
                    │   Complete ✅     │
                    │  (No refund)      │
                    └──────────────────┘
```

---

## 10. Strict Mode

ระบบใช้ **Strict Manual Pricing** — ไม่มี Fallback:

| สถานการณ์ | ผลลัพธ์ |
|-----------|---------|
| Model มี Row ในตาราง | ✅ ใช้ cost จากตาราง |
| Model **ไม่มี** Row ในตาราง | 🔴 `PricingConfigError` → HTTP 400 |
| Frontend ได้รับ 400 | 🔴 แสดง Toast + ล็อกปุ่ม Run |
| Admin Panel | ⚠️ แสดง "Missing Models" badge สีแดง |

### ทำไมต้อง Strict?

- ป้องกัน **Revenue Loss** จากราคาผิดพลาด
- บังคับให้ Admin **ตั้งค่าราคาก่อน** เปิดใช้ Model ใหม่
- ทุก Model ต้องผ่านการ **Audit ราคาอย่างชัดเจน**

---

## 11. ตัวอย่างการคำนวณแบบครบวงจร

### สถานการณ์: User (แพลน Growth) รัน Community Flow ที่มี 3 โหนด

**Flow Graph:**
```
[Image Gen: nano-banana-pro] → [Chat AI: gemini-3.1-pro] → [Video Gen: kling-v2-6-pro 10s + audio]
```

#### ขั้นที่ 1: lookupBaseCost ของแต่ละ Node

| Node | Model | Params | Base Cost |
|------|-------|--------|-----------|
| Image Gen | `nano-banana-pro` | — | 104 |
| Chat AI | `google/gemini-3.1-pro-preview` | — | 75 |
| Video Gen | `kling-v2-6-pro` | duration=10, audio=true | 2,800 |
| **รวม** | | | **2,979** |

#### ขั้นที่ 2: calculatePricing

```
Markup Multiplier = 2.5×
Raw Price         = ⌈2,979 × 2.5⌉ = 7,448 credits

Subscription Discount (Growth, Community Flow) = 5%
Discount          = ⌊7,448 × 5%⌋ = 372 credits
Final Price       = 7,448 − 372 = 7,076 credits
```

#### ขั้นที่ 3: Revenue Split

```
Profit     = 7,076 − 2,979 = 4,097 credits
Rev Share  = ⌊4,097 × 20%⌋ = 819 credits → Creator ได้
Platform   = 4,097 − 819 = 3,278 credits → Platform ได้
```

#### ขั้นที่ 4: สรุป

| รายการ | Credits | THB (÷25) |
|--------|---------|-----------|
| ผู้ใช้จ่าย | 7,076 | ≈ 283 ฿ |
| ต้นทุน API | 2,979 | ≈ 119 ฿ |
| Creator ได้ | 819 | ≈ 33 ฿ |
| Platform ได้ | 3,278 | ≈ 131 ฿ |

---

## 12. การตั้งค่าราคาผ่าน Admin Panel

### เข้าถึง: `/admin/pricing` (Pricing Manager)

Admin Panel มีฟีเจอร์สำคัญ:

### 12.1 Missing Models Alert

ระบบจะเทียบ **Model ทั้งหมดใน Frontend Schema** กับ **ข้อมูลในตาราง credit_costs** อัตโนมัติ  
ถ้าพบ Model ที่ยังไม่ได้ตั้งค่าราคา จะแสดง Badge สีแดง: "⚠️ X Models Missing Pricing — Execution Blocked"

### 12.2 Dynamic Model Dropdown

เมื่อเพิ่ม Pricing Rule ใหม่:
1. เลือก **Feature** (Chat AI / Image / Video)
2. Dropdown **Model** จะแสดงเฉพาะ Model ที่รองรับใน Feature นั้น
3. Model ทั้งหมดดึงจาก `nodeApiSchema.ts` → ไม่ต้องพิมพ์เอง

### 12.3 Video Pricing — ต้องสร้างหลาย Row

สำหรับ Video Model 1 ตัว ต้องสร้าง **สูงสุด 4 rows**:

| Row | Duration | Audio | ตัวอย่าง Cost |
|-----|----------|-------|---------------|
| 1 | 5s | No | 700 |
| 2 | 10s | No | 1,400 |
| 3 | 5s | Yes | 1,400 |
| 4 | 10s | Yes | 2,800 |

### 12.4 Unconfigured Warning

Row ที่มี cost ≥ 9999 จะแสดงเป็น **สีแดง** พร้อมไอคอน ⚠️  
เตือนว่ายังเป็นค่า Placeholder ที่ต้องแก้ไขก่อน Production

---

## 13. Appendix: ราคา Base Cost ปัจจุบัน

### Chat AI

| Model | Slug | Base Cost (Credits) |
|-------|------|---------------------|
| Gemini 3 Flash | `google/gemini-3-flash-preview` | 25 |
| GPT-5 Mini | `openai/gpt-5-mini` | 50 |
| Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | 75 |
| GPT-5 | `openai/gpt-5` | 100 |

### Image Generation

| Model | Slug | Base Cost (Credits) |
|-------|------|---------------------|
| Nano Banana Pro | `nano-banana-pro` | 104 |
| Nano Banana 2 | `nano-banana-2` | ⚠️ 9999 (ยังไม่ตั้งค่า) |
| Nano Banana | `nano-banana` | ⚠️ 9999 (ยังไม่ตั้งค่า) |

### Video Generation (I2V — Kling)

| Model | Duration | Audio | Base Cost |
|-------|----------|-------|-----------|
| Kling 2.6 Pro | 5s | ❌ | 700 |
| Kling 2.6 Pro | 10s | ❌ | 1,400 |
| Kling 2.6 Pro | 5s | ✅ | 1,400 |
| Kling 2.6 Pro | 10s | ✅ | 2,800 |
| Kling 3.0 Pro | — | — | ⚠️ 9999 (ยังไม่ตั้งค่า) |
| Kling Video O1 | — | — | ⚠️ 9999 (ยังไม่ตั้งค่า) |
| Kling 3.0 Omni | — | — | ⚠️ 9999 (ยังไม่ตั้งค่า) |

### Video Generation (Motion Control)

| Model | Pricing Type | Base Cost |
|-------|-------------|-----------|
| Kling 2.6 Motion Pro | per_second | 280 /s |
| Kling 2.6 Motion Std | per_second | 140 /s |

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|---------|
| `supabase/functions/_shared/pricing.ts` | Backend pricing logic (lookupBaseCost, calculatePricing) |
| `supabase/functions/quote-flow/index.ts` | Edge Function สำหรับ quote ราคาก่อนรัน |
| `supabase/functions/run-flow-init/index.ts` | เริ่มต้น Pipeline + หักเครดิต |
| `supabase/functions/execute-pipeline-step/index.ts` | ประมวลผลแต่ละ Node + refund ถ้าล้มเหลว |
| `src/lib/flowPricing.ts` | Frontend display utility (ไม่ใช่ pricing จริง) |
| `src/constants/availableModels.ts` | รายการ Model ทั้งหมดสำหรับ Admin UI |
| `src/components/flow/nodes/nodeApiSchema.ts` | Schema ของทุก Node (Single Source of Truth) |
| `src/pages/admin/PricingManager.tsx` | Admin UI สำหรับจัดการราคา |

---

> 📝 **หมายเหตุ:** เอกสารนี้สะท้อนสถานะล่าสุดของระบบ หากมีการเพิ่ม Model ใหม่ ให้อัปเดตทั้ง `nodeApiSchema.ts`, `availableModels.ts` และสร้าง Row ใหม่ในตาราง `credit_costs` ผ่านหน้า Admin Pricing Manager
