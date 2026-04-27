/**
 * JSX type declaration for the `<model-viewer>` custom element from
 * Google (https://modelviewer.dev). The component is loaded via a
 * CDN <script> tag in index.html — TypeScript needs this ambient
 * declaration to accept the tag inside .tsx files.
 *
 * We type only the props we actually use (src, alt, auto-rotate,
 * camera-controls, ar, etc.) — anything extra falls through to the
 * base HTMLAttributes via the spread.
 */

import type { DetailedHTMLProps, HTMLAttributes } from "react";

interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src?: string;
  alt?: string;
  poster?: string;
  /** Boolean attributes — React expects empty string or omission. */
  "auto-rotate"?: boolean | string;
  "camera-controls"?: boolean | string;
  "disable-zoom"?: boolean | string;
  ar?: boolean | string;
  "ar-modes"?: string;
  "shadow-intensity"?: string | number;
  "shadow-softness"?: string | number;
  exposure?: string | number;
  "environment-image"?: string;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "manual";
  "auto-rotate-delay"?: string | number;
  "interaction-prompt"?: "auto" | "when-focused" | "none";
  /** Style passes through to the underlying custom element. */
  style?: React.CSSProperties;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<ModelViewerAttributes, HTMLElement>;
    }
  }
}

export {};
