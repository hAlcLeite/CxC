"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function ThreeTechnologyBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const nodeCount = 160;
    const bounds = 140;
    const positions = new Float32Array(nodeCount * 3);
    const basePositions = new Float32Array(nodeCount * 3);

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
    }

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,
      transparent: true,
      opacity: 0.8,
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

    // Build a stable network by connecting each node to its nearest neighbors.
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

    // Add a few longer "hub" links for a stronger network feel.
    for (let i = 0; i < nodeCount; i += 1) {
      if (i % 28 === 0) {
        const target = (i * 7 + 31) % nodeCount;
        addEdge(i, target);
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeometry.setIndex(lineIndices);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    const mouse = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const onPointerMove = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth - 0.5) * 2;
      target.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("resize", onResize);

    let rafId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;

      for (let i = 0; i < nodeCount; i += 1) {
        positions[i * 3] = basePositions[i * 3] + Math.sin(t * 0.5 + i * 0.14) * 0.7;
        positions[i * 3 + 1] = basePositions[i * 3 + 1] + Math.cos(t * 0.45 + i * 0.11) * 0.7;
        positions[i * 3 + 2] = basePositions[i * 3 + 2] + Math.sin(t * 0.3 + i * 0.07) * 0.45;
      }

      pointsGeometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.position.needsUpdate = true;

      scene.rotation.y += 0.0008;
      scene.rotation.x += 0.0002;
      camera.position.x = mouse.x * 7;
      camera.position.y = -mouse.y * 7;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div ref={mountRef} className="h-full w-full opacity-75 grayscale" />
      <div className="absolute inset-0 bg-background/40" />
    </div>
  );
}
