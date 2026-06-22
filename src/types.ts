export interface MintData {
  buys: any[];
  sells: any[];
  creates: any[];
  bundleSlots: Record<string,Set<string>>;
  swBuys: Set<string>;
  swSells: Set<string>;
  dev: string | null;
  devSol: number;
}

export interface TokenData {
  ts: number;
  mint: string;
  symbol: string;
  name: string;
  dev: string;
  solDev: number;
  mc: number;
  score: number;
  pctW: number;
  bSlots: number;
  swBuy: number;
  swSell: number;
  bonding: number;
  devSold: boolean;
  replyCount: number;
  lastReply: number;
  migrated: boolean;
  marketId: string | null;
}

export interface EventData {
  sig: string;
  slot: number;
  action: string;
  wallet: string;
  mint: string;
  sol: number;
  ts: number;
  fromSmartWs?: boolean;
}

export interface SmartEventData {
  ts: number;
  wallet: string;
  action: string;
  mint: string;
  sol: number;
  symbol: string;
  name?: string;
  mc: number;
  bonding: number;
  loading: boolean;
  dex: string;
}

export interface ScoredToken {
  tok: TokenData;
  md: MintData;
  ss: SnipeResult;
  vel: VelocityData;
  ageSec: number;
  devBad: boolean;
  pump: PumpTrend;
  multi: Multiplier;
}

export interface SnipeResult {
  score: number;
  flags: FlagData[];
  verdict: string;
  vcolor: string;
  vemoji: string;
  rating: number;
  rLabel: string;
  rColor: string;
  bundlerSells: any[];
  m: AdvancedMetrics;
}

export interface FlagData {
  t: string;
  s: string;
}

export interface AdvancedMetrics {
  bundleSolIn: number;
  organicSolIn: number;
  totalSolIn: number;
  totalSolOut: number;
  bundleSolPct: number;
  organicBuyers: number;
  bundledWallets: number;
  allBuyWallets: number;
  holderRateEarly: number;
  holderRateLate: number;
  holderAccel: number;
  sellPressure: number;
  bundlerSells: any[];
  bundlerSolOut: number;
  bundlerExitPct: number;
  t30: number;
  t60: number;
  l30s: number;
  l60s: number;
  rate: number;
}

export interface VelocityData {
  t30: number;
  t60: number;
  l30s: number;
  l60s: number;
  rate: number;
}

export interface PumpTrend {
  trend: number;
  label: string;
  color: string;
  mcSlope: number;
  volSlope: number;
  bondSlope: number;
  history: any[];
}

export interface Multiplier {
  mult: number;
  initialMc: number;
  label: string | null;
  color: string;
}

export interface VoiceState {
  enabled: boolean;
  queue: string[];
  speaking: boolean;
  lastSpokenMc: Map<string, number>;
  lastSpokenBonding: Map<string, number>;
  pauseRecognition: (()=>void) | null;
  resumeRecognition: (()=>void) | null;
  pttActive: boolean;
}

export interface AiAgentState {
  enabled: boolean;
  lastRunAt: number;
  running: boolean;
  lastText: string;
  history: AiHistoryItem[];
}

export interface AiHistoryItem {
  ts: number;
  text: string;
  isReply: boolean;
  question: string | null;
}

export interface SnapshotItem {
  symbol: string;
  score: number;
  verdict: string;
  bundlePct: number;
  bSlots: number;
  mcUsd: number;
  bonding: number;
  swBuy: number;
  swSell: number;
  bundlerSellCount: number;
  devSold: boolean;
  pumpTrend: string;
  multiplier: number;
  ageSec: number;
}

export interface BlacklistInfo {
  count: number;
  lastSeen: number;
  reason: string;
}
