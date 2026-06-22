export function Spark({ values, w = 64, h = 20 }: { values?: number[]; w?: number; h?: number }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const c = last > prev ? "#22c55e" : last < prev ? "#ef4444" : "#64748b";
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={w} cy={h - (last / max) * h} r="2.5" fill={c} />
    </svg>
  );
}
