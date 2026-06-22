export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_V3 = "https://frontend-api-v3.pump.fun";

export let HELIUS_KEY = "";

export function setHeliusKey(k: string) { HELIUS_KEY = k; }

export function getRpcHttpList() {
  if (HELIUS_KEY) {
    return [
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      "https://solana.publicnode.com",
      "https://api.mainnet-beta.solana.com",
    ];
  }
  return [
    "https://solana.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
}

export const RPC_WS_LIST = [
  "wss://solana.publicnode.com",
  "wss://api.mainnet-beta.solana.com",
];

export const SMART_WALLETS = [
  "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o",
  "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt",
  "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm",
  "5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg",
  "4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9",
  "5B52w1ZW9touwUduueP5J7HXz5AcGfruGoX6YoAudvyxG",
  "6HJetMbdHBuk3mLUainxAPpBpWzDgYbHGTS2TqDAUSX2",
  "215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP",
  "4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t",
];

export const SMART_SET = new Set(SMART_WALLETS);
export const SMART_SHORT = Object.fromEntries(
  SMART_WALLETS.map(w => [w, w.slice(0, 5) + "..." + w.slice(-4)])
);

export const MC_STEP = 3000;
export const BOND_STEP = 20;
export const MAX_SNAPSHOTS = 40;
export const MAX_PAR = 2;
export const AI_INTERVAL = 30000;
export const AI_FIRST_DELAY = 3000;

export const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001";
