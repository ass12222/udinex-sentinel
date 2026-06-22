import { useRef, useEffect, useCallback } from "react";
import type { ScoredToken } from "../types";

type NeuralViewProps = {
  scored: ScoredToken[];
  onSelect: (mint: string | null) => void;
};

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  label: string;
  mint: string;
  score: number;
}

export function NeuralView({ scored, onSelect }: NeuralViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const nodesRef = useRef<Node[]>([]);
  const selRef = useRef<string | null>(null);

  const rebuildNodes = useCallback(() => {
    const w = canvasRef.current?.width || 600;
    const h = canvasRef.current?.height || 400;
    const nodes: Node[] = scored.slice(0, 80).map((s, i) => {
      const angle = (i / Math.min(scored.length, 80)) * Math.PI * 2;
      const dist = 60 + (s.ss.score / 100) * 100;
      return {
        x: w / 2 + Math.cos(angle) * dist,
        y: h / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        r: 6 + (s.ss.score / 100) * 18,
        color: s.ss.vcolor,
        label: s.tok.symbol || s.tok.mint.slice(0, 6),
        mint: s.tok.mint,
        score: s.ss.score,
      };
    });
    nodesRef.current = nodes;
  }, [scored]);

  useEffect(() => {
    rebuildNodes();
  }, [rebuildNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        rebuildNodes();
        if (!animRef.current) startAnim();
      }
    };
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const centerX = () => canvas.width / 2;
    const centerY = () => canvas.height / 2;

    function startAnim() {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(draw);
    }

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const nodes = nodesRef.current;
      const cx = centerX();
      const cy = centerY();
      let energy = 0;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = cx - n.x;
        const dy = cy - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          n.vx += dx * 0.002;
          n.vy += dy * 0.002;
        }
        for (let j = i + 1; j < nodes.length; j++) {
          const o = nodes[j];
          const rx = o.x - n.x;
          const ry = o.y - n.y;
          const rd = Math.sqrt(rx * rx + ry * ry) || 1;
          const minD = n.r + o.r + 10;
          if (rd < minD) {
            const force = (minD - rd) * 0.05;
            const fx = (rx / rd) * force;
            const fy = (ry / rd) * force;
            n.vx -= fx;
            n.vy -= fy;
            o.vx += fx;
            o.vy += fy;
          }
        }
        n.vx *= 0.92;
        n.vy *= 0.92;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(n.r, Math.min(canvas.width - n.r, n.x));
        n.y = Math.max(n.r, Math.min(canvas.height - n.r, n.y));
        energy += n.vx * n.vx + n.vy * n.vy;
      }

      ctx.save();
      ctx.globalAlpha = 0.06;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
      }
      ctx.restore();

      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "33";
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (selRef.current === n.mint) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#00f5ff";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = n.color;
        ctx.font = `${Math.max(8, Math.min(11, n.r * 0.6))}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(n.label, n.x, n.y + n.r + 3);
      }

      if (energy > 0.5) {
        animRef.current = requestAnimationFrame(draw);
      } else {
        animRef.current = 0;
      }
    }

    startAnim();

    const handleClick = (e: MouseEvent) => {
      if (!animRef.current) startAnim();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = mx - n.x;
        const dy = my - n.y;
        if (dx * dx + dy * dy <= (n.r + 5) * (n.r + 5)) {
          if (selRef.current === n.mint) {
            selRef.current = null;
            onSelect(null);
          } else {
            selRef.current = n.mint;
            onSelect(n.mint);
          }
          return;
        }
      }
      selRef.current = null;
      onSelect(null);
    };

    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      canvas.removeEventListener("click", handleClick);
    };
  }, [scored, onSelect, rebuildNodes]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%", cursor: "pointer", minHeight: 200 }}
    />
  );
}
