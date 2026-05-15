import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  modelPreviewFor,
  type ModelLogoInput,
  type ModelPreviewMeta,
} from "./modelDisplay";

interface ModelHoverPreviewProps {
  model: ModelLogoInput | string;
  label?: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const CARD_WIDTH = 380;
const CARD_HEIGHT = 288;
const EDGE_GAP = 14;
const ANCHOR_GAP = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPosition(anchor: DOMRect) {
  if (typeof window === "undefined") return { left: 0, top: 0 };
  const canFitRight = anchor.right + ANCHOR_GAP + CARD_WIDTH <= window.innerWidth - EDGE_GAP;
  const left = canFitRight
    ? anchor.right + ANCHOR_GAP
    : Math.max(EDGE_GAP, anchor.left - ANCHOR_GAP - CARD_WIDTH);
  const top = clamp(
    anchor.top + anchor.height / 2 - CARD_HEIGHT / 2,
    EDGE_GAP,
    Math.max(EDGE_GAP, window.innerHeight - CARD_HEIGHT - EDGE_GAP),
  );
  return { left, top };
}

function PreviewCard({
  preview,
  label,
  position,
}: {
  preview: ModelPreviewMeta;
  label?: string;
  position: { left: number; top: number };
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[10080] w-[380px] rounded-[18px] bg-[#0c0d0d]/96 p-2 shadow-[0_18px_48px_rgba(0,0,0,.56)] backdrop-blur-xl"
      style={{ left: position.left, top: position.top }}
    >
      <div className="relative overflow-hidden rounded-[12px] bg-black">
        {preview.videoSrc ? (
          <video
            src={preview.videoSrc}
            autoPlay
            muted
            loop
            playsInline
            className="h-[224px] w-full object-cover"
          />
        ) : preview.imageSrc ? (
          <img
            src={preview.imageSrc}
            alt=""
            className="h-[224px] w-full object-cover"
            draggable={false}
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" />
      </div>
      <div className="px-2 pb-1.5 pt-2.5">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-[14px] font-semibold leading-[19px] text-white">
            {preview.title || label}
          </p>
        </div>
        {preview.subtitle && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-[16px] text-white/60">
            {preview.subtitle}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function ModelHoverPreview({
  model,
  label,
  className,
  disabled = false,
  children,
}: ModelHoverPreviewProps) {
  const preview = useMemo(() => modelPreviewFor(model), [model]);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  if (disabled || !preview) {
    return <>{children}</>;
  }

  const show = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    setPosition(getPosition(target.getBoundingClientRect()));
  };

  const hide = () => setPosition(null);

  return (
    <div
      className={clsx("model-hover-preview-trigger", className)}
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerMove={(event) => show(event.currentTarget)}
      onPointerLeave={hide}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={hide}
    >
      {children}
      {position && (
        <PreviewCard
          preview={preview}
          label={label}
          position={position}
        />
      )}
    </div>
  );
}
