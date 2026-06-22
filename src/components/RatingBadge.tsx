export function RatingBadge({ rating, rLabel, rColor, score }: { rating: number; rLabel: string; rColor: string; score: number }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
      <svg width={80} height={80} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={40} cy={40} r={r} fill="none" stroke="#151d30" strokeWidth={5} />
        <circle
          cx={40} cy={40} r={r} fill="none" stroke={rColor} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray .5s" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 800, color: rColor, lineHeight: 1 }}>{rating.toFixed(1)}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: rColor, opacity: 0.8, letterSpacing: ".3px" }}>{rLabel}</div>
      </div>
    </div>
  );
}
