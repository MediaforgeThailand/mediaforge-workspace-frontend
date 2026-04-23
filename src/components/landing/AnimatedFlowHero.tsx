import { memo } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Cpu, Film, Upload } from "lucide-react";

/* ─── SVG path builder (quadratic bezier) ─── */
const buildPath = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} Q ${mx} ${y1}, ${mx} ${(y1 + y2) / 2} Q ${mx} ${y2}, ${x2} ${y2}`;
};

/* ─── Traveling Particle ─── */
const TravelingParticle = ({ path, delay = 0 }: { path: string; delay?: number }) => (
  <>
    <motion.circle
      r="4"
      fill="url(#particleGrad)"
      filter="url(#glow)"
      initial={{ offsetDistance: "0%" }}
      animate={{ offsetDistance: "100%" }}
      transition={{ duration: 3, repeat: Infinity, delay, ease: "linear" }}
      style={{ offsetPath: `path('${path}')` }}
    />
    {/* Fallback animateMotion for broader support */}
    <circle r="4" fill="url(#particleGrad)" filter="url(#glow)" opacity={0.9}>
      <animateMotion dur="3s" repeatCount="indefinite" begin={`${delay}s`} path={path} />
    </circle>
  </>
);

/* ─── Node Card ─── */
const NodeCard = memo(({
  x, y, width, height, icon: Icon, title, children, floatDelay, accentColor,
}: {
  x: number; y: number; width: number; height: number;
  icon: React.ElementType; title: string; children: React.ReactNode;
  floatDelay?: number; accentColor: string;
}) => (
  <motion.foreignObject
    x={x} y={y} width={width} height={height}
    initial={{ opacity: 0, scale: 0.85 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.8, delay: floatDelay ?? 0, ease: [0.22, 1, 0.36, 1] }}
  >
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4 + (floatDelay ?? 0), repeat: Infinity, ease: "easeInOut" }}
      className="h-full"
    >
      <div
        className="h-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-4 flex flex-col gap-3"
        style={{ boxShadow: `0 0 30px ${accentColor}25, 0 0 60px ${accentColor}10` }}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}40` }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </div>
          <span className="text-[11px] font-semibold text-white/80 tracking-wide uppercase">{title}</span>
        </div>
        {/* Body */}
        <div className="flex-1">{children}</div>
        {/* Handle dots */}
        <div className="flex justify-between">
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full" style={{ background: accentColor, opacity: 0.5 }} />
        </div>
      </div>
    </motion.div>
  </motion.foreignObject>
));
NodeCard.displayName = "NodeCard";

const AnimatedFlowHero = () => {

  // Node positions (viewBox 900×500)
  const n1 = { x: 40, y: 160, w: 220, h: 160, cx: 260, cy: 240 };
  const n2 = { x: 340, y: 140, w: 220, h: 180, cx: 340, cy: 230 };
  const n3 = { x: 640, y: 150, w: 220, h: 170, cx: 640, cy: 235 };

  const path1 = buildPath(n1.cx, n1.cy, n2.cx, n2.cy);
  const path2 = buildPath(n2.cx + n2.w - 340, n2.cy, n3.cx, n3.cy);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Dotted grid background */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Ambient glow blobs */}
      <div className="absolute top-[30%] left-[15%] w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />
      <div className="absolute top-[40%] right-[15%] w-[250px] h-[250px] rounded-full bg-pink-600/8 blur-[100px] pointer-events-none" />

      <svg
        viewBox="0 0 900 500"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Connection gradient */}
          <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(168,85,247,0.5)" />
            <stop offset="100%" stopColor="rgba(236,72,153,0.5)" />
          </linearGradient>
          {/* Particle gradient */}
          <radialGradient id="particleGrad">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </radialGradient>
          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Connection Lines ── */}
        <path d={path1} fill="none" stroke="url(#edgeGrad)" strokeWidth="1.5" strokeDasharray="6 4" opacity={0.6} />
        <path d={path2} fill="none" stroke="url(#edgeGrad)" strokeWidth="1.5" strokeDasharray="6 4" opacity={0.6} />

        {/* ── Traveling Particles ── */}
        <TravelingParticle path={path1} delay={0} />
        <TravelingParticle path={path2} delay={1.5} />

        {/* ── Node 1: Text Input ── */}
        <NodeCard x={n1.x} y={n1.y} width={n1.w} height={n1.h} icon={ImagePlus} title="Upload Image" floatDelay={0} accentColor="#a855f7">
          <div className="rounded-lg bg-white/[0.04] border border-dashed border-white/[0.12] p-2.5 h-full flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-purple-400/30 transition-colors">
            <motion.div
              animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Upload className="w-5 h-5 text-purple-400/70" />
            </motion.div>
            <p className="text-[10px] text-white/40 font-medium text-center">
              Drag & drop or click to upload
            </p>
          </div>
        </NodeCard>

        {/* ── Node 2: AI Engine ── */}
        <NodeCard x={n2.x} y={n2.y} width={n2.w} height={n2.h} icon={Cpu} title="AI Video Engine" floatDelay={0.2} accentColor="#6366f1">
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center"
            >
              <Cpu className="w-5 h-5 text-indigo-400" />
            </motion.div>
            <p className="text-[10px] text-white/40 font-medium">Processing…</p>
            {/* Progress bar */}
            <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                animate={{ width: ["0%", "100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </NodeCard>

        {/* ── Node 3: Output ── */}
        <NodeCard x={n3.x} y={n3.y} width={n3.w} height={n3.h} icon={Film} title="Final Render" floatDelay={0.4} accentColor="#ec4899">
          <div className="rounded-lg overflow-hidden h-full relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-pink-900/20 to-indigo-900/30" />
            <motion.div
              className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative flex items-center justify-center h-full">
              <motion.div
                animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Film className="w-8 h-8 text-pink-400/60" />
              </motion.div>
            </div>
          </div>
        </NodeCard>
      </svg>
    </div>
  );
};

export default memo(AnimatedFlowHero);
