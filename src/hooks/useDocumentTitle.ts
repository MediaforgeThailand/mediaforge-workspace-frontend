import { useEffect } from "react";

/**
 * Set `document.title` to the given string while the calling component
 * is mounted. Restores the previous title on unmount, so a route that
 * renders "Pricing — MediaForge" doesn't leave that title hanging
 * after the user navigates away.
 *
 * Usage:
 *   useDocumentTitle("Pricing — MediaForge");
 *
 * Why a hook instead of react-helmet-async?
 * -----------------------------------------
 * The app only needs to set <title>, not arbitrary <head> tags. A
 * seven-line hook beats pulling in another dependency, its provider
 * boilerplate, and the +5 KB on the wire. If we ever need OG / canonical
 * link control per-route we can swap this out for react-helmet-async
 * without changing the call sites — both APIs are dead-simple to
 * migrate between.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export default useDocumentTitle;
