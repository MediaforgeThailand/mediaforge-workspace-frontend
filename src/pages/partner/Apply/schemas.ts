import { z } from "zod";
import { isValidThaiNationalId } from "@/lib/validators/thaiNationalId";

const nameRegex = /^[\u0E00-\u0E7Fa-zA-Z\s'-]+$/;

export const step1Schema = z.object({
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: "กรุณายอมรับ Terms & Conditions" }),
  }),
});

export const step2Schema = z.object({
  legal_first_name: z
    .string()
    .min(1, "กรุณากรอกชื่อจริง")
    .regex(nameRegex, "ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ"),
  legal_last_name: z
    .string()
    .min(1, "กรุณากรอกนามสกุล")
    .regex(nameRegex, "ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ"),
  national_id: z
    .string()
    .length(13, "เลขบัตรประชาชนต้องมี 13 หลัก")
    .regex(/^\d{13}$/, "ต้องเป็นตัวเลขเท่านั้น")
    .refine(isValidThaiNationalId, "เลขบัตรประชาชนไม่ถูกต้อง (checksum ไม่ผ่าน)"),
  phone_e164: z
    .string()
    .regex(/^\+66\d{9}$/, "ต้องอยู่ในรูปแบบ +66XXXXXXXXX (9 หลักหลัง +66)"),
  phone_verified: z.literal(true, {
    errorMap: () => ({ message: "กรุณายืนยันเบอร์โทรด้วย OTP" }),
  }),
  address_line1: z.string().min(3, "กรุณากรอกที่อยู่"),
  address_line2: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "กรุณากรอกจังหวัด/เมือง"),
  postal_code: z.string().regex(/^\d{5}$/, "รหัสไปรษณีย์ 5 หลัก"),
  country_code: z.string().default("TH"),
});

export const BANKS = [
  "SCB",
  "KBANK",
  "BBL",
  "KTB",
  "BAY",
  "TTB",
  "CIMB",
  "UOB",
  "Kiatnakin",
  "Other",
] as const;

export const step3Schema = z.object({
  bank_name: z.enum(BANKS, { errorMap: () => ({ message: "กรุณาเลือกธนาคาร" }) }),
  bank_account_no: z
    .string()
    .regex(/^\d{10,12}$/, "เลขบัญชี 10-12 หลัก ตัวเลขเท่านั้น"),
  bank_account_name: z.string().min(3, "ชื่อบัญชีอย่างน้อย 3 ตัวอักษร"),
});

export const step4Schema = z.object({
  id_card_front_url: z.string().min(1, "กรุณาอัปโหลดบัตรประชาชน (ด้านหน้า)"),
  id_card_back_url: z.string().optional().or(z.literal("")),
  bank_book_url: z.string().min(1, "กรุณาอัปโหลดสมุดบัญชี / Statement"),
  selfie_with_id_url: z.string().optional().or(z.literal("")),
});

export const SOCIAL_PLATFORMS = [
  "TikTok",
  "YouTube",
  "Instagram",
  "Facebook",
  "Twitter",
  "Other",
] as const;

export const step5Schema = z.object({
  social_platform: z.enum(SOCIAL_PLATFORMS, {
    errorMap: () => ({ message: "กรุณาเลือกแพลตฟอร์ม" }),
  }),
  social_profile_url: z.string().url("URL ไม่ถูกต้อง"),
  follower_count: z.coerce.number().min(0, "ต้องมากกว่าหรือเท่ากับ 0"),
});

export type Step1 = z.infer<typeof step1Schema>;
export type Step2 = z.infer<typeof step2Schema>;
export type Step3 = z.infer<typeof step3Schema>;
export type Step4 = z.infer<typeof step4Schema>;
export type Step5 = z.infer<typeof step5Schema>;

export type WizardData = Partial<Step1 & Step2 & Step3 & Step4 & Step5>;

export const STEP_LABELS = [
  "Intro & Terms",
  "Personal Info",
  "Banking",
  "Documents",
  "Social Channel",
];
