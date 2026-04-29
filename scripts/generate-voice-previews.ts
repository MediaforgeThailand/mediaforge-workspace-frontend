/**
 * Pre-generate Google Cloud TTS preview MP3s and upload them to
 * Supabase Storage so the VoicePickerDialog can play instant
 * previews on hover/click without burning the user's TTS quota.
 *
 * One-shot script — run on a fresh project after the
 * `voice-previews` storage bucket is created (it must be public-read
 * so the picker can fetch via plain URL). Re-run after editing
 * `googleTtsVoices.ts` to add or replace entries; the script is
 * idempotent: it `upsert: true`s every file.
 *
 * USAGE
 *   GOOGLE_TTS_API_KEY=... \
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/generate-voice-previews.ts
 *
 *   (`tsx` isn't a project dep — install with `npm i -D tsx` or use
 *   `node --loader tsx scripts/generate-voice-previews.ts`. Could
 *   also run via Deno if you prefer; the script uses only fetch +
 *   one Supabase client call so the runtime is interchangeable.)
 *
 * What it does:
 *   1. Loads the GOOGLE_VOICES catalog from the source file.
 *   2. For each voice, picks an EN/TH sample line from
 *      VOICE_PREVIEW_SAMPLE_TEXT based on the voice's languageCode.
 *   3. Calls Google TTS synthesize with audioEncoding=MP3 + the
 *      voice id.
 *   4. Uploads the MP3 to `voice-previews/google/<voice-id>.mp3`
 *      via the Supabase service-role client (skip RLS).
 *   5. Logs success/failure per voice; exits non-zero if ANY voice
 *      fails so CI can flag a missing voice.
 *
 * Sized at ~16 voices, each ~5s of audio. Total run time is ~30s,
 * total storage is <500 KB. Re-running on the same bucket is fine.
 *
 * Bucket creation (one time, run via Supabase SQL editor):
 *   ```sql
 *   insert into storage.buckets (id, name, public)
 *   values ('voice-previews', 'voice-previews', true)
 *   on conflict (id) do update set public = true;
 *   ```
 */

import { createClient } from "@supabase/supabase-js";
import {
  GOOGLE_VOICES,
  VOICE_PREVIEW_SAMPLE_TEXT,
} from "../src/components/workspace/googleTtsVoices";

const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_TTS_API_KEY) {
  console.error(
    "[voice-previews] GOOGLE_TTS_API_KEY not set. Get a key from " +
      "https://console.cloud.google.com/apis/credentials and export it.",
  );
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[voice-previews] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface VoiceSummary {
  id: string;
  status: "ok" | "fail";
  bytes?: number;
  error?: string;
}

async function synthesize(voiceId: string, languageCode: string, text: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceId },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) {
    throw new Error("No audioContent in Google TTS response");
  }

  // Decode base64 MP3 → Uint8Array. atob is available globally in
  // Node 16+. If running on an older Node, replace with
  // Buffer.from(json.audioContent, "base64") and pass that to
  // .upload().
  const binary = atob(json.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function uploadPreview(voiceId: string, bytes: Uint8Array): Promise<void> {
  const path = `google/${voiceId}.mp3`;
  const { error } = await supabase.storage
    .from("voice-previews")
    .upload(path, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "31536000", // 1 year — these are immutable per voice id
    });
  if (error) {
    // Surface bucket-not-found explicitly so users know the SQL
    // bucket-creation step still needs to run.
    if (/Bucket not found/i.test(error.message)) {
      throw new Error(
        "Bucket 'voice-previews' not found. Run the SQL in the script header to create it as a public bucket.",
      );
    }
    throw error;
  }
}

async function main(): Promise<void> {
  console.log(`[voice-previews] generating previews for ${GOOGLE_VOICES.length} voices…`);

  const summaries: VoiceSummary[] = [];

  for (const v of GOOGLE_VOICES) {
    // Pick the matching sample text. English voices speak the EN
    // sample, Thai voices speak the TH sample. The user-facing text
    // is the same idea in both languages so previews feel
    // consistent across regions.
    const text = v.languageCode === "th-TH"
      ? VOICE_PREVIEW_SAMPLE_TEXT.th
      : VOICE_PREVIEW_SAMPLE_TEXT.en;

    try {
      process.stdout.write(`  ${v.id} (${v.name})… `);
      const bytes = await synthesize(v.id, v.languageCode, text);
      await uploadPreview(v.id, bytes);
      console.log(`ok (${bytes.length} bytes)`);
      summaries.push({ id: v.id, status: "ok", bytes: bytes.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL — ${msg}`);
      summaries.push({ id: v.id, status: "fail", error: msg });
    }
  }

  const ok = summaries.filter((s) => s.status === "ok").length;
  const fail = summaries.filter((s) => s.status === "fail").length;
  console.log(`\n[voice-previews] done — ${ok} ok, ${fail} failed`);

  if (fail > 0) {
    console.error("[voice-previews] failures:");
    for (const s of summaries.filter((x) => x.status === "fail")) {
      console.error(`  - ${s.id}: ${s.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[voice-previews] fatal:", err);
  process.exit(1);
});
