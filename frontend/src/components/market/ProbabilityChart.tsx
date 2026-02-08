"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Card, CardTitle, CardContent } from "@/components/ui";
import { SiGraphite } from "react-icons/si";
import type { TimeSeriesPoint } from "@/lib/types";
import { fetchProbabilityEmbedding } from "@/lib/api";
import { ProbabilityLatticeScene } from "@/components/market/ProbabilityLatticeScene";
import { format } from "date-fns";

interface ProbabilityChartProps {
	marketId: string;
	timeSeries: TimeSeriesPoint[];
	compact?: boolean;
}

type VisualizationMode = "dna" | "lattice";

interface DnaPoint {
	time: string;
	market: number;
	precognition: number;
	divergence: number;
	confidence: number;
	embedX?: number;
	embedY?: number;
	embedZ?: number;
}

interface ProbabilityDnaSceneProps {
	data: DnaPoint[];
	yDomain: [number, number];
	source: "embedding" | "timeseries" | "mock";
}

function clamp(value: number, lower: number, upper: number): number {
	return Math.max(lower, Math.min(upper, value));
}

const DNA_CAMERA_BASE_DISTANCE = 152;
const DNA_CAMERA_MIN_DISTANCE = 104;
const DNA_CAMERA_MAX_DISTANCE = 230;

function seededNoise(seed: number): number {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
}

function generateMockDnaData(count = 80): DnaPoint[] {
	const series: DnaPoint[] = [];
	let market = 0.52;
	let precognition = 0.49;
	for (let i = 0; i < count; i += 1) {
		const drift = Math.sin(i * 0.075) * 0.012 + (seededNoise(i + 11) - 0.5) * 0.01;
		const divergencePulse =
			Math.sin(i * 0.22) * 0.035 +
			(i % 19 === 0 ? (seededNoise(i + 97) - 0.5) * 0.09 : 0);
		market = clamp(market + drift, 0.08, 0.92);
		precognition = clamp(
			precognition +
			drift * 0.6 +
			divergencePulse * 0.42 +
			(seededNoise(i + 173) - 0.5) * 0.008,
			0.06,
			0.94,
		);
		const divergence = Math.abs(precognition - market);
		const confidence = clamp(
			0.38 +
			divergence * 3.2 +
			Math.sin(i * 0.11) * 0.14 +
			(seededNoise(i + 251) - 0.5) * 0.06,
			0.12,
			0.97,
		);
		series.push({
			time: `T-${String(count - i).padStart(2, "0")}`,
			market: market * 100,
			precognition: precognition * 100,
			divergence: (precognition - market) * 100,
			confidence,
		});
	}
	return series;
}

function ProbabilityDnaScene({ data, yDomain, source }: ProbabilityDnaSceneProps) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [zoomPct, setZoomPct] = useState(
		Math.round((DNA_CAMERA_BASE_DISTANCE / DNA_CAMERA_MIN_DISTANCE) * 100),
	);
	const hoverIndexRef = useRef(-1);

	useEffect(() => {
		const mount = mountRef.current;
		const tooltip = tooltipRef.current;
		if (!mount || !tooltip || data.length < 2) return;

		hoverIndexRef.current = -1;

		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2(0x000000, 0.0068);

		const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 1000);
		camera.position.set(0, 4, DNA_CAMERA_MIN_DISTANCE);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.22;
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";
		renderer.domElement.style.display = "block";
		mount.appendChild(renderer.domElement);

		const disposables: Array<{ dispose: () => void }> = [];
		const track = <T extends { dispose?: () => void }>(item: T): T => {
			if (typeof item.dispose === "function") {
				disposables.push(item as { dispose: () => void });
			}
			return item;
		};

		const fatLineMaterials: LineMaterial[] = [];

		const dnaGroup = new THREE.Group();
		scene.add(dnaGroup);

		const ambient = new THREE.AmbientLight(0xffffff, 0.84);
		const key = new THREE.DirectionalLight(0xffffff, 0.74);
		key.position.set(1.8, 2, 2.4);
		const fill = new THREE.DirectionalLight(0xffffff, 0.38);
		fill.position.set(-1.2, -1.4, -1);
		scene.add(ambient, key, fill);

		const [domainMin, domainMax] = yDomain;
		const domainSpan = Math.max(1e-4, domainMax - domainMin);
		const zSpan = 184;
		const yAmplitude = 58;
		const baseRadius = 8.8;
		const tilt = 0.26;
		const twistTurns = 4.8;
		const hasEmbedding = data.every(
			(point) =>
				typeof point.embedX === "number" &&
				typeof point.embedY === "number" &&
				typeof point.embedZ === "number",
		);

		const marketPoints: Array<InstanceType<typeof THREE.Vector3>> = [];
		const precognitionPoints: Array<InstanceType<typeof THREE.Vector3>> = [];
		const rungMidpoints: Array<InstanceType<typeof THREE.Vector3>> = [];
		const centers: Array<InstanceType<typeof THREE.Vector3>> = [];

		if (hasEmbedding) {
			for (let i = 0; i < data.length; i += 1) {
				const point = data[i];
				const t = data.length > 1 ? i / (data.length - 1) : 0.5;
				centers.push(
					new THREE.Vector3(
						(point.embedX ?? 0) * 38,
						(point.embedY ?? 0) * 30,
						(((point.embedZ ?? 0) * 0.38 + (t - 0.5) * 1.35) * zSpan) / 2,
					),
				);
			}
		}

		for (let i = 0; i < data.length; i += 1) {
			const point = data[i];
			const t = data.length > 1 ? i / (data.length - 1) : 0.5;
			const marketYNorm = (point.market - domainMin) / domainSpan - 0.5;
			const precognitionYNorm = (point.precognition - domainMin) / domainSpan - 0.5;

			let marketPos: InstanceType<typeof THREE.Vector3>;
			let precognitionPos: InstanceType<typeof THREE.Vector3>;

			if (hasEmbedding) {
				const center = centers[i];
				const prevCenter = centers[Math.max(0, i - 1)];
				const nextCenter = centers[Math.min(centers.length - 1, i + 1)];
				const tangent = new THREE.Vector3().subVectors(nextCenter, prevCenter).normalize();
				const upRef = new THREE.Vector3(0, 1, 0);
				const fallbackRef = new THREE.Vector3(1, 0, 0);
				const perp = new THREE.Vector3().crossVectors(tangent, upRef);
				if (perp.lengthSq() < 1e-6) {
					perp.crossVectors(tangent, fallbackRef);
				}
				perp.normalize();

				const separation =
					5.2 + Math.abs(point.divergence) * 0.14 + point.confidence * 1.05;
				const verticalScale = 9;
				const marketYOffset = marketYNorm * verticalScale;
				const precognitionYOffset = precognitionYNorm * verticalScale;

				marketPos = center
					.clone()
					.addScaledVector(perp, separation * 0.5)
					.add(new THREE.Vector3(0, marketYOffset, 0));
				precognitionPos = center
					.clone()
					.addScaledVector(perp, -separation * 0.5)
					.add(new THREE.Vector3(0, precognitionYOffset, 0));
			} else {
				const angle = t * twistTurns * Math.PI * 2;
				const divergenceScale = clamp(Math.abs(point.divergence) / 25, 0, 1);
				const radius = baseRadius + divergenceScale * 4;
				const z = (t - 0.5) * zSpan;
				const marketY = marketYNorm * yAmplitude + Math.sin(angle) * radius * tilt;
				const precognitionY =
					precognitionYNorm * yAmplitude + Math.sin(angle + Math.PI) * radius * tilt;

				marketPos = new THREE.Vector3(Math.cos(angle) * radius, marketY, z);
				precognitionPos = new THREE.Vector3(
					Math.cos(angle + Math.PI) * radius,
					precognitionY,
					z,
				);
			}

			marketPoints.push(marketPos);
			precognitionPoints.push(precognitionPos);
			rungMidpoints.push(
				new THREE.Vector3().addVectors(marketPos, precognitionPos).multiplyScalar(0.5),
			);
		}

		const axisGeometry = track(new THREE.BufferGeometry());
		axisGeometry.setAttribute(
			"position",
			track(
				new THREE.Float32BufferAttribute(
					[0, -44, -zSpan / 2, 0, 44, zSpan / 2],
					3,
				),
			),
		);
		const axis = new THREE.Line(
			axisGeometry,
			track(
				new THREE.LineBasicMaterial({
					color: 0xb0b0b0,
					transparent: true,
					opacity: 0.6,
				}),
			),
		);
		dnaGroup.add(axis);

		// ---- PCA spine line with curvature-based brightness (Option C) ----
		const spinePoints = centers.length > 1 ? centers : rungMidpoints;
		if (spinePoints.length > 1) {
			// Compute per-segment curvature for brightness
			const spineCurvatures = new Float32Array(spinePoints.length);
			for (let i = 1; i < spinePoints.length - 1; i += 1) {
				const prev = spinePoints[i - 1];
				const curr = spinePoints[i];
				const next = spinePoints[i + 1];
				const d1x = curr.x - prev.x;
				const d1y = curr.y - prev.y;
				const d1z = curr.z - prev.z;
				const d2x = next.x - curr.x;
				const d2y = next.y - curr.y;
				const d2z = next.z - curr.z;
				const l1 = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z) || 1e-6;
				const l2 = Math.sqrt(d2x * d2x + d2y * d2y + d2z * d2z) || 1e-6;
				const dot =
					(d1x * d2x + d1y * d2y + d1z * d2z) / (l1 * l2);
				spineCurvatures[i] = 1 - clamp(dot, -1, 1);
			}
			spineCurvatures[0] = spineCurvatures[1] || 0;
			spineCurvatures[spinePoints.length - 1] =
				spineCurvatures[spinePoints.length - 2] || 0;

			// Normalize curvature to 0-1 range
			let maxCurv = 0;
			for (let i = 0; i < spineCurvatures.length; i += 1) {
				if (spineCurvatures[i] > maxCurv) maxCurv = spineCurvatures[i];
			}
			const curvScale = maxCurv > 1e-6 ? 1 / maxCurv : 1;

			// Build spine as line segments with per-vertex color for curvature brightness
			const segCount = spinePoints.length - 1;
			const spineSegPositions = new Float32Array(segCount * 2 * 3);
			const spineSegColors = new Float32Array(segCount * 2 * 3);
			for (let i = 0; i < segCount; i += 1) {
				const a = spinePoints[i];
				const b = spinePoints[i + 1];
				const j = i * 6;
				spineSegPositions[j] = a.x;
				spineSegPositions[j + 1] = a.y;
				spineSegPositions[j + 2] = a.z;
				spineSegPositions[j + 3] = b.x;
				spineSegPositions[j + 4] = b.y;
				spineSegPositions[j + 5] = b.z;
				// Brightness: base 0.45, rises to 1.0 with curvature
				const cA = 0.45 + clamp(spineCurvatures[i] * curvScale, 0, 1) * 0.55;
				const cB = 0.45 + clamp(spineCurvatures[i + 1] * curvScale, 0, 1) * 0.55;
				spineSegColors[j] = cA;
				spineSegColors[j + 1] = cA;
				spineSegColors[j + 2] = cA;
				spineSegColors[j + 3] = cB;
				spineSegColors[j + 4] = cB;
				spineSegColors[j + 5] = cB;
			}
			const spineGeometry = new LineSegmentsGeometry();
			disposables.push(spineGeometry as unknown as { dispose: () => void });
			spineGeometry.setPositions(spineSegPositions);
			spineGeometry.setColors(spineSegColors);
			const spineLineMat = new LineMaterial({
				worldUnits: false,
				resolution: new THREE.Vector2(1, 1),
			});
			spineLineMat.vertexColors = true;
			spineLineMat.transparent = true;
			spineLineMat.opacity = 1.0;
			spineLineMat.linewidth = 1.5;
			disposables.push(spineLineMat as unknown as { dispose: () => void });
			fatLineMaterials.push(spineLineMat);
			const spineLine = new LineSegments2(spineGeometry, spineLineMat);
			dnaGroup.add(spineLine);
		}

		// ---- Distance-from-spine bars (Option B) ----
		// Short lines from spine center to each strand, showing how far each deviates
		const distBarCount = data.length * 2; // one bar per strand per point
		const distBarPositions = new Float32Array(distBarCount * 2 * 3);
		const distBarColors = new Float32Array(distBarCount * 2 * 3);
		for (let i = 0; i < data.length; i += 1) {
			const sp = spinePoints[i] || rungMidpoints[i];
			const mkt = marketPoints[i];
			const pcg = precognitionPoints[i];

			// Market bar (red-tinted)
			const mj = i * 2 * 6;
			distBarPositions[mj] = sp.x;
			distBarPositions[mj + 1] = sp.y;
			distBarPositions[mj + 2] = sp.z;
			distBarPositions[mj + 3] = mkt.x;
			distBarPositions[mj + 4] = mkt.y;
			distBarPositions[mj + 5] = mkt.z;
			// Spine end: dim, strand end: brighter
			distBarColors[mj] = 0.3;
			distBarColors[mj + 1] = 0.1;
			distBarColors[mj + 2] = 0.1;
			distBarColors[mj + 3] = 0.7;
			distBarColors[mj + 4] = 0.2;
			distBarColors[mj + 5] = 0.2;

			// Precognition bar (blue-tinted)
			const pj = mj + 6;
			distBarPositions[pj] = sp.x;
			distBarPositions[pj + 1] = sp.y;
			distBarPositions[pj + 2] = sp.z;
			distBarPositions[pj + 3] = pcg.x;
			distBarPositions[pj + 4] = pcg.y;
			distBarPositions[pj + 5] = pcg.z;
			distBarColors[pj] = 0.1;
			distBarColors[pj + 1] = 0.1;
			distBarColors[pj + 2] = 0.3;
			distBarColors[pj + 3] = 0.2;
			distBarColors[pj + 4] = 0.2;
			distBarColors[pj + 5] = 0.7;
		}
		const distBarGeometry = track(new THREE.BufferGeometry());
		distBarGeometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(distBarPositions, 3)),
		);
		distBarGeometry.setAttribute(
			"color",
			track(new THREE.BufferAttribute(distBarColors, 3)),
		);
		const distBars = new THREE.LineSegments(
			distBarGeometry,
			track(
				new THREE.LineBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.28,
				}),
			),
		);
		dnaGroup.add(distBars);

		const pointsGeometry = track(new THREE.SphereGeometry(0.9, 10, 10));
		const marketPointsMesh = new THREE.InstancedMesh(
			pointsGeometry,
			track(
				new THREE.MeshBasicMaterial({
					color: 0xef4444,
					transparent: true,
					opacity: 0.95,
				}),
			),
			data.length,
		);
		const precognitionPointsMesh = new THREE.InstancedMesh(
			pointsGeometry,
			track(
				new THREE.MeshBasicMaterial({
					color: 0x3b82f6,
					transparent: true,
					opacity: 0.98,
				}),
			),
			data.length,
		);
		marketPointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		precognitionPointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const pointMatrix = new THREE.Matrix4();
		for (let i = 0; i < data.length; i += 1) {
			pointMatrix.makeTranslation(
				marketPoints[i].x,
				marketPoints[i].y,
				marketPoints[i].z,
			);
			marketPointsMesh.setMatrixAt(i, pointMatrix);
			pointMatrix.makeTranslation(
				precognitionPoints[i].x,
				precognitionPoints[i].y,
				precognitionPoints[i].z,
			);
			precognitionPointsMesh.setMatrixAt(i, pointMatrix);
		}
		marketPointsMesh.instanceMatrix.needsUpdate = true;
		precognitionPointsMesh.instanceMatrix.needsUpdate = true;
		dnaGroup.add(marketPointsMesh, precognitionPointsMesh);

		const temporalCount = Math.max(0, data.length - 1);
		const marketVectorPositions = new Float32Array(temporalCount * 2 * 3);
		const marketVectorColors = new Float32Array(temporalCount * 2 * 3);
		const precogVectorPositions = new Float32Array(temporalCount * 2 * 3);
		const precogVectorColors = new Float32Array(temporalCount * 2 * 3);

		const vectorHeadGeometry = track(new THREE.ConeGeometry(0.56, 1.6, 10));
		const marketHeads = new THREE.InstancedMesh(
			vectorHeadGeometry,
			track(
				new THREE.MeshBasicMaterial({
					color: 0xef4444,
					transparent: true,
					opacity: 0.9,
				}),
			),
			temporalCount,
		);
		const precogHeads = new THREE.InstancedMesh(
			vectorHeadGeometry,
			track(
				new THREE.MeshBasicMaterial({
					color: 0x3b82f6,
					transparent: true,
					opacity: 0.95,
				}),
			),
			temporalCount,
		);
		marketHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		precogHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const divergencePositions = new Float32Array(data.length * 2 * 3);
		const divergenceColors = new Float32Array(data.length * 2 * 3);
		const divergenceBase = new Float32Array(data.length);
		const divergenceHeadScales = new Float32Array(data.length);
		const divergenceHeads = new THREE.InstancedMesh(
			vectorHeadGeometry,
			track(
				new THREE.MeshBasicMaterial({
					color: 0x22c55e,
					transparent: true,
					opacity: 0.95,
				}),
			),
			data.length,
		);
		divergenceHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		const dir = new THREE.Vector3();
		const headQuat = new THREE.Quaternion();
		const headScale = new THREE.Vector3();
		const headMatrix = new THREE.Matrix4();
		const arrowUp = new THREE.Vector3(0, 1, 0);
		const arrowEnd = new THREE.Vector3();
		const ARROW_SHAFT_RATIO = 0.34;
		const ARROW_HEAD_RATIO = 0.42;

		for (let i = 0; i < temporalCount; i += 1) {
			const marketFrom = marketPoints[i];
			const marketTo = marketPoints[i + 1];
			const marketIndex = i * 6;
			dir.subVectors(marketTo, marketFrom);
			const marketLength = Math.max(1e-4, dir.length());
			dir.normalize();
			arrowEnd.copy(marketFrom).addScaledVector(dir, marketLength * ARROW_SHAFT_RATIO);
			marketVectorPositions[marketIndex] = marketFrom.x;
			marketVectorPositions[marketIndex + 1] = marketFrom.y;
			marketVectorPositions[marketIndex + 2] = marketFrom.z;
			marketVectorPositions[marketIndex + 3] = arrowEnd.x;
			marketVectorPositions[marketIndex + 4] = arrowEnd.y;
			marketVectorPositions[marketIndex + 5] = arrowEnd.z;
			marketVectorColors[marketIndex] = 0.94;
			marketVectorColors[marketIndex + 1] = 0.27;
			marketVectorColors[marketIndex + 2] = 0.27;
			marketVectorColors[marketIndex + 3] = 0.94;
			marketVectorColors[marketIndex + 4] = 0.27;
			marketVectorColors[marketIndex + 5] = 0.27;
			headQuat.setFromUnitVectors(arrowUp, dir);
			headScale.setScalar(0.86);
			headMatrix.compose(
				marketFrom.clone().addScaledVector(dir, marketLength * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			marketHeads.setMatrixAt(i, headMatrix);

			const precogFrom = precognitionPoints[i];
			const precogTo = precognitionPoints[i + 1];
			const precogIndex = i * 6;
			dir.subVectors(precogTo, precogFrom);
			const precogLength = Math.max(1e-4, dir.length());
			dir.normalize();
			arrowEnd.copy(precogFrom).addScaledVector(dir, precogLength * ARROW_SHAFT_RATIO);
			precogVectorPositions[precogIndex] = precogFrom.x;
			precogVectorPositions[precogIndex + 1] = precogFrom.y;
			precogVectorPositions[precogIndex + 2] = precogFrom.z;
			precogVectorPositions[precogIndex + 3] = arrowEnd.x;
			precogVectorPositions[precogIndex + 4] = arrowEnd.y;
			precogVectorPositions[precogIndex + 5] = arrowEnd.z;
			precogVectorColors[precogIndex] = 0.23;
			precogVectorColors[precogIndex + 1] = 0.51;
			precogVectorColors[precogIndex + 2] = 0.96;
			precogVectorColors[precogIndex + 3] = 0.23;
			precogVectorColors[precogIndex + 4] = 0.51;
			precogVectorColors[precogIndex + 5] = 0.96;
			headQuat.setFromUnitVectors(arrowUp, dir);
			headScale.setScalar(0.95);
			headMatrix.compose(
				precogFrom.clone().addScaledVector(dir, precogLength * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			precogHeads.setMatrixAt(i, headMatrix);
		}

		for (let i = 0; i < data.length; i += 1) {
			const from = marketPoints[i];
			const to = precognitionPoints[i];
			const j = i * 6;
			dir.subVectors(to, from);
			const length = Math.max(1e-4, dir.length());
			dir.normalize();
			arrowEnd.copy(from).addScaledVector(dir, length * ARROW_SHAFT_RATIO);

			divergencePositions[j] = from.x;
			divergencePositions[j + 1] = from.y;
			divergencePositions[j + 2] = from.z;
			divergencePositions[j + 3] = arrowEnd.x;
			divergencePositions[j + 4] = arrowEnd.y;
			divergencePositions[j + 5] = arrowEnd.z;

			const base = 0.4 + clamp(data[i].confidence, 0, 1) * 0.52;
			divergenceBase[i] = base;
			divergenceColors[j] = 0.13 * base * 1.6;
			divergenceColors[j + 1] = 0.77 * base * 1.6;
			divergenceColors[j + 2] = 0.37 * base * 1.6;
			divergenceColors[j + 3] = 0.13 * base * 1.6;
			divergenceColors[j + 4] = 0.77 * base * 1.6;
			divergenceColors[j + 5] = 0.37 * base * 1.6;

			const headScaleValue = 0.8 + clamp(data[i].confidence, 0, 1) * 0.38;
			divergenceHeadScales[i] = headScaleValue;
			headQuat.setFromUnitVectors(arrowUp, dir);
			headScale.setScalar(headScaleValue);
			headMatrix.compose(
				from.clone().addScaledVector(dir, length * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			divergenceHeads.setMatrixAt(i, headMatrix);
		}
		marketHeads.instanceMatrix.needsUpdate = true;
		precogHeads.instanceMatrix.needsUpdate = true;
		divergenceHeads.instanceMatrix.needsUpdate = true;

		const marketVectorGeometry = new LineSegmentsGeometry();
		disposables.push(marketVectorGeometry as unknown as { dispose: () => void });
		marketVectorGeometry.setPositions(marketVectorPositions);
		marketVectorGeometry.setColors(marketVectorColors);
		const marketVectorMat = new LineMaterial({
			worldUnits: false,
			resolution: new THREE.Vector2(1, 1),
		});
		marketVectorMat.vertexColors = true;
		marketVectorMat.transparent = true;
		marketVectorMat.opacity = 0.85;
		marketVectorMat.linewidth = 1.5;
		disposables.push(marketVectorMat as unknown as { dispose: () => void });
		fatLineMaterials.push(marketVectorMat);
		const marketVectors = new LineSegments2(marketVectorGeometry, marketVectorMat);

		const precogVectorGeometry = new LineSegmentsGeometry();
		disposables.push(precogVectorGeometry as unknown as { dispose: () => void });
		precogVectorGeometry.setPositions(precogVectorPositions);
		precogVectorGeometry.setColors(precogVectorColors);
		const precogVectorMat = new LineMaterial({
			worldUnits: false,
			resolution: new THREE.Vector2(1, 1),
		});
		precogVectorMat.vertexColors = true;
		precogVectorMat.transparent = true;
		precogVectorMat.opacity = 0.9;
		precogVectorMat.linewidth = 1.5;
		disposables.push(precogVectorMat as unknown as { dispose: () => void });
		fatLineMaterials.push(precogVectorMat);
		const precogVectors = new LineSegments2(precogVectorGeometry, precogVectorMat);

		const divergenceGeometry = track(new THREE.BufferGeometry());
		divergenceGeometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(divergencePositions, 3)),
		);
		divergenceGeometry.setAttribute(
			"color",
			track(new THREE.BufferAttribute(divergenceColors, 3)),
		);
		const divergenceVectors = new THREE.LineSegments(
			divergenceGeometry,
			track(
				new THREE.LineBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.92,
				}),
			),
		);
		dnaGroup.add(
			marketVectors,
			precogVectors,
			divergenceVectors,
			marketHeads,
			precogHeads,
			divergenceHeads,
		);

		const markerGeometry = track(new THREE.SphereGeometry(1.35, 14, 14));
		const markerMaterial = track(
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 1,
			}),
		);
		const marketMarker = new THREE.Mesh(markerGeometry, markerMaterial);
		const precognitionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
		const highlightRung = new THREE.Line(
			track(new THREE.BufferGeometry()),
			track(
				new THREE.LineBasicMaterial({
					color: 0xffffff,
					transparent: true,
					opacity: 1,
				}),
			),
		);
		const highlightRungPositions = new Float32Array(6);
		highlightRung.geometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(highlightRungPositions, 3)),
		);
		dnaGroup.add(marketMarker, precognitionMarker, highlightRung);

		const pointer = { x: 0, y: 0, inside: false };
		const drag = {
			active: false,
			startX: 0,
			startY: 0,
			startYRot: 0,
			startXRot: 0,
		};
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		let yRotTarget = 0.52;
		let xRotTarget = -0.18;
		let yRot = yRotTarget;
		let xRot = xRotTarget;

		let cameraDistance = DNA_CAMERA_MIN_DISTANCE;
		let cameraDistanceTarget = DNA_CAMERA_MIN_DISTANCE;
		let width = 1;
		let height = 1;
		let rafId = 0;
		let mounted = true;
		const projected = new THREE.Vector3();

		dnaGroup.scale.setScalar(0.9);
		dnaGroup.position.y = -1.5;

		const onResize = () => {
			width = Math.max(1, mount.clientWidth);
			height = Math.max(1, mount.clientHeight);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.setSize(width, height, false);
			for (const mat of fatLineMaterials) {
				mat.resolution.set(width, height);
			}
		};

		const refreshConnectorHighlight = (focusIdx: number) => {
			for (let i = 0; i < data.length; i += 1) {
				const j = i * 6;
				const distance = Math.abs(i - focusIdx);
				const falloff = clamp(1 - distance / 6, 0, 1);
				const shade = clamp(divergenceBase[i] + falloff * 0.35, 0, 1);
				divergenceColors[j] = 0.13 * shade * 1.6;
				divergenceColors[j + 1] = 0.77 * shade * 1.6;
				divergenceColors[j + 2] = 0.37 * shade * 1.6;
				divergenceColors[j + 3] = 0.13 * shade * 1.6;
				divergenceColors[j + 4] = 0.77 * shade * 1.6;
				divergenceColors[j + 5] = 0.37 * shade * 1.6;

				headScale.setScalar(divergenceHeadScales[i] + falloff * 0.16);
				dir.subVectors(precognitionPoints[i], marketPoints[i]).normalize();
				headQuat.setFromUnitVectors(arrowUp, dir);
				headMatrix.compose(
					marketPoints[i]
						.clone()
						.addScaledVector(
							dir,
							marketPoints[i].distanceTo(precognitionPoints[i]) * ARROW_HEAD_RATIO,
						),
					headQuat,
					headScale,
				);
				divergenceHeads.setMatrixAt(i, headMatrix);
			}
			divergenceGeometry.attributes.color.needsUpdate = true;
			divergenceHeads.instanceMatrix.needsUpdate = true;
		};

		const getPointerLocal = (event: PointerEvent) => {
			const rect = mount.getBoundingClientRect();
			return {
				x: clamp(event.clientX - rect.left, 0, rect.width),
				y: clamp(event.clientY - rect.top, 0, rect.height),
			};
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0) return;
			const next = getPointerLocal(event);
			pointer.x = next.x;
			pointer.y = next.y;
			drag.active = true;
			drag.startX = event.clientX;
			drag.startY = event.clientY;
			drag.startYRot = yRotTarget;
			drag.startXRot = xRotTarget;
			mount.setPointerCapture(event.pointerId);
			pointer.inside = true;
		};

		const onPointerMove = (event: PointerEvent) => {
			const next = getPointerLocal(event);
			pointer.x = next.x;
			pointer.y = next.y;
			pointer.inside = true;

			if (!drag.active) return;

			const dx = event.clientX - drag.startX;
			const dy = event.clientY - drag.startY;
			yRotTarget = drag.startYRot + dx * 0.0068;
			xRotTarget = clamp(drag.startXRot + dy * 0.0048, -0.58, 0.58);
		};

		const onPointerUp = (event: PointerEvent) => {
			if (!drag.active) return;
			drag.active = false;
			try {
				mount.releasePointerCapture(event.pointerId);
			} catch {
				// no-op
			}
		};

		const onPointerLeave = () => {
			pointer.inside = false;
			if (hoverIndexRef.current !== -1) {
				hoverIndexRef.current = -1;
				setHoverIndex(null);
			}
		};

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			cameraDistanceTarget = clamp(
				cameraDistanceTarget + event.deltaY * 0.05,
				DNA_CAMERA_MIN_DISTANCE,
				DNA_CAMERA_MAX_DISTANCE,
			);
			setZoomPct(Math.round((DNA_CAMERA_BASE_DISTANCE / cameraDistanceTarget) * 100));
		};

		const resizeObserver = new ResizeObserver(onResize);
		resizeObserver.observe(mount);
		onResize();
		window.addEventListener("resize", onResize);
		mount.addEventListener("pointerdown", onPointerDown);
		mount.addEventListener("pointermove", onPointerMove);
		mount.addEventListener("pointerup", onPointerUp);
		mount.addEventListener("pointerleave", onPointerLeave);
		mount.addEventListener("wheel", onWheel, { passive: false });

		const clock = new THREE.Clock();
		const animate = () => {
			if (!mounted) return;
			rafId = window.requestAnimationFrame(animate);
			const t = clock.getElapsedTime();
			const lerp = reduceMotion ? 1 : 0.1;

			yRot += (yRotTarget - yRot) * lerp;
			xRot += (xRotTarget - xRot) * lerp;
			cameraDistance += (cameraDistanceTarget - cameraDistance) * (reduceMotion ? 1 : 0.09);
			camera.position.z = cameraDistance;

			dnaGroup.rotation.y = yRot;
			dnaGroup.rotation.x = xRot;

			if (pointer.inside) {
				let bestIdx = -1;
				let bestDistSq = Number.POSITIVE_INFINITY;
				let bestX = 0;
				let bestY = 0;
				for (let i = 0; i < rungMidpoints.length; i += 1) {
					projected
						.copy(rungMidpoints[i])
						.applyMatrix4(dnaGroup.matrixWorld)
						.project(camera);
					if (projected.z < -1 || projected.z > 1) continue;
					const sx = (projected.x * 0.5 + 0.5) * width;
					const sy = (-projected.y * 0.5 + 0.5) * height;
					const dx = sx - pointer.x;
					const dy = sy - pointer.y;
					const distSq = dx * dx + dy * dy;
					if (distSq < bestDistSq) {
						bestDistSq = distSq;
						bestIdx = i;
						bestX = sx;
						bestY = sy;
					}
				}

				if (bestIdx !== -1 && bestDistSq <= 42 * 42) {
					if (hoverIndexRef.current !== bestIdx) {
						hoverIndexRef.current = bestIdx;
						setHoverIndex(bestIdx);
					}
					tooltip.style.opacity = "1";
					tooltip.style.transform = `translate(${bestX + 12}px, ${bestY - 14}px)`;
				} else {
					if (hoverIndexRef.current !== -1) {
						hoverIndexRef.current = -1;
						setHoverIndex(null);
					}
					tooltip.style.opacity = "0";
				}
			} else {
				tooltip.style.opacity = "0";
			}

			const focusIndex =
				hoverIndexRef.current !== -1 ? hoverIndexRef.current : data.length - 1;
			const confidence = clamp(data[focusIndex].confidence, 0, 1);
			const from = marketPoints[focusIndex];
			const to = precognitionPoints[focusIndex];
			const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 5.2) * 0.07;
			refreshConnectorHighlight(focusIndex);

			highlightRungPositions[0] = from.x;
			highlightRungPositions[1] = from.y;
			highlightRungPositions[2] = from.z;
			highlightRungPositions[3] = to.x;
			highlightRungPositions[4] = to.y;
			highlightRungPositions[5] = to.z;
			highlightRung.geometry.attributes.position.needsUpdate = true;

			const markerScale = (0.88 + confidence * 0.45) * pulse;
			marketMarker.position.copy(from);
			precognitionMarker.position.copy(to);
			marketMarker.scale.setScalar(markerScale);
			precognitionMarker.scale.setScalar(markerScale);

			renderer.render(scene, camera);
		};
		animate();

		return () => {
			mounted = false;
			window.cancelAnimationFrame(rafId);
			window.removeEventListener("resize", onResize);
			mount.removeEventListener("pointerdown", onPointerDown);
			mount.removeEventListener("pointermove", onPointerMove);
			mount.removeEventListener("pointerup", onPointerUp);
			mount.removeEventListener("pointerleave", onPointerLeave);
			mount.removeEventListener("wheel", onWheel);
			resizeObserver.disconnect();
			disposables.forEach((resource) => resource.dispose());
			renderer.dispose();
			if (renderer.domElement.parentNode === mount) {
				mount.removeChild(renderer.domElement);
			}
		};
	}, [data, yDomain]);

	const fallbackIndex = data.length - 1;
	const activeIndex = hoverIndex ?? fallbackIndex;
	const active = data[activeIndex];
	const sourceLabel =
		source === "embedding" ? "Embedded" : source === "mock" ? "Mock" : "Local";

	return (
		<div className="relative h-[24rem] w-full overflow-hidden border-2 border-foreground/70 bg-background">
			<div ref={mountRef} className="h-full w-full" />
			<div className="pointer-events-none absolute inset-[6px] border border-foreground/18" />
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(circle at 50% 50%, rgba(10,10,10,0) 46%, rgba(10,10,10,0.42) 100%)",
				}}
			/>

			<div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-4">
				<div className="border border-foreground/45 bg-background/82 px-2 py-1 text-[11px] uppercase tracking-[0.08em]">
					"DNA PCA"· {sourceLabel}
				</div>
				<div className="border border-foreground/45 bg-background/82 px-2 py-1 font-mono text-[11px]">
					Zoom {zoomPct}%
				</div>
			</div>

			<div className="pointer-events-none absolute left-3 top-12 border border-foreground/45 bg-background/82 px-2 py-1.5 font-mono text-[11px] leading-5">
				<div>Market: {active.market.toFixed(1)}%</div>
				<div>Precognition: {active.precognition.toFixed(1)}%</div>
				<div>
					Divergence: {active.divergence > 0 ? "+" : ""}
					{active.divergence.toFixed(1)}%
				</div>
				<div>Confidence: {(active.confidence * 100).toFixed(0)}%</div>
			</div>

			<div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
				<span>{data[0]?.time}</span>
				<span>{hoverIndex === null ? "Latest Focus" : "Hover Focus"}</span>
				<span>{data[data.length - 1]?.time}</span>
			</div>

			<div className="pointer-events-none absolute bottom-8 right-3 border border-foreground/40 bg-background/82 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]">
				Drag: orbit | Wheel: zoom | Hover: inspect
			</div>

			<div
				ref={tooltipRef}
				className="pointer-events-none absolute z-20 border border-foreground/55 bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground opacity-0 transition-opacity"
				style={{ left: 0, top: 0 }}
			>
				<div className="text-white">{active.time}</div>
				<div>Market {active.market.toFixed(1)}%</div>
				<div>Precognition {active.precognition.toFixed(1)}%</div>
				<div>
					Divergence {active.divergence > 0 ? "+" : ""}
					{active.divergence.toFixed(1)}%
				</div>
				<div>Confidence {(active.confidence * 100).toFixed(0)}%</div>
			</div>
		</div>
	);
}

export function ProbabilityChart({ marketId, timeSeries, compact = false }: ProbabilityChartProps) {
	const [useFullScale, setUseFullScale] = useState(false);
	const [visualizationMode, setVisualizationMode] =
		useState<VisualizationMode>("dna");
	const [embeddedData, setEmbeddedData] = useState<DnaPoint[] | null>(null);
	const [embeddingFailed, setEmbeddingFailed] = useState(false);
	const [showLatticeHelp, setShowLatticeHelp] = useState(false);
	const [showHelixHelp, setShowHelixHelp] = useState(false);
	const isMock = timeSeries.length < 2;

	useEffect(() => {
		let isCancelled = false;
		if (isMock) return () => undefined;

		const load = async () => {
			try {
				const result = await fetchProbabilityEmbedding(marketId, {
					historyPoints: clamp(Math.max(timeSeries.length, 80), 10, 300),
					window: 5,
				});
				if (isCancelled) return;
				if (!result.points || result.points.length < 2) {
					console.log("[ProbabilityChart] embedding returned insufficient points:", result.points?.length ?? 0);
					setEmbeddingFailed(true);
					setEmbeddedData(null);
					return;
				}
				console.log("[ProbabilityChart] embedding points.length =", result.points.length);
				setEmbeddedData(
					result.points.map((point) => ({
						time: format(new Date(point.snapshot_time), "MMM d HH:mm"),
						market: point.market_prob * 100,
						precognition: point.precognition_prob * 100,
						divergence: point.divergence * 100,
						confidence: clamp(point.confidence, 0, 1),
						embedX: point.x,
						embedY: point.y,
						embedZ: point.z,
					})),
				);
				setEmbeddingFailed(false);
			} catch {
				if (!isCancelled) {
					setEmbeddingFailed(true);
					setEmbeddedData(null);
				}
			}
		};

		void load();
		return () => {
			isCancelled = true;
		};
	}, [isMock, marketId, timeSeries.length]);

	const chartData = useMemo<DnaPoint[]>(() => {
		if (embeddedData && embeddedData.length > 1) {
			console.log("[ProbabilityChart] chartData source=embedding, length =", embeddedData.length);
			return embeddedData;
		}
		if (isMock) {
			console.log("[ProbabilityChart] chartData source=mock (timeSeries.length < 2)");
			return generateMockDnaData(80);
		}
		console.log("[ProbabilityChart] chartData source=timeseries, length =", timeSeries.length);
		return timeSeries.map((point) => ({
			time: format(new Date(point.snapshot_time), "MMM d HH:mm"),
			market: point.market_prob * 100,
			precognition: point.precognition_prob * 100,
			divergence: (point.precognition_prob - point.market_prob) * 100,
			confidence: clamp(point.confidence, 0, 1),
		}));
	}, [embeddedData, isMock, timeSeries]);

	const zoomDomain = useMemo<[number, number]>(() => {
		if (!chartData.length) return [0, 100];

		const values = chartData.flatMap((point) => [point.market, point.precognition]);
		const minVal = Math.min(...values);
		const maxVal = Math.max(...values);
		const spread = maxVal - minVal;
		if (spread >= 70) return [0, 100];

		const minVisibleSpread = 5;
		const paddedSpread = Math.max(spread * 1.65, minVisibleSpread);
		const center = (minVal + maxVal) / 2;

		let domainMin = center - paddedSpread / 2;
		let domainMax = center + paddedSpread / 2;

		if (domainMin < 0) {
			domainMax -= domainMin;
			domainMin = 0;
		}
		if (domainMax > 100) {
			domainMin -= domainMax - 100;
			domainMax = 100;
		}

		domainMin = clamp(domainMin, 0, 100);
		domainMax = clamp(domainMax, 0, 100);
		if (domainMax - domainMin < minVisibleSpread) {
			const middle = (domainMin + domainMax) / 2;
			domainMin = clamp(middle - minVisibleSpread / 2, 0, 100);
			domainMax = clamp(middle + minVisibleSpread / 2, 0, 100);
		}

		return [domainMin, domainMax];
	}, [chartData]);

	const yDomain: [number, number] = useFullScale ? [0, 100] : zoomDomain;
	const sceneSource: "embedding" | "timeseries" | "mock" = embeddedData
		? "embedding"
		: isMock
			? "mock"
			: "timeseries";

	return (
		<Card header>
			{!compact && (
				<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
					<CardTitle className="card-header-title">
						<SiGraphite /> Probability Over Time
					</CardTitle>
				</div>
			)}
			<CardContent className="p-4">
				{!compact && (
					<div className="mb-3 flex flex-wrap items-end justify-between gap-3">
						<div className="inline-flex border-2 border-foreground p-0.5">
							<button
								type="button"
								onClick={() => setVisualizationMode("dna")}
								className={`px-3 py-1 text-xs font-mono uppercase tracking-[0.07em] transition-colors ${visualizationMode === "dna"
									? "bg-foreground text-background"
									: "bg-background text-foreground hover:bg-foreground hover:text-background"
									}`}
							>
								Probability Helix
							</button>
							<button
								type="button"
								onClick={() => setVisualizationMode("lattice")}
								className={`px-3 py-1 text-xs font-mono uppercase tracking-[0.07em] transition-colors ${visualizationMode === "lattice"
									? "bg-foreground text-background"
									: "bg-background text-foreground hover:bg-foreground hover:text-background"
									}`}
							>
								3D Lattice
							</button>
						</div>
						<div className="flex items-center gap-2">
							<div className="inline-flex border-2 border-foreground p-0.5">
								<button
									type="button"
									onClick={() => setUseFullScale(false)}
									className={`px-3 py-1 text-xs font-mono transition-colors ${!useFullScale
										? "bg-foreground text-background"
										: "bg-background text-foreground hover:bg-foreground hover:text-background"
										}`}
								>
									DATA
								</button>
								<button
									type="button"
									onClick={() => setUseFullScale(true)}
									className={`px-3 py-1 text-xs font-mono transition-colors ${useFullScale
										? "bg-foreground text-background"
										: "bg-background text-foreground hover:bg-foreground hover:text-background"
										}`}
								>
									0-100%
								</button>
							</div>
							{visualizationMode === "dna" && (
								<div className="relative">
									<button
										type="button"
										onClick={() => setShowHelixHelp((v) => !v)}
										className={`flex h-[30px] w-[30px] items-center justify-center border-2 border-foreground text-sm font-bold transition-colors ${showHelixHelp
											? "bg-foreground text-background"
											: "bg-background text-foreground hover:bg-foreground hover:text-background"
											}`}
									>
										?
									</button>
									{showHelixHelp && (
										<div className="absolute right-0 top-10 z-30 w-72 border-2 border-foreground bg-background p-3 text-xs leading-relaxed">
											<div className="mb-2 font-bold uppercase tracking-[0.08em]">
												Reading the Probability Helix
											</div>
											<div className="space-y-1.5">
												<p>
													Two strands twist around a curved spine. The spine&apos;s
													shape is driven by PCA.
												</p>
												<div className="my-2 border-t border-foreground/20 pt-2">
													<p>
														<span className="text-blue-500">&bull;</span> Blue =
														Precognition (smart money)
													</p>
													<p>
														<span className="text-red-500">&bull;</span> Red =
														Market consensus price
													</p>
													<p>
														<span className="text-green-500">&bull;</span> Green =
														Divergence connectors (brighter = higher confidence)
													</p>
												</div>
												<p>
													<strong>Strand gap</strong> = divergence. Strands
													pulling apart means smart money and the market disagree.
												</p>
												<div className="my-2 border-t border-foreground/20 pt-2 font-bold uppercase tracking-[0.07em]">
													The PCA spine
												</div>
												<p>
													The backbone is computed from 14 market features: price
													levels, momentum, rolling trends, divergence velocity,
													and confidence. PCA compresses these into 3 principal
													directions.
												</p>
												<p>
													A <strong>straight spine</strong> = stable regime. A{" "}
													<strong>bending spine</strong> = shifting dynamics
													&mdash; momentum changed, divergence accelerated, or
													confidence spiked.
												</p>
												<p className="text-muted">
													The spine shape tells you <em>how</em> the market is
													evolving; the strand gap tells you <em>how much</em>{" "}
													disagreement exists.
												</p>
											</div>
											<button
												type="button"
												onClick={() => setShowHelixHelp(false)}
												className="mt-2 w-full border border-foreground py-1 text-center text-xs uppercase tracking-[0.06em] transition-colors hover:bg-foreground hover:text-background"
											>
												Got it
											</button>
										</div>
									)}
								</div>
							)}
							{visualizationMode === "lattice" && (
								<div className="relative">
									<button
										type="button"
										onClick={() => setShowLatticeHelp((v) => !v)}
										className={`flex h-[30px] w-[30px] items-center justify-center border-2 border-foreground text-sm font-bold transition-colors ${showLatticeHelp
											? "bg-foreground text-background"
											: "bg-background text-foreground hover:bg-foreground hover:text-background"
											}`}
									>
										?
									</button>
									{showLatticeHelp && (
										<div className="absolute right-0 top-10 z-30 w-72 border-2 border-foreground bg-background p-3 text-xs leading-relaxed">
											<div className="mb-2 font-bold uppercase tracking-[0.08em]">
												Reading the 3D Lattice
											</div>
											<div className="space-y-1.5">
												<p>
													<strong>X-axis</strong> (left &rarr; right) = Time
												</p>
												<p>
													<strong>Y-axis</strong> (up / down) = Probability
												</p>
												<p>
													<strong>Z-axis</strong> (depth) = Divergence
												</p>
												<div className="my-2 border-t border-foreground/20 pt-2">
													<p>
														<span className="text-red-500">&bull;</span> Red =
														Market price
													</p>
													<p>
														<span className="text-blue-500">&bull;</span> Blue =
														Precognition (smart money)
													</p>
													<p>
														<span className="text-green-500">&bull;</span> Green =
														Divergence (brighter = higher confidence)
													</p>
												</div>
												<p>
													Strands <strong>spreading apart vertically</strong> means
													growing divergence &mdash; a potential signal.
												</p>
												<p>
													Both strands <strong>shifting toward you</strong> in depth
													means precognition is more bullish than the market.
												</p>
											</div>
											<button
												type="button"
												onClick={() => setShowLatticeHelp(false)}
												className="mt-2 w-full border border-foreground py-1 text-center text-xs uppercase tracking-[0.06em] transition-colors hover:bg-foreground hover:text-background"
											>
												Got it
											</button>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				)}

				{!compact && (
					<div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.08em]">
						<div className="flex items-center gap-1.5">
							<span
								className="h-2 w-2 rounded-full bg-blue-500"
							/>
							Precognition Vectors
						</div>
						<div className="flex items-center gap-1.5">
							<span
								className="h-2 w-2 rounded-full bg-red-500"
							/>
							Market Vectors
						</div>
						<div className="flex items-center gap-1.5">
							<span
								className="h-[2px] w-4 bg-green-500"
							/>
							Divergence Vectors
						</div>
					</div>
				)}

				{embeddingFailed && !isMock && (
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
						Embedding endpoint unavailable, using local fallback.
					</div>
				)}

				{compact || visualizationMode === "dna" ? (
					<ProbabilityDnaScene data={chartData} yDomain={yDomain} source={sceneSource} />
				) : (
					<ProbabilityLatticeScene
						data={chartData}
						yDomain={yDomain}
						source={sceneSource}
					/>
				)}
			</CardContent>
		</Card>
	);
}
