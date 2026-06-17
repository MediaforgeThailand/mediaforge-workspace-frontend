// Animated SVG "motion graphics" for each pillar + the hero.
// These are the native, always-available visuals. When a HyperFrames-rendered
// MP4 exists for a pillar, PillarVideo overlays it; otherwise these play.
// Accent: #F4FF00. Animation classes come from styles.ts (tk-*).
import type { CSSProperties } from "react";

const ACCENT = "#F4FF00";
const DIM = "#5d6800";
const PANEL = "#16181a";

const flowDot = (path: string, dur = 4, delay = 0, r = 3): CSSProperties => ({
  offsetPath: `path('${path}')`,
  offsetDistance: "0%",
  animationDuration: `${dur}s`,
  animationDelay: `${delay}s`,
});

function Node({
  x,
  y,
  label,
  w = 92,
  h = 34,
  accent = false,
  delay = 0,
}: {
  x: number;
  y: number;
  label: string;
  w?: number;
  h?: number;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <g className="tk-float" style={{ animationDelay: `${delay}s` }}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={accent ? ACCENT : PANEL}
        stroke={accent ? ACCENT : "rgba(244,255,0,0.28)"}
        strokeWidth={1.2}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        fontSize="12"
        fontFamily="ui-monospace, monospace"
        fill={accent ? "#0a0a0a" : "#e7eaee"}
        fontWeight={accent ? 700 : 500}
      >
        {label}
      </text>
    </g>
  );
}

export function SystemFlow() {
  return (
    <svg viewBox="0 0 520 360" className="h-full w-full" role="img" aria-label="ระบบและปฏิบัติการ">
      {/* connectors */}
      <g fill="none" stroke={DIM} strokeWidth={1.4}>
        <path className="tk-dash" d="M122,70 C200,70 200,170 250,170" />
        <path className="tk-dash" d="M122,170 L250,170" />
        <path className="tk-dash" d="M122,270 C200,270 200,170 250,170" />
        <path className="tk-dash-fast" d="M342,170 L420,170" stroke={ACCENT} opacity={0.7} />
      </g>
      {/* flow dots */}
      <circle r={3} fill={ACCENT} className="tk-flow-dot" style={flowDot("M122,70 C200,70 200,170 250,170", 4, 0)} />
      <circle r={3} fill={ACCENT} className="tk-flow-dot" style={flowDot("M122,170 L250,170", 3.2, 0.6)} />
      <circle r={3} fill={ACCENT} className="tk-flow-dot" style={flowDot("M122,270 C200,270 200,170 250,170", 4.4, 1.1)} />
      {/* inputs */}
      <Node x={28} y={53} label="POS" delay={0} />
      <Node x={28} y={153} label="Sales" delay={0.4} />
      <Node x={28} y={253} label="Booking" delay={0.8} />
      {/* hub */}
      <g className="tk-glow">
        <Node x={250} y={148} label="SYSTEM" w={92} h={44} accent delay={0} />
      </g>
      <circle cx={296} cy={170} r={64} fill="none" stroke={ACCENT} strokeWidth={1} opacity={0.25} className="tk-spin" />
      {/* output */}
      <Node x={420} y={120} label="SOP" w={74} delay={0.2} />
      <Node x={420} y={196} label="Tracking" w={74} delay={0.6} />
    </svg>
  );
}

export function AdsFunnel() {
  const stages = [
    { y: 60, w: 360, label: "Impressions" },
    { y: 120, w: 280, label: "Clicks" },
    { y: 180, w: 200, label: "Leads" },
    { y: 240, w: 120, label: "Conversions", accent: true },
  ];
  return (
    <svg viewBox="0 0 520 360" className="h-full w-full" role="img" aria-label="ยิงแอดขั้นลึก">
      {/* budget bars */}
      <g>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={26 + i * 14}
            y={300 - (20 + i * 12)}
            width={8}
            height={20 + i * 12}
            rx={2}
            fill={ACCENT}
            opacity={0.35 + i * 0.14}
            className="tk-bar"
            style={{ animationDelay: `${i * 0.18}s`, transformBox: "fill-box" }}
          />
        ))}
        <text x={26} y={316} fontSize="10" fontFamily="ui-monospace, monospace" fill="#8a9099">฿ allocation</text>
      </g>
      {/* funnel */}
      <g transform="translate(110,0)">
        {stages.map((s, i) => (
          <g key={i} className="tk-float" style={{ animationDelay: `${i * 0.25}s` }}>
            <rect
              x={(360 - s.w) / 2 + 20}
              y={s.y}
              width={s.w}
              height={42}
              rx={6}
              fill={s.accent ? ACCENT : PANEL}
              stroke={s.accent ? ACCENT : "rgba(244,255,0,0.28)"}
            />
            <text
              x={200}
              y={s.y + 26}
              textAnchor="middle"
              fontSize="13"
              fontFamily="ui-monospace, monospace"
              fontWeight={s.accent ? 700 : 500}
              fill={s.accent ? "#0a0a0a" : "#e7eaee"}
            >
              {s.label}
            </text>
          </g>
        ))}
        {/* particles flowing down */}
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            r={3}
            fill={ACCENT}
            className="tk-flow-dot"
            style={flowDot("M200,52 L200,260", 2.6, i * 0.7)}
          />
        ))}
      </g>
    </svg>
  );
}

export function DataPipeline() {
  return (
    <svg viewBox="0 0 520 360" className="h-full w-full" role="img" aria-label="ดาต้าเชิงลึก">
      <g fill="none" stroke={DIM} strokeWidth={1.4}>
        <path className="tk-dash" d="M120,70 C190,70 190,180 250,180" />
        <path className="tk-dash" d="M120,180 L250,180" />
        <path className="tk-dash" d="M120,290 C190,290 190,180 250,180" />
        <path className="tk-dash-fast" d="M330,180 L380,180" stroke={ACCENT} opacity={0.7} />
      </g>
      {[
        ["M120,70 C190,70 190,180 250,180", 0],
        ["M120,180 L250,180", 0.5],
        ["M120,290 C190,290 190,180 250,180", 1],
      ].map(([p, d], i) => (
        <circle key={i} r={3} fill={ACCENT} className="tk-flow-dot" style={flowDot(p as string, 3.6, d as number)} />
      ))}
      <Node x={28} y={53} label="CSV / Sheets" w={92} delay={0} />
      <Node x={28} y={163} label="GA4 / GTM" w={92} delay={0.4} />
      <Node x={28} y={273} label="Pixel" w={92} delay={0.8} />
      {/* ETL gear */}
      <g className="tk-glow">
        <Node x={250} y={158} label="ETL" w={80} h={44} accent />
      </g>
      <circle cx={290} cy={180} r={58} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="4 6" opacity={0.3} className="tk-spin-rev" />
      {/* dashboard bar chart */}
      <g transform="translate(384,96)">
        <rect x={0} y={0} width={108} height={168} rx={8} fill={PANEL} stroke="rgba(244,255,0,0.2)" />
        {[40, 70, 52, 96, 120].map((h, i) => (
          <rect
            key={i}
            x={12 + i * 18}
            y={150 - h}
            width={12}
            height={h}
            rx={2}
            fill={ACCENT}
            opacity={0.5 + i * 0.1}
            className="tk-bar"
            style={{ animationDelay: `${0.3 + i * 0.16}s`, transformBox: "fill-box" }}
          />
        ))}
      </g>
    </svg>
  );
}

export function AutomationGraph() {
  const sats = [
    { x: 110, y: 70, label: "Line OA" },
    { x: 410, y: 70, label: "Xcommerce" },
    { x: 90, y: 280, label: "Shopee" },
    { x: 430, y: 280, label: "Lazada" },
  ];
  return (
    <svg viewBox="0 0 520 360" className="h-full w-full" role="img" aria-label="ออโตเมชันและ AI">
      {/* connectors from core to satellites */}
      <g fill="none" stroke={DIM} strokeWidth={1.4}>
        {sats.map((s, i) => (
          <path key={i} className="tk-dash" d={`M260,180 L${s.x + 46},${s.y + 17}`} />
        ))}
      </g>
      {sats.map((s, i) => (
        <circle
          key={i}
          r={3}
          fill={ACCENT}
          className="tk-flow-dot"
          style={flowDot(`M260,180 L${s.x + 46},${s.y + 17}`, 3 + i * 0.4, i * 0.5)}
        />
      ))}
      {/* rotating rings around core */}
      <circle cx={260} cy={180} r={70} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="3 8" opacity={0.4} className="tk-spin" />
      <circle cx={260} cy={180} r={92} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="2 12" opacity={0.22} className="tk-spin-rev" />
      {/* AI core */}
      <g className="tk-glow">
        <circle cx={260} cy={180} r={40} fill={ACCENT} />
        <text x={260} y={185} textAnchor="middle" fontSize="15" fontWeight={800} fontFamily="ui-monospace, monospace" fill="#0a0a0a">
          AI
        </text>
      </g>
      {sats.map((s, i) => (
        <Node key={i} x={s.x} y={s.y} label={s.label} delay={i * 0.3} />
      ))}
    </svg>
  );
}

export function HeroSystemMap() {
  return (
    <svg viewBox="0 0 460 460" className="h-full w-full" role="img" aria-label="operating system map">
      <defs>
        <radialGradient id="tk-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.9" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <circle cx={230} cy={230} r={150} fill="url(#tk-core)" opacity={0.18} />
      {/* rotating rings */}
      <g className="tk-spin">
        <circle cx={230} cy={230} r={180} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="2 14" opacity={0.4} />
      </g>
      <g className="tk-spin-rev">
        <circle cx={230} cy={230} r={140} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="4 10" opacity={0.3} />
      </g>
      <circle cx={230} cy={230} r={100} fill="none" stroke="rgba(244,255,0,0.25)" strokeWidth={1} />
      {/* orbiting nodes */}
      {["System", "Ads", "Data", "AI", "Ops", "Auto"].map((label, i) => {
        const ang = (i / 6) * Math.PI * 2;
        const x = 230 + Math.cos(ang) * 180;
        const y = 230 + Math.sin(ang) * 180;
        return (
          <g key={label}>
            <line x1={230} y1={230} x2={x} y2={y} stroke={DIM} strokeWidth={1} className="tk-dash" />
            <circle r={2.6} fill={ACCENT} className="tk-flow-dot" style={flowDot(`M230,230 L${x},${y}`, 3 + i * 0.3, i * 0.4)} />
            <circle cx={x} cy={y} r={6} fill={PANEL} stroke={ACCENT} strokeWidth={1.2} className="tk-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
            <text x={x} y={y - 12} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, monospace" fill="#aeb4bb">
              {label}
            </text>
          </g>
        );
      })}
      {/* core monogram */}
      <g className="tk-glow">
        <circle cx={230} cy={230} r={46} fill={ACCENT} />
        <text x={230} y={244} textAnchor="middle" fontSize="42" fontWeight={800} fontFamily="ui-monospace, monospace" fill="#0a0a0a">
          T
        </text>
      </g>
    </svg>
  );
}

export const pillarDiagram: Record<string, () => JSX.Element> = {
  system: SystemFlow,
  ads: AdsFunnel,
  data: DataPipeline,
  automation: AutomationGraph,
};
