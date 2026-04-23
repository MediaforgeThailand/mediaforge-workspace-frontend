/**
 * Animated mesh-gradient background.
 * Multiple layered CSS blobs with blur that drift slowly,
 * creating a modern flowing-color effect.
 */
const InteractiveBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden bg-background">
    {/* Primary purple — top right */}
    <div
      className="absolute w-[700px] h-[700px] rounded-full opacity-50 blur-[140px]"
      style={{
        background: "radial-gradient(circle, hsl(257 61% 47%), transparent 70%)",
        top: "-15%",
        right: "-10%",
        animation: "meshDrift1 20s ease-in-out infinite",
      }}
    />
    {/* Magenta — bottom left */}
    <div
      className="absolute w-[600px] h-[600px] rounded-full opacity-45 blur-[120px]"
      style={{
        background: "radial-gradient(circle, hsl(283 47% 45%), transparent 70%)",
        bottom: "-15%",
        left: "-8%",
        animation: "meshDrift2 25s ease-in-out infinite",
      }}
    />
    {/* Violet — center */}
    <div
      className="absolute w-[450px] h-[450px] rounded-full opacity-35 blur-[100px]"
      style={{
        background: "radial-gradient(circle, hsl(257 61% 55%), transparent 70%)",
        top: "35%",
        left: "25%",
        animation: "meshDrift3 18s ease-in-out infinite",
      }}
    />
    {/* Deep blue-purple — top left */}
    <div
      className="absolute w-[500px] h-[500px] rounded-full opacity-40 blur-[110px]"
      style={{
        background: "radial-gradient(circle, hsl(260 50% 35%), transparent 70%)",
        top: "5%",
        left: "-5%",
        animation: "meshDrift4 22s ease-in-out infinite",
      }}
    />
    {/* Pink accent — bottom right */}
    <div
      className="absolute w-[350px] h-[350px] rounded-full opacity-30 blur-[90px]"
      style={{
        background: "radial-gradient(circle, hsl(300 50% 50%), transparent 70%)",
        bottom: "10%",
        right: "15%",
        animation: "meshDrift5 16s ease-in-out infinite",
      }}
    />

    {/* Subtle grain overlay */}
    <div
      className="absolute inset-0 opacity-[0.02]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "256px 256px",
      }}
    />
  </div>
);

export default InteractiveBackground;
