import { supabase } from "@/integrations/supabase/client";

export type KycSlot =
  | "id_card_front"
  | "id_card_back"
  | "bank_book"
  | "selfie_with_id";

export interface UploadResult {
  path: string;
  publicUrl: string; // signed URL valid for ~1 hour
}

/**
 * Upload a KYC document to the private `kyc-docs` bucket.
 * Path: `{userId}/{slot}-{timestamp}.{ext}`
 * Returns storage path + a short-lived signed URL for preview.
 */
export async function uploadKycFile(
  userId: string,
  slot: KycSlot,
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${userId}/${slot}-${Date.now()}.${ext}`;

  // Supabase JS client does not expose progress; emit 0/50/100 manually.
  onProgress?.(10);

  const { error } = await supabase.storage
    .from("kyc-docs")
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) throw error;
  onProgress?.(80);

  const { data: signed, error: signErr } = await supabase.storage
    .from("kyc-docs")
    .createSignedUrl(path, 60 * 60);

  if (signErr || !signed) throw signErr ?? new Error("Failed to sign URL");
  onProgress?.(100);

  return { path, publicUrl: signed.signedUrl };
}

export async function getSignedKycUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("kyc-docs").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
