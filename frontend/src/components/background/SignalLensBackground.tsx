"use client";

import { useEffect, useRef, useState } from "react";

type Node = {
  u: number;
  v: number;
  amp: number;
  phaseX: number;
  phaseY: number;
  speed: number;
};

type Edge = {
  a: number;
  b: number;
};

const LABELS = [
  "Sports Alpha",
  "Macro Drift",
  "Flow Sentinel",
  "Arb Desk",
  "Narrative Fade",
  "Value Cluster",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function SignalLensBackground({
  containerRef,
  overlayOnly = false,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  overlayOnly?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const revealCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const [lensVisible, setLensVisible] = useState(false);
  const [lensLocked, setLensLocked] = useState(false);

  useEffect(() => {
    const container = containerRef.current ?? rootRef.current?.parentElement ?? null;
    const baseCanvas = baseCanvasRef.current;
    const revealCanvas = revealCanvasRef.current;
    const lens = lensRef.current;
    if (!container || !baseCanvas || !revealCanvas || !lens) return;

    const baseCtx = baseCanvas.getContext("2d");
    const revealCtx = revealCanvas.getContext("2d");
    if (!baseCtx || !revealCtx) return;

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nodeCount = 92;
    const nodes: Node[] = [];
    for (let i = 0; i < nodeCount; i += 1) {
      nodes.push({
        u: 0.08 + Math.random() * 0.84,
        v: 0.1 + Math.random() * 0.8,
        amp: 3 + Math.random() * 4,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.45,
      });
    }

    const edges: Edge[] = [];
    const edgeSet = new Set<string>();
    const nearestPerNode = 3;
    for (let i = 0; i < nodeCount; i += 1) {
      const nearest: Array<{ idx: number; dist: number }> = [];
      for (let j = 0; j < nodeCount; j += 1) {
        if (i === j) continue;
        const dx = nodes[i].u - nodes[j].u;
        const dy = nodes[i].v - nodes[j].v;
        nearest.push({ idx: j, dist: dx * dx + dy * dy });
      }
      nearest.sort((a, b) => a.dist - b.dist);
      for (let k = 0; k < nearestPerNode; k += 1) {
        const a = Math.min(i, nearest[k].idx);
        const b = Math.max(i, nearest[k].idx);
        const key = `${a}-${b}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ a, b });
        }
      }
    }

    const labelIndices = [4, 15, 27, 43, 61, 74];
    const lockTimer = { id: 0 as number | undefined };
    const pointer = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let hovered = false;
    let width = 1;
    let height = 1;
    let radius = 170;
    let rafId = 0;

    const resize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      baseCanvas.width = Math.floor(width * dpr);
      baseCanvas.height = Math.floor(height * dpr);
      revealCanvas.width = Math.floor(width * dpr);
      revealCanvas.height = Math.floor(height * dpr);
      baseCanvas.style.width = `${width}px`;
      baseCanvas.style.height = `${height}px`;
      revealCanvas.style.width = `${width}px`;
      revealCanvas.style.height = `${height}px`;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      revealCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      radius = width < 768 ? 112 : 168;
      if (!hovered) {
        pointer.x = width * 0.5;
        pointer.y = height * 0.55;
        current.x = pointer.x;
        current.y = pointer.y;
      }
    };

    const getNodePosition = (node: Node, t: number) => {
      return {
        x: node.u * width + Math.sin(t * node.speed + node.phaseX) * node.amp,
        y: node.v * height + Math.cos(t * (node.speed + 0.05) + node.phaseY) * node.amp,
      };
    };

    const draw = (time: number) => {
      const t = time * 0.001;
      const lerp = reducedMotion ? 1 : 0.16;
      current.x += (pointer.x - current.x) * lerp;
      current.y += (pointer.y - current.y) * lerp;

      const positions = nodes.map((node) => getNodePosition(node, t));

      baseCtx.clearRect(0, 0, width, height);
      if (!overlayOnly) {
        baseCtx.lineWidth = 1;
        baseCtx.strokeStyle = "rgba(237, 237, 237, 0.11)";
        for (const edge of edges) {
          const a = positions[edge.a];
          const b = positions[edge.b];
          baseCtx.beginPath();
          baseCtx.moveTo(a.x, a.y);
          baseCtx.lineTo(b.x, b.y);
          baseCtx.stroke();
        }
        baseCtx.fillStyle = "rgba(237, 237, 237, 0.26)";
        for (const p of positions) {
          baseCtx.beginPath();
          baseCtx.arc(p.x, p.y, 1.15, 0, Math.PI * 2);
          baseCtx.fill();
        }
      }

      revealCtx.clearRect(0, 0, width, height);
      const parallaxX = ((current.x / width) - 0.5) * -4;
      const parallaxY = ((current.y / height) - 0.5) * -4;
      revealCtx.save();
      revealCtx.translate(parallaxX, parallaxY);
      revealCtx.shadowColor = "rgba(237, 237, 237, 0.38)";
      revealCtx.shadowBlur = 6;
      revealCtx.lineWidth = 1.2;
      revealCtx.strokeStyle = "rgba(237, 237, 237, 0.5)";
      for (const edge of edges) {
        const a = positions[edge.a];
        const b = positions[edge.b];
        revealCtx.beginPath();
        revealCtx.moveTo(a.x, a.y);
        revealCtx.lineTo(b.x, b.y);
        revealCtx.stroke();
      }
      revealCtx.fillStyle = "rgba(237, 237, 237, 0.84)";
      for (const p of positions) {
        revealCtx.beginPath();
        revealCtx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        revealCtx.fill();
      }

      revealCtx.font = "11px var(--font-mono), monospace";
      revealCtx.textBaseline = "bottom";
      revealCtx.fillStyle = "rgba(237, 237, 237, 0.86)";
      for (let i = 0; i < labelIndices.length; i += 1) {
        const idx = labelIndices[i];
        const p = positions[idx];
        const label = LABELS[i];
        revealCtx.fillText(label, p.x + 6, p.y - 5);
      }
      revealCtx.restore();

      const cx = clamp(current.x, radius, width - radius);
      const cy = clamp(current.y, radius, height - radius);
      if (!coarsePointer) {
        const clipValue = `circle(${radius}px at ${cx}px ${cy}px)`;
        revealCanvas.style.clipPath = clipValue;
        revealCanvas.style.setProperty("-webkit-clip-path", clipValue);
      }
      lens.style.width = `${radius * 2}px`;
      lens.style.height = `${radius * 2}px`;
      lens.style.transform = `translate(${cx - radius}px, ${cy - radius}px)`;

      rafId = window.requestAnimationFrame(draw);
    };

    const onPointerEnter = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (reducedMotion) {
        current.x = pointer.x;
        current.y = pointer.y;
      }
      hovered = true;
      setLensVisible(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!hovered) return;
      const rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (reducedMotion) {
        current.x = pointer.x;
        current.y = pointer.y;
      }
    };

    const onPointerLeave = () => {
      hovered = false;
      setLensVisible(false);
    };

    const onPointerDown = () => {
      setLensLocked(true);
      if (lockTimer.id) {
        window.clearTimeout(lockTimer.id);
      }
      lockTimer.id = window.setTimeout(() => setLensLocked(false), 400);
    };

    if (!coarsePointer) {
      container.addEventListener("pointerenter", onPointerEnter);
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      container.addEventListener("pointerdown", onPointerDown);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    rafId = window.requestAnimationFrame(draw);

    return () => {
      if (lockTimer.id) {
        window.clearTimeout(lockTimer.id);
      }
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      if (!coarsePointer) {
        container.removeEventListener("pointerenter", onPointerEnter);
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerleave", onPointerLeave);
        container.removeEventListener("pointerdown", onPointerDown);
      }
    };
  }, [containerRef, overlayOnly]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <canvas
        ref={baseCanvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: overlayOnly ? 0 : 1 }}
      />
      <canvas
        ref={revealCanvasRef}
        className="absolute inset-0 h-full w-full mix-blend-screen transition-opacity duration-300"
        style={{ opacity: lensVisible ? 0.98 : 0 }}
      />
      <div
        ref={lensRef}
        className="absolute rounded-full border border-foreground/55 transition-opacity duration-300"
        style={{
          opacity: lensVisible ? 1 : 0,
          boxShadow: lensLocked
            ? "0 0 0 1px rgba(237,237,237,0.8), inset 0 0 24px rgba(255,255,255,0.14)"
            : "0 0 0 1px rgba(237,237,237,0.45), inset 0 0 18px rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}
