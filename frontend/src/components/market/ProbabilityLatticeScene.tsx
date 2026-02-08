"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface ProbabilityPoint {
	time: string;
	market: number;
	precognition: number;
	divergence: number;
	confidence: number;
}

interface ProbabilityLatticeSceneProps {
	data: ProbabilityPoint[];
	yDomain: [number, number];
	source: "embedding" | "timeseries" | "mock";
}

function clamp(value: number, lower: number, upper: number): number {
	return Math.max(lower, Math.min(upper, value));
}

export function ProbabilityLatticeScene({
	data,
	yDomain,
	source,
}: ProbabilityLatticeSceneProps) {
	const mountRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [zoomPct, setZoomPct] = useState(100);
	const hoverIndexRef = useRef(-1);

	useEffect(() => {
		const mount = mountRef.current;
		const tooltip = tooltipRef.current;
		if (!mount || !tooltip || data.length < 2) return;

		hoverIndexRef.current = -1;

		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2(0x000000, 0.006);

		const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
		camera.position.set(0, 2, 156);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.12;
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

		const group = new THREE.Group();
		scene.add(group);

		const ambient = new THREE.AmbientLight(0xffffff, 0.75);
		const key = new THREE.DirectionalLight(0xffffff, 0.62);
		key.position.set(1.2, 2.2, 2.8);
		const fill = new THREE.DirectionalLight(0xffffff, 0.34);
		fill.position.set(-1.8, -1.5, -1.4);
		scene.add(ambient, key, fill);

		const [domainMin, domainMax] = yDomain;
		const domainSpan = Math.max(1e-4, domainMax - domainMin);
		const xSpan = 116;
		const ySpan = 58;

		const marketPoints: Array<InstanceType<typeof THREE.Vector3>> = [];
		const precognitionPoints: Array<InstanceType<typeof THREE.Vector3>> = [];
		const midpointPoints: Array<InstanceType<typeof THREE.Vector3>> = [];

		for (let i = 0; i < data.length; i += 1) {
			const point = data[i];
			const t = data.length > 1 ? i / (data.length - 1) : 0.5;
			const x = (t - 0.5) * xSpan;
			const marketY = ((point.market - domainMin) / domainSpan - 0.5) * ySpan;
			const precognitionY =
				((point.precognition - domainMin) / domainSpan - 0.5) * ySpan;
			const midZ = clamp(point.divergence * 0.44, -20, 20);

			const marketPos = new THREE.Vector3(x, marketY, midZ - 9);
			const precognitionPos = new THREE.Vector3(x, precognitionY, midZ + 9);
			const midpoint = new THREE.Vector3()
				.addVectors(marketPos, precognitionPos)
				.multiplyScalar(0.5);

			marketPoints.push(marketPos);
			precognitionPoints.push(precognitionPos);
			midpointPoints.push(midpoint);
		}

		const gridPositions: number[] = [];
		for (let i = 0; i <= 6; i += 1) {
			const y = -ySpan / 2 + (ySpan / 6) * i;
			gridPositions.push(-xSpan / 2, y, 0, xSpan / 2, y, 0);
		}
		for (let i = 0; i <= 8; i += 1) {
			const x = -xSpan / 2 + (xSpan / 8) * i;
			gridPositions.push(x, -ySpan / 2, 0, x, ySpan / 2, 0);
		}
		const gridGeometry = track(new THREE.BufferGeometry());
		gridGeometry.setAttribute(
			"position",
			track(new THREE.Float32BufferAttribute(gridPositions, 3)),
		);
		const grid = new THREE.LineSegments(
			gridGeometry,
			track(
				new THREE.LineBasicMaterial({
					color: 0x7d7d7d,
					transparent: true,
					opacity: 0.3,
				}),
			),
		);
		group.add(grid);

		// Axis lines
		const axisExt = 6;
		const xAxisGeo = track(new THREE.BufferGeometry());
		xAxisGeo.setAttribute(
			"position",
			track(
				new THREE.Float32BufferAttribute(
					[-xSpan / 2, -ySpan / 2, 0, xSpan / 2 + axisExt, -ySpan / 2, 0],
					3,
				),
			),
		);
		group.add(
			new THREE.Line(
				xAxisGeo,
				track(new THREE.LineBasicMaterial({ color: 0xededed, transparent: true, opacity: 0.7 })),
			),
		);

		const yAxisGeo = track(new THREE.BufferGeometry());
		yAxisGeo.setAttribute(
			"position",
			track(
				new THREE.Float32BufferAttribute(
					[-xSpan / 2, -ySpan / 2, 0, -xSpan / 2, ySpan / 2 + axisExt, 0],
					3,
				),
			),
		);
		group.add(
			new THREE.Line(
				yAxisGeo,
				track(new THREE.LineBasicMaterial({ color: 0xededed, transparent: true, opacity: 0.7 })),
			),
		);

		const zAxisGeo = track(new THREE.BufferGeometry());
		zAxisGeo.setAttribute(
			"position",
			track(
				new THREE.Float32BufferAttribute(
					[-xSpan / 2, -ySpan / 2, -22, -xSpan / 2, -ySpan / 2, 24],
					3,
				),
			),
		);
		group.add(
			new THREE.Line(
				zAxisGeo,
				track(new THREE.LineBasicMaterial({ color: 0xededed, transparent: true, opacity: 0.7 })),
			),
		);

		// Axis label sprites
		const makeLabel = (text: string) => {
			const canvas = document.createElement("canvas");
			canvas.width = 256;
			canvas.height = 64;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.font = "bold 22px monospace";
				ctx.fillStyle = "#ededed";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(text, 128, 32);
			}
			const tex = track(new THREE.CanvasTexture(canvas));
			const mat = track(
				new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
			);
			const sprite = new THREE.Sprite(mat);
			sprite.scale.set(18, 4.5, 1);
			return sprite;
		};

		const xLabel = makeLabel("TIME \u2192");
		xLabel.position.set(xSpan / 2 + 14, -ySpan / 2 - 1, 0);
		group.add(xLabel);

		const yLabel = makeLabel("\u2191 PROBABILITY");
		yLabel.position.set(-xSpan / 2 + 10, ySpan / 2 + 8, 0);
		group.add(yLabel);

		const zLabel = makeLabel("DIVERGENCE \u2197");
		zLabel.position.set(-xSpan / 2 + 10, -ySpan / 2 - 1, 28);
		group.add(zLabel);

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
		group.add(marketPointsMesh, precognitionPointsMesh);

		const temporalCount = Math.max(0, data.length - 1);
		const marketVectorPositions = new Float32Array(temporalCount * 2 * 3);
		const marketVectorColors = new Float32Array(temporalCount * 2 * 3);
		const precogVectorPositions = new Float32Array(temporalCount * 2 * 3);
		const precogVectorColors = new Float32Array(temporalCount * 2 * 3);

		const vectorHeadGeometry = track(new THREE.ConeGeometry(0.56, 1.55, 10));
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

		const direction = new THREE.Vector3();
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
			direction.subVectors(marketTo, marketFrom);
			const marketLength = Math.max(1e-4, direction.length());
			direction.normalize();
			arrowEnd.copy(marketFrom).addScaledVector(direction, marketLength * ARROW_SHAFT_RATIO);
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
			headQuat.setFromUnitVectors(arrowUp, direction);
			headScale.setScalar(0.86);
			headMatrix.compose(
				marketFrom.clone().addScaledVector(direction, marketLength * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			marketHeads.setMatrixAt(i, headMatrix);

			const precogFrom = precognitionPoints[i];
			const precogTo = precognitionPoints[i + 1];
			const precogIndex = i * 6;
			direction.subVectors(precogTo, precogFrom);
			const precogLength = Math.max(1e-4, direction.length());
			direction.normalize();
			arrowEnd.copy(precogFrom).addScaledVector(direction, precogLength * ARROW_SHAFT_RATIO);
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
			headQuat.setFromUnitVectors(arrowUp, direction);
			headScale.setScalar(0.94);
			headMatrix.compose(
				precogFrom.clone().addScaledVector(direction, precogLength * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			precogHeads.setMatrixAt(i, headMatrix);
		}

		for (let i = 0; i < data.length; i += 1) {
			const a = marketPoints[i];
			const b = precognitionPoints[i];
			const j = i * 6;
			direction.subVectors(b, a);
			const length = Math.max(1e-4, direction.length());
			direction.normalize();
			arrowEnd.copy(a).addScaledVector(direction, length * ARROW_SHAFT_RATIO);

			divergencePositions[j] = a.x;
			divergencePositions[j + 1] = a.y;
			divergencePositions[j + 2] = a.z;
			divergencePositions[j + 3] = arrowEnd.x;
			divergencePositions[j + 4] = arrowEnd.y;
			divergencePositions[j + 5] = arrowEnd.z;

			const base = 0.34 + clamp(data[i].confidence, 0, 1) * 0.52;
			divergenceBase[i] = base;
			divergenceColors[j] = 0.13 * base * 1.6;
			divergenceColors[j + 1] = 0.77 * base * 1.6;
			divergenceColors[j + 2] = 0.37 * base * 1.6;
			divergenceColors[j + 3] = 0.13 * base * 1.6;
			divergenceColors[j + 4] = 0.77 * base * 1.6;
			divergenceColors[j + 5] = 0.37 * base * 1.6;

			const headScaleValue = 0.78 + clamp(data[i].confidence, 0, 1) * 0.35;
			divergenceHeadScales[i] = headScaleValue;
			headQuat.setFromUnitVectors(arrowUp, direction);
			headScale.setScalar(headScaleValue);
			headMatrix.compose(
				a.clone().addScaledVector(direction, length * ARROW_HEAD_RATIO),
				headQuat,
				headScale,
			);
			divergenceHeads.setMatrixAt(i, headMatrix);
		}
		marketHeads.instanceMatrix.needsUpdate = true;
		precogHeads.instanceMatrix.needsUpdate = true;
		divergenceHeads.instanceMatrix.needsUpdate = true;

		const marketVectorGeometry = track(new THREE.BufferGeometry());
		marketVectorGeometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(marketVectorPositions, 3)),
		);
		marketVectorGeometry.setAttribute(
			"color",
			track(new THREE.BufferAttribute(marketVectorColors, 3)),
		);
		const marketVectors = new THREE.LineSegments(
			marketVectorGeometry,
			track(
				new THREE.LineBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.84,
				}),
			),
		);

		const precogVectorGeometry = track(new THREE.BufferGeometry());
		precogVectorGeometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(precogVectorPositions, 3)),
		);
		precogVectorGeometry.setAttribute(
			"color",
			track(new THREE.BufferAttribute(precogVectorColors, 3)),
		);
		const precogVectors = new THREE.LineSegments(
			precogVectorGeometry,
			track(
				new THREE.LineBasicMaterial({
					vertexColors: true,
					transparent: true,
					opacity: 0.9,
				}),
			),
		);

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
					opacity: 0.9,
				}),
			),
		);
		group.add(
			marketVectors,
			precogVectors,
			divergenceVectors,
			marketHeads,
			precogHeads,
			divergenceHeads,
		);

		const markerGeometry = track(new THREE.SphereGeometry(1.24, 12, 12));
		const markerMaterial = track(
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 1,
			}),
		);
		const marketMarker = new THREE.Mesh(markerGeometry, markerMaterial);
		const precognitionMarker = new THREE.Mesh(markerGeometry, markerMaterial);
		const rungMarker = new THREE.Line(
			track(new THREE.BufferGeometry()),
			track(
				new THREE.LineBasicMaterial({
					color: 0xffffff,
					transparent: true,
					opacity: 1,
				}),
			),
		);
		const rungMarkerPositions = new Float32Array(6);
		rungMarker.geometry.setAttribute(
			"position",
			track(new THREE.BufferAttribute(rungMarkerPositions, 3)),
		);
		group.add(marketMarker, precognitionMarker, rungMarker);

		const pointer = { x: 0, y: 0, inside: false };
		const drag = {
			active: false,
			startX: 0,
			startY: 0,
			startRotY: 0,
			startRotX: 0,
		};
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let rotYTarget = 0.24;
		let rotXTarget = -0.2;
		let rotY = rotYTarget;
		let rotX = rotXTarget;
		let camDistance = 156;
		let camDistanceTarget = 156;
		let width = 1;
		let height = 1;
		let rafId = 0;
		let mounted = true;
		const projected = new THREE.Vector3();

		group.scale.setScalar(0.9);
		group.position.y = -1.4;

		const refreshConnectorHighlight = (focusIdx: number) => {
			for (let i = 0; i < data.length; i += 1) {
				const j = i * 6;
				const dist = Math.abs(i - focusIdx);
				const falloff = clamp(1 - dist / 6, 0, 1);
				const shade = clamp(divergenceBase[i] + falloff * 0.36, 0, 1);
				divergenceColors[j] = 0.13 * shade * 1.6;
				divergenceColors[j + 1] = 0.77 * shade * 1.6;
				divergenceColors[j + 2] = 0.37 * shade * 1.6;
				divergenceColors[j + 3] = 0.13 * shade * 1.6;
				divergenceColors[j + 4] = 0.77 * shade * 1.6;
				divergenceColors[j + 5] = 0.37 * shade * 1.6;

				headScale.setScalar(divergenceHeadScales[i] + falloff * 0.18);
				direction.subVectors(precognitionPoints[i], marketPoints[i]).normalize();
				headQuat.setFromUnitVectors(arrowUp, direction);
				headMatrix.compose(
					marketPoints[i]
						.clone()
						.addScaledVector(
							direction,
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

		const onResize = () => {
			width = Math.max(1, mount.clientWidth);
			height = Math.max(1, mount.clientHeight);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.setSize(width, height, false);
		};

		const getLocal = (event: PointerEvent) => {
			const rect = mount.getBoundingClientRect();
			return {
				x: clamp(event.clientX - rect.left, 0, rect.width),
				y: clamp(event.clientY - rect.top, 0, rect.height),
			};
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0) return;
			const local = getLocal(event);
			pointer.x = local.x;
			pointer.y = local.y;
			pointer.inside = true;
			drag.active = true;
			drag.startX = event.clientX;
			drag.startY = event.clientY;
			drag.startRotY = rotYTarget;
			drag.startRotX = rotXTarget;
			mount.setPointerCapture(event.pointerId);
		};

		const onPointerMove = (event: PointerEvent) => {
			const local = getLocal(event);
			pointer.x = local.x;
			pointer.y = local.y;
			pointer.inside = true;
			if (!drag.active) return;
			const dx = event.clientX - drag.startX;
			const dy = event.clientY - drag.startY;
			rotYTarget = drag.startRotY + dx * 0.0064;
			rotXTarget = clamp(drag.startRotX + dy * 0.0045, -0.56, 0.56);
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
			camDistanceTarget = clamp(camDistanceTarget + event.deltaY * 0.055, 108, 235);
			setZoomPct(Math.round((156 / camDistanceTarget) * 100));
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

			rotY += (rotYTarget - rotY) * lerp;
			rotX += (rotXTarget - rotX) * lerp;
			camDistance += (camDistanceTarget - camDistance) * (reduceMotion ? 1 : 0.09);
			camera.position.z = camDistance;

			group.rotation.y = rotY;
			group.rotation.x = rotX;

			if (pointer.inside) {
				let bestIdx = -1;
				let bestDistSq = Number.POSITIVE_INFINITY;
				let bestX = 0;
				let bestY = 0;

				for (let i = 0; i < midpointPoints.length; i += 1) {
					projected
						.copy(midpointPoints[i])
						.applyMatrix4(group.matrixWorld)
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

			const focusIdx =
				hoverIndexRef.current !== -1 ? hoverIndexRef.current : data.length - 1;
			const confidence = clamp(data[focusIdx].confidence, 0, 1);
			const from = marketPoints[focusIdx];
			const to = precognitionPoints[focusIdx];
			refreshConnectorHighlight(focusIdx);

			const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 4.4) * 0.08;
			marketMarker.position.copy(from);
			precognitionMarker.position.copy(to);
			marketMarker.scale.setScalar((0.92 + confidence * 0.45) * pulse);
			precognitionMarker.scale.setScalar((0.98 + confidence * 0.5) * pulse);

			rungMarkerPositions[0] = from.x;
			rungMarkerPositions[1] = from.y;
			rungMarkerPositions[2] = from.z;
			rungMarkerPositions[3] = to.x;
			rungMarkerPositions[4] = to.y;
			rungMarkerPositions[5] = to.z;
			rungMarker.geometry.attributes.position.needsUpdate = true;

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
					3D Probability Lattice · {sourceLabel}
				</div>
				<div className="border border-foreground/45 bg-background/82 px-2 py-1 font-mono text-[11px] text-muted">
					Zoom {zoomPct}%
				</div>
			</div>

			<div className="pointer-events-none absolute left-3 top-12 border border-foreground/45 bg-background/82 px-2 py-1.5 font-mono text-[11px] leading-5">
				<div className="text-muted">Market: {active.market.toFixed(1)}%</div>
				<div className="text-foreground">
					Precognition: {active.precognition.toFixed(1)}%
				</div>
				<div className="text-muted">
					Divergence: {active.divergence > 0 ? "+" : ""}
					{active.divergence.toFixed(1)}%
				</div>
				<div className="text-muted">
					Confidence: {(active.confidence * 100).toFixed(0)}%
				</div>
			</div>

			<div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
				<span>{data[0]?.time}</span>
				<span>{hoverIndex === null ? "Latest Focus" : "Hover Focus"}</span>
				<span>{data[data.length - 1]?.time}</span>
			</div>

			<div className="pointer-events-none absolute bottom-8 right-3 border border-foreground/40 bg-background/82 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
				Drag: orbit | Wheel: zoom | Hover: inspect
			</div>

			<div
				ref={tooltipRef}
				className="pointer-events-none absolute z-20 border border-foreground/55 bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground opacity-0 transition-opacity"
				style={{ left: 0, top: 0 }}
			>
				<div className="text-muted">{active.time}</div>
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
