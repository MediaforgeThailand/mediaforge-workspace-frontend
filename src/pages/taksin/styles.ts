// Self-contained CSS for the /taksin page. Injected via a <style> tag in
// index.tsx so it never leaks into the rest of the app. Every class is
// namespaced `tk-`. Animations are paused under prefers-reduced-motion.
export const taksinStyles = `
.tk-root { --tk-accent: #F4FF00; --tk-accent-soft: #EEFF6A; }

@keyframes tk-grid-pan {
  from { background-position: 0 0; }
  to { background-position: 56px 56px; }
}
@keyframes tk-dash {
  to { stroke-dashoffset: -1000; }
}
@keyframes tk-pulse {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.12); }
}
@keyframes tk-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes tk-spin {
  to { transform: rotate(360deg); }
}
@keyframes tk-flow {
  0% { offset-distance: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
@keyframes tk-rise {
  from { transform: scaleY(0.15); opacity: 0.4; }
  to { transform: scaleY(1); opacity: 1; }
}
@keyframes tk-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}
@keyframes tk-scan {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translateY(120%); opacity: 0; }
}
@keyframes tk-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@keyframes tk-glow {
  0%, 100% { filter: drop-shadow(0 0 2px rgba(244,255,0,0.3)); }
  50% { filter: drop-shadow(0 0 10px rgba(244,255,0,0.65)); }
}

.tk-grid {
  background-image:
    linear-gradient(to right, rgba(244,255,0,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(244,255,0,0.06) 1px, transparent 1px);
  background-size: 56px 56px;
  animation: tk-grid-pan 8s linear infinite;
}
.tk-dash { stroke-dasharray: 8 8; animation: tk-dash 18s linear infinite; }
.tk-dash-fast { stroke-dasharray: 6 10; animation: tk-dash 6s linear infinite; }
.tk-pulse { animation: tk-pulse 2.6s ease-in-out infinite; transform-origin: center; }
.tk-float { animation: tk-float 5s ease-in-out infinite; }
.tk-spin { animation: tk-spin 26s linear infinite; transform-origin: center; }
.tk-spin-rev { animation: tk-spin 40s linear infinite reverse; transform-origin: center; }
.tk-glow { animation: tk-glow 3s ease-in-out infinite; }
.tk-blink { animation: tk-blink 1.4s steps(1) infinite; }
.tk-flow-dot { offset-rotate: 0deg; animation: tk-flow 4s linear infinite; }
.tk-bar { transform-origin: bottom; animation: tk-rise 1.8s ease-out both; }
.tk-scanline { animation: tk-scan 5s ease-in-out infinite; }
.tk-marquee { animation: tk-marquee 36s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  .tk-grid, .tk-dash, .tk-dash-fast, .tk-pulse, .tk-float, .tk-spin,
  .tk-spin-rev, .tk-glow, .tk-blink, .tk-flow-dot, .tk-bar, .tk-scanline,
  .tk-marquee { animation: none !important; }
}
`;
