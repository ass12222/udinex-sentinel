import { voiceState } from "./state";
import { MC_STEP, BOND_STEP } from "./config";
import { fmc } from "./helpers";

// ─── Speak ─────────────────────────────────────────────────────────────────────
export function speak(text: string) {
  if (!voiceState.enabled) return;
  voiceState.queue.push(text);
  drainVoiceQueue();
}

function drainVoiceQueue() {
  if (voiceState.speaking || !voiceState.queue.length) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const text = voiceState.queue.shift()!;
  voiceState.speaking = true;
  if (voiceState.pauseRecognition) voiceState.pauseRecognition();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "it-IT";
  utter.rate = 1.05;
  utter.pitch = 0.9;
  utter.onend = () => {
    voiceState.speaking = false;
    setTimeout(() => {
      if (voiceState.resumeRecognition) voiceState.resumeRecognition();
    }, 1200);
    drainVoiceQueue();
  };
  utter.onerror = () => {
    voiceState.speaking = false;
    setTimeout(() => {
      if (voiceState.resumeRecognition) voiceState.resumeRecognition();
    }, 600);
    drainVoiceQueue();
  };
  try {
    window.speechSynthesis.speak(utter);
  } catch {
    voiceState.speaking = false;
  }
}

// ─── Milestone checks ──────────────────────────────────────────────────────────
export function checkMcMilestone(mint: string, symbol: string, mc: number) {
  const lastStep = voiceState.lastSpokenMc.get(mint) || 0;
  const currentStep = Math.floor(mc / MC_STEP);
  if (currentStep > lastStep) {
    voiceState.lastSpokenMc.set(mint, currentStep);
    if (lastStep > 0) {
      speak(`${symbol} ha superato ${fmc(currentStep * MC_STEP)} di market cap`);
    }
  }
}

export function checkBondingMilestone(mint: string, symbol: string, bonding: number) {
  const lastStep = voiceState.lastSpokenBonding.get(mint) || 0;
  const currentStep = Math.floor(bonding / BOND_STEP);
  if (currentStep > lastStep && currentStep > 0) {
    voiceState.lastSpokenBonding.set(mint, currentStep);
    if (bonding >= 90) speak(`${symbol} bonding quasi completata, ${Math.round(bonding)} percento`);
    else speak(`${symbol} bonding al ${Math.round(bonding)} percento`);
  }
}
