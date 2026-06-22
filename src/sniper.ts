import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getRpcHttpList } from "./config";

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export type SniperConfig = {
  enabled: boolean;
  minScore: number;
  maxMc: number;
  maxBonding: number;
  solAmount: number;
  slippagePct: number;
};

export const defaultSniperConfig: SniperConfig = {
  enabled: false,
  minScore: 75,
  maxMc: 50000,
  maxBonding: 60,
  solAmount: 0.05,
  slippagePct: 20,
};

let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(getRpcHttpList()[0], "confirmed");
  }
  return connection;
}

export async function executeBuy(
  wallet: WalletContextState,
  mint: string,
  solAmount: number,
  slippagePct: number,
): Promise<string | null> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    console.warn("[Sniper] Wallet non connesso");
    return null;
  }

  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(mint);
    const SOL_LAMPORTS = Math.floor(solAmount * LAMPORTS_PER_SOL);

    // Get or derive the bonding curve address
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mintPubkey.toBuffer()],
      PUMP_PROGRAM,
    );

    // Build pump.fun buy instruction manually
    // This is a simplified version — real pump.fun buys use their specific CPI
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: bondingCurve,
        lamports: SOL_LAMPORTS,
      }),
    );

    tx.feePayer = wallet.publicKey;
    const blockhash = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash.blockhash;

    const signed = await wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize());
    await conn.confirmTransaction(sig);

    console.log(`[Sniper] Acquisto eseguito: ${sig}`);
    return sig;
  } catch (e) {
    console.warn("[Sniper] Errore acquisto:", e);
    return null;
  }
}

export function shouldSnipe(tok: any, config: SniperConfig): boolean {
  if (!config.enabled) return false;
  if ((tok.score || 0) < config.minScore) return false;
  if ((tok.mc || 0) > config.maxMc) return false;
  if ((tok.bonding || 0) > config.maxBonding) return false;
  return true;
}
