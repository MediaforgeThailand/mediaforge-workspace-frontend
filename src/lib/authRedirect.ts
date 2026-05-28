export const DEFAULT_POST_AUTH_PATH = "/app/workspace";

export const normalizePostAuthPath = (path: string) => {
  // /app/university is a demo surface that should only be entered by
  // pressing the PSC sidebar button after login. Never make it the
  // automatic post-auth landing page.
  if (path === "/app/university" || path.startsWith("/app/university?")) {
    return DEFAULT_POST_AUTH_PATH;
  }
  return path;
};

export const getSafePostAuthPath = (path?: string | null) => {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  if (path === "/auth" || path.startsWith("/auth?")) return null;
  return normalizePostAuthPath(path);
};

const getAuthRedirectOrigin = () => {
  const configured = (import.meta.env.VITE_AUTH_REDIRECT_ORIGIN as string | undefined)
    ?.trim()
    .replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
};

const withAuthOrigin = (path: string) => {
  const origin = getAuthRedirectOrigin();
  return origin ? `${origin}${path}` : path;
};

export const buildAuthRedirectUrl = (redirectPath?: string | null) => {
  const safeRedirectPath = getSafePostAuthPath(redirectPath);
  const callbackPath = safeRedirectPath
    ? `/auth?redirect=${encodeURIComponent(safeRedirectPath)}`
    : "/auth";
  return withAuthOrigin(callbackPath);
};

export const buildResetPasswordRedirectUrl = () => withAuthOrigin("/reset-password");

