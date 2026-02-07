"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ThreeTechnologyBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const [lensVisible, setLensVisible] = useState(false);
  const [lensLocked, setLensLocked] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    const lens = lensRef.current;
    if (!mount || !lens) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
    camera.position.set(0, 0, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const nodeCount = 160;
    const bounds = 140;
    const positions = new Float32Array(nodeCount * 3);
    const basePositions = new Float32Array(nodeCount * 3);
    const pointColors = new Float32Array(nodeCount * 3);
    const lineColors = new Float32Array(nodeCount * 3);

    for (let i = 0; i < nodeCount; i += 1) {
      const x = (Math.random() - 0.5) * bounds;
      const y = (Math.random() - 0.5) * bounds;
      const z = (Math.random() - 0.5) * bounds;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
      pointColors[i * 3] = 0.28;
      pointColors[i * 3 + 1] = 0.28;
      pointColors[i * 3 + 2] = 0.28;
      lineColors[i * 3] = 0.22;
      lineColors[i * 3 + 1] = 0.22;
      lineColors[i * 3 + 2] = 0.22;
    }

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute("color", new THREE.BufferAttribute(pointColors, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.0,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    const lineIndices: number[] = [];
    const edgeSet = new Set<string>();
    const addEdge = (a: number, b: number) => {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      const key = `${low}-${high}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        lineIndices.push(low, high);
      }
    };

    const neighborsPerNode = 2;
    for (let i = 0; i < nodeCount; i += 1) {
      const nearest: Array<{ idx: number; distSq: number }> = [];
      for (let j = 0; j < nodeCount; j += 1) {
        if (i === j) continue;
        const dx = basePositions[i * 3] - basePositions[j * 3];
        const dy = basePositions[i * 3 + 1] - basePositions[j * 3 + 1];
        const dz = basePositions[i * 3 + 2] - basePositions[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        nearest.push({ idx: j, distSq });
      }

      nearest.sort((a, b) => a.distSq - b.distSq);
      for (let k = 0; k < neighborsPerNode; k += 1) {
        addEdge(i, nearest[k].idx);
      }
    }

    for (let i = 0; i < nodeCount; i += 1) {
      if (i % 28 === 0) {
        const target = (i * 7 + 31) % nodeCount;
        addEdge(i, target);
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    lineGeometry.setIndex(lineIndices);
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    const cameraTargetNdc = { x: 0, y: 0 };
    const cameraCurrentNdc = { x: 0, y: 0 };
    const pointerTargetPx = { x: 0, y: 0 };
    const pointerCurrentPx = { x: 0, y: 0 };

    let width = 1;
    let height = 1;
    let lensRadiusPx = 170;
    let rafId = 0;
    let lockTimer: number | undefined;

    const syncLens = () => {
      if (coarsePointer) return;
      const cx = clamp(pointerCurrentPx.x, lensRadiusPx, width - lensRadiusPx);
      const cy = clamp(pointerCurrentPx.y, lensRadiusPx, height - lensRadiusPx);
      lens.style.width = `${lensRadiusPx * 2}px`;
      lens.style.height = `${lensRadiusPx * 2}px`;
      lens.style.transform = `translate(${cx - lensRadiusPx}px, ${cy - lensRadiusPx}px)`;
    };

    const onResize = () => {
      width = Math.max(1, mount.clientWidth || window.innerWidth);
      height = Math.max(1, mount.clientHeight || window.innerHeight);
      lensRadiusPx = width < 768 ? 108 : 160;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);

      pointerTargetPx.x = clamp(pointerTargetPx.x || width * 0.5, 0, width);
      pointerTargetPx.y = clamp(pointerTargetPx.y || height * 0.55, 0, height);
      pointerCurrentPx.x = pointerTargetPx.x;
      pointerCurrentPx.y = pointerTargetPx.y;
      syncLens();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerTargetPx.x = clamp(event.clientX, 0, width);
      pointerTargetPx.y = clamp(event.clientY, 0, height);
      cameraTargetNdc.x = (pointerTargetPx.x / width - 0.5) * 2;
      cameraTargetNdc.y = (pointerTargetPx.y / height - 0.5) * 2;
      if (!coarsePointer) {
        setLensVisible(true);
      }
    };

    const onPointerLeave = () => {
      setLensVisible(false);
    };

    const onPointerDown = () => {
      if (coarsePointer) return;
      setLensLocked(true);
      if (lockTimer) window.clearTimeout(lockTimer);
      lockTimer = window.setTimeout(() => setLensLocked(false), 400);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseleave", onPointerLeave, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    onResize();
    requestAnimationFrame(onResize);

    const clock = new THREE.Clock();
    const projected = new THREE.Vector3();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const lerp = reducedMotion ? 1 : 0.14;

      pointerCurrentPx.x += (pointerTargetPx.x - pointerCurrentPx.x) * lerp;
      pointerCurrentPx.y += (pointerTargetPx.y - pointerCurrentPx.y) * lerp;
      cameraCurrentNdc.x += (cameraTargetNdc.x - cameraCurrentNdc.x) * (reducedMotion ? 1 : 0.06);
      cameraCurrentNdc.y += (cameraTargetNdc.y - cameraCurrentNdc.y) * (reducedMotion ? 1 : 0.06);

      scene.rotation.y += 0.0008;
      scene.rotation.x += 0.0002;
      camera.position.x = cameraCurrentNdc.x * 7;
      camera.position.y = -cameraCurrentNdc.y * 7;
      camera.lookAt(0, 0, 0);
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);

      for (let i = 0; i < nodeCount; i += 1) {
        positions[i * 3] = basePositions[i * 3] + Math.sin(t * 0.5 + i * 0.14) * 0.7;
        positions[i * 3 + 1] = basePositions[i * 3 + 1] + Math.cos(t * 0.45 + i * 0.11) * 0.7;
        positions[i * 3 + 2] = basePositions[i * 3 + 2] + Math.sin(t * 0.3 + i * 0.07) * 0.45;

        projected
          .set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
          .applyMatrix4(scene.matrixWorld)
          .project(camera);

        const screenX = (projected.x * 0.5 + 0.5) * width;
        const screenY = (-projected.y * 0.5 + 0.5) * height;
        const dist = Math.hypot(screenX - pointerCurrentPx.x, screenY - pointerCurrentPx.y);
        const boostRaw = Math.max(0, 1 - dist / lensRadiusPx);
        const boost = Math.pow(boostRaw, 1.15);
        const pointIntensity = clamp(0.28 + boost * 1.35, 0, 1.55);
        const lineIntensity = clamp(0.22 + boost * 1.2, 0, 1.4);
        pointColors[i * 3] = pointIntensity;
        pointColors[i * 3 + 1] = pointIntensity;
        pointColors[i * 3 + 2] = pointIntensity;
        lineColors[i * 3] = lineIntensity;
        lineColors[i * 3 + 1] = lineIntensity;
        lineColors[i * 3 + 2] = lineIntensity;
      }

      pointsGeometry.attributes.position.needsUpdate = true;
      pointsGeometry.attributes.color.needsUpdate = true;
      lineGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.color.needsUpdate = true;

      syncLens();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (lockTimer) window.clearTimeout(lockTimer);
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 h-dvh overflow-hidden bg-background">
      <div ref={mountRef} className="h-full w-full opacity-92 grayscale" />
      <div className="absolute inset-0 bg-background/18" />
      <div
        ref={lensRef}
        className="absolute rounded-full border border-foreground/70 transition-opacity duration-200"
        style={{
          opacity: lensVisible ? 1 : 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 58%, rgba(255,255,255,0) 74%)",
          boxShadow: lensLocked
            ? "0 0 0 1px rgba(237,237,237,0.98), inset 0 0 32px rgba(255,255,255,0.22)"
            : "0 0 0 1px rgba(237,237,237,0.62), inset 0 0 22px rgba(255,255,255,0.12)",
        }}
      />
    </div>
  );
}
