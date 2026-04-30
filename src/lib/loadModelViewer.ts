/**
 * Lazy-load Google's <model-viewer> custom element on demand.
 *
 * Why this matters
 * ----------------
 * The <model-viewer> module from Google's CDN ships ~270 KB of JS
 * (bundle + Three.js dependency) that's only needed when the user
 * opens a 3D preview. We used to load it eagerly from a top-level
 * <script type="module"> in index.html, which blocked first paint
 * for every user — including all the Spaces / Settings / Auth users
 * who never touch a 3D node.
 *
 * Now the loader fires the first time any code path needs it
 * (NodePreviewLightbox, Model3DPreview, etc.). The CDN bundle
 * registers the custom element via `customElements.define`, so any
 * <model-viewer> tags in the DOM upgrade automatically once the
 * script finishes loading.
 *
 * Why CDN, not the npm package?
 * -----------------------------
 * Vite's tree-shaking is too aggressive on the @google/model-viewer
 * npm package — it's previously dropped the side-effect that calls
 * `customElements.define`, leaving <model-viewer> tags rendered as
 * inert <div>s. The CDN bundle ALWAYS registers the element. See
 * the comment that used to live in index.html for the full history.
 */

const MODEL_VIEWER_URL =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

let loadPromise: Promise<void> | null = null;

/**
 * Returns a promise that resolves once the <model-viewer> custom
 * element is registered. Calling this multiple times is safe — only
 * one network request is ever issued. Resolves immediately on
 * subsequent calls after the first load.
 */
export function loadModelViewer(): Promise<void> {
  // Already loaded (or being loaded) in this session — just wait on
  // the existing promise.
  if (loadPromise) return loadPromise;

  // SSR / non-browser context — resolve immediately so the caller
  // doesn't hang. The element will be undefined but the page won't
  // crash.
  if (typeof window === "undefined" || typeof document === "undefined") {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  // If the element is already defined (e.g. a previous page load
  // injected the script and HMR survived), short-circuit.
  if (window.customElements && window.customElements.get("model-viewer")) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    // Re-use an existing tag if something else already injected one
    // (defensive — shouldn't happen in normal flow but cheap to
    // handle).
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${MODEL_VIEWER_URL}"]`
    );
    if (existing) {
      // Wait for whenDefined — the existing script may still be
      // parsing.
      window.customElements
        .whenDefined("model-viewer")
        .then(() => resolve())
        .catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = MODEL_VIEWER_URL;
    script.async = true;
    script.onload = () => {
      // The script registers the element synchronously on parse, but
      // belt-and-braces — wait for whenDefined so the resolved
      // promise truly means "the tag will work now".
      window.customElements
        .whenDefined("model-viewer")
        .then(() => resolve())
        .catch(reject);
    };
    script.onerror = () => {
      // Reset so a retry from the caller can fire a fresh request.
      loadPromise = null;
      reject(new Error("Failed to load model-viewer script"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
