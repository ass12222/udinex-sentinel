export const fmc = (v: number) =>
  !v ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`;

export const fSol = (v: number | string) =>
  v ? `◎${(+v).toFixed(3)}` : "—";

export const short = (a: string) =>
  a ? `${a.slice(0, 5)}...${a.slice(-4)}` : "—";

export const bondingPct = (c: any) => {
  const vt = c?.virtual_token_reserves || 0;
  return vt
    ? +Math.max(0, Math.min(100, (1 - vt / 1073000191000000) * 100)).toFixed(1)
    : 0;
};

export const today = () => new Date().toISOString().slice(0, 10);

export const fAgeSec = (ms: number) => {
  const s = Math.floor((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
};

export const fAgeShort = (ms: number) => {
  const s = Math.floor((Date.now() - ms) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
};

export const vcls = (v: string) =>
  v === "SNIPE IT" ? "sS" : v === "ENTRA" ? "sE" : v === "WATCH" ? "sW" : v === "RISCHIO" ? "sR" : v === "SKIP" ? "sK" : "sX";

export const acls = (s: number) => (s < 60 ? "age-f" : s < 180 ? "age-o" : "age-s");
