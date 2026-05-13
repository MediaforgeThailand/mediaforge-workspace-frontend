import * as tus from "tus-js-client";

import { supabase } from "@/integrations/supabase/client";

const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const RESUMABLE_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

type UploadSource = File | Blob;

export interface SupabaseStorageUploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export interface SupabaseStorageUploadResult {
  data: { path: string; fullPath: string } | null;
  error: Error | null;
}

function projectIdFromEnv(): string {
  const explicit = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (explicit) return explicit;
  const url = new URL(import.meta.env.VITE_SUPABASE_URL);
  return url.hostname.split(".")[0] ?? "";
}

function resumableUploadEndpoint(): string {
  return `https://${projectIdFromEnv()}.storage.supabase.co/storage/v1/upload/resumable`;
}

function uploadFingerprint(
  bucketName: string,
  objectName: string,
  file: UploadSource,
): string {
  const name = file instanceof File ? file.name : "blob";
  return [
    "mediaforge-storage-upload",
    bucketName,
    objectName,
    name,
    file.size,
    file.type || "application/octet-stream",
  ].join(":");
}

async function uploadWithTus(
  bucketName: string,
  objectName: string,
  file: UploadSource,
  options: SupabaseStorageUploadOptions,
): Promise<SupabaseStorageUploadResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) return { data: null, error: sessionError };
  if (!session?.access_token) {
    return { data: null, error: new Error("Please sign in before uploading.") };
  }

  const contentType =
    options.contentType ||
    (file instanceof File ? file.type : file.type) ||
    "application/octet-stream";

  return new Promise((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: resumableUploadEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        ...(options.upsert ? { "x-upsert": "true" } : {}),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: () => Promise.resolve(uploadFingerprint(bucketName, objectName, file)),
      chunkSize: RESUMABLE_CHUNK_SIZE_BYTES,
      metadata: {
        bucketName,
        objectName,
        contentType,
        cacheControl: options.cacheControl ?? "3600",
      },
      onError: (error) => {
        resolve({
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
      onSuccess: () => {
        resolve({
          data: { path: objectName, fullPath: `${bucketName}/${objectName}` },
          error: null,
        });
      },
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch((error) => {
      resolve({
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  });
}

export async function uploadSupabaseStorageFile(
  bucketName: string,
  objectName: string,
  file: UploadSource,
  options: SupabaseStorageUploadOptions = {},
): Promise<SupabaseStorageUploadResult> {
  if (file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    return uploadWithTus(bucketName, objectName, file, options);
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(objectName, file, options);

  return {
    data: data ? { path: data.path, fullPath: data.fullPath ?? `${bucketName}/${data.path}` } : null,
    error,
  };
}
