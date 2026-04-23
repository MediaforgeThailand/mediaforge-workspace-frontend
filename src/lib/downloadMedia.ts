/**
 * Robust media downloader that forces correct file extensions.
 * Fetches the file as a Blob and triggers a download with a strict filename,
 * preventing Windows from saving images as `.jfif`.
 */

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // ignore
  }
  return "png";
}

function resolveExt(blob: Blob, url: string): string {
  const fromMime = MIME_TO_EXT[blob.type];
  if (fromMime) return fromMime;
  return extFromUrl(url);
}

/**
 * Download a media file as a Blob with a strict filename extension.
 *
 * @param url       - The source URL (Supabase Storage, AI provider CDN, etc.)
 * @param filename  - Desired filename WITHOUT extension (e.g. "Output_1")
 * @param forceExt  - Optional forced extension (e.g. "png"). If omitted, derived from MIME/URL.
 */
export async function downloadMedia(
  url: string,
  filename: string = `media-${Date.now()}`,
  forceExt?: string,
): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    const ext = forceExt || resolveExt(blob, url);
    const safeName = `${filename.replace(/\.[^.]+$/, "")}.${ext}`;

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Cleanup after a short delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank");
  }
}

/**
 * Download an image as a TRUE PNG by re-encoding via <canvas>.
 * This converts JPEG/WebP source data into actual PNG bytes,
 * not just renaming the extension.
 */
export async function downloadImageAsPng(
  url: string,
  filename: string = `image-${Date.now()}`,
): Promise<void> {
  try {
    // 1. Fetch as blob to bypass CORS
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const srcBlob = await res.blob();
    const srcUrl = URL.createObjectURL(srcBlob);

    // 2. Load into an Image element
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        try {
          // 3. Draw onto canvas and export as image/png
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((pngBlob) => {
            if (!pngBlob) { reject(new Error("toBlob failed")); return; }

            // 4. Trigger download with the real PNG blob
            const pngUrl = URL.createObjectURL(pngBlob);
            const safeName = `${filename.replace(/\.[^.]+$/, "")}.png`;
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = safeName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 5. Cleanup
            setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
            resolve();
          }, "image/png");
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = srcUrl;
    });

    URL.revokeObjectURL(srcUrl);
  } catch {
    // Fallback to generic download
    return downloadMedia(url, filename, "png");
  }
}
