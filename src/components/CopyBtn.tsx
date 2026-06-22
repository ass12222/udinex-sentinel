import { useState } from "react";

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { console.warn("[CopyBtn] clipboard fallito"); });
  };
  return (
    <button
      className={`copy-btn${copied ? " copied" : ""}`}
      onClick={e => { e.stopPropagation(); handleCopy(); }}
    >
      {copied ? "✓ OK" : "⧉ CA"}
    </button>
  );
}
