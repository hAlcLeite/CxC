"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui";
import { ThreeTechnologyBackground } from "@/components/background/ThreeTechnologyBackground";
import { ProbabilityChart } from "@/components/market/ProbabilityChart";
import type { TimeSeriesPoint } from "@/lib/types";
import styles from "./page.module.css";

const EDGE_IMAGES = [
	{ src: "/backboardlogo.avif", alt: "Backboard" },
	{ src: "/gemlogo.jpeg", alt: "Gem" },
	{ src: "/snowflakelogo.webp", alt: "Snowflake" },
] as const;

export default function LandingPage() {
	const titleText = "PRECOGNITION";
	const [tickMarks, setTickMarks] = useState<Array<{ id: number; left: number; height: number }>>([]);
	const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 });
	const ghostOffsetRef = useRef({ x: 0, y: 0 });
	const landingPreviewSeries = useMemo<TimeSeriesPoint[]>(() => [], []);

	useEffect(() => {
		const spawnTickMarks = () => {
			const nextCount = 3 + Math.floor(Math.random() * 3);
			const indices = new Set<number>();
			while (indices.size < nextCount) {
				indices.add(Math.floor(Math.random() * titleText.length));
			}
			const marks = Array.from(indices).map((index, i) => ({
				id: Date.now() + i,
				left: ((index + 0.5) / titleText.length) * 100,
				height: 6 + Math.floor(Math.random() * 5),
			}));
			setTickMarks(marks);
			window.setTimeout(() => setTickMarks([]), 420);
		};

		const startTimeout = window.setTimeout(spawnTickMarks, 700);
		const interval = window.setInterval(spawnTickMarks, 4000);
		return () => {
			window.clearTimeout(startTimeout);
			window.clearInterval(interval);
		};
	}, [titleText.length]);

	useEffect(() => {
		let rafId = 0;
		const maxOffset = 6;
		const current = { x: 0, y: 0 };
		const target = { x: 0, y: 0 };

		const animate = () => {
			current.x += (target.x - current.x) * 0.12;
			current.y += (target.y - current.y) * 0.12;

			if (
				Math.abs(current.x - ghostOffsetRef.current.x) > 0.01 ||
				Math.abs(current.y - ghostOffsetRef.current.y) > 0.01
			) {
				ghostOffsetRef.current = { x: current.x, y: current.y };
				setGhostOffset(ghostOffsetRef.current);
			}

			rafId = window.requestAnimationFrame(animate);
		};

		const onPointerMove = (event: PointerEvent) => {
			const nx = event.clientX / window.innerWidth - 0.5;
			const ny = event.clientY / window.innerHeight - 0.5;
			target.x = Math.max(-maxOffset, Math.min(maxOffset, nx * maxOffset * 2));
			target.y = Math.max(-maxOffset, Math.min(maxOffset, ny * maxOffset * 2));
		};

		const onPointerLeave = () => {
			target.x = 0;
			target.y = 0;
		};

		window.addEventListener("pointermove", onPointerMove, { passive: true });
		window.addEventListener("pointerleave", onPointerLeave, { passive: true });
		rafId = window.requestAnimationFrame(animate);

		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerleave", onPointerLeave);
			window.cancelAnimationFrame(rafId);
		};
	}, []);

	return (
		<div className="relative isolate space-y-16 pb-12">
			<ThreeTechnologyBackground />
			<section
				id="top"
				className="relative z-10 flex min-h-screen items-center justify-center overflow-hidden"
			>
				<div className="relative z-10 flex flex-col items-center gap-6 text-center">
					<div className={styles.forecastTitleWrap}>
						<span
							className={`${styles.forecastGhost} text-6xl font-bold tracking-tight`}
							style={{ transform: `translate(${ghostOffset.x.toFixed(2)}px, ${ghostOffset.y.toFixed(2)}px)` }}
							aria-hidden="true"
						>
							{titleText}
						</span>
						<h1 className={`${styles.forecastTitle} text-2xl sm:text-4xl md:text-6xl font-bold tracking-tight`} data-text={titleText}>
							{titleText}
						</h1>
						{tickMarks.map((tick) => (
							<span
								key={tick.id}
								className={styles.forecastTick}
								style={{ left: `${tick.left}%`, height: `${tick.height}px` }}
								aria-hidden="true"
							/>
						))}
					</div>
					<p className="text-lg sm:text-base text-muted">
						A wallet-weighted signal engine that spots informed flow before markets reprice.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Link href="/dashboard">
							<Button size="lg">Launch</Button>
						</Link>
						<Link href="#how-it-works">
							<Button size="lg" variant="secondary">
								How It Works
							</Button>
						</Link>
					</div>
				</div>
			</section>

			<div id="content-start" />

			<section id="how-it-works" className="space-y-4 scroll-mt-24">
				<div>
					<h2 className="text-3xl font-bold">How It Works</h2>
					<p className="mt-2">
						A short flow from raw wallet activity to a calibrated probability signal.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-4">
					{[
						"We ingest wallet-level trade flow from active prediction markets.",
						"We group wallets into cohorts by category, horizon, and historical calibration.",
						"We infer cohort belief from trading sequences and net flow, not just last price.",
						"We publish SmartCrowd Prob next to Market Prob with a short explanation.",
					].map((step, index) => (
						<Card key={step}>
							<CardContent className="space-y-3">
								<Badge>Step {index + 1}</Badge>
								<p className="text-sm">{step}</p>
							</CardContent>
						</Card>
					))}
				</div>
				<Card>
					<CardContent className="space-y-3 text-sm">
						<p>
							Market implies 62%, SmartCrowd says 53% because calibrated cohorts are net selling YES.
						</p>
						<p className="text-muted">
							Confidence is higher when skilled cohorts agree and flow looks organic, and lower when activity looks thin, erratic, or potentially coordinated; research-only, not financial advice.
						</p>
					</CardContent>
				</Card>
			</section>

			<section id="visualization" className="space-y-4 scroll-mt-24">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-3xl font-bold">Live Influence Graphs</h2>
						<p className="mt-2">
							Tracking granular divergences using PCA embeddings and using 3D Lattice for magnitude.
						</p>
					</div>
				</div>

				<ProbabilityChart marketId="landing-preview" timeSeries={landingPreviewSeries} />
			</section>

			<section id="edge" className="space-y-6 scroll-mt-24">
				<div>
					<h2 className="text-3xl font-bold">Our EDGE: Human Explainability</h2>
				</div>
				<div className="flex flex-wrap gap-6">
					{EDGE_IMAGES.map((item) => (
						<div key={item.src} className="flex min-w-[180px] flex-1 items-center justify-center border-2 border-foreground/20 bg-foreground/5 p-4">
							<Image
								src={item.src}
								alt={item.alt}
								width={200}
								height={160}
								className="h-40 w-full object-contain"
							/>
						</div>
					))}
				</div>
				<p className="text-lg font-bold text-white">
					Gain insights on divergences for your market directly from Gemini (+BackBoard) and Snowflake with live sentiment analysis.
				</p>
			</section>

			<section id="demo" className="space-y-4 scroll-mt-24 w-full">
				<div>
					<h2 className="text-3xl font-bold">Product Preview</h2>
					<p className="mt-2">Get market insights from our SmartCrowd signals.</p>
				</div>

				<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Market Screener</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead></TableHead>
										<TableHead>Market</TableHead>
										<TableHead>Precognition</TableHead>
										<TableHead>Confidence</TableHead>
										<TableHead>Divergence</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[
										["Super Bowl winner decided by OT?", "62%", "53%", "High", "9.0%"],
										["Fed cuts rates before June?", "41%", "49%", "Medium", "8.0%"],
										["Major ETF inflow next week?", "57%", "61%", "High", "4.0%"],
										["Will CPI print under 2.8%?", "36%", "31%", "Medium", "5.0%"],
										["L2 token launches by Q3?", "68%", "60%", "Low", "8.0%"],
									].map((row) => (
										<TableRow key={row[0]}>
											<TableCell className="max-w-xs truncate">{row[0]}</TableCell>
											<TableCell>{row[1]}</TableCell>
											<TableCell>{row[2]}</TableCell>
											<TableCell>
												<Badge
													variant={
														row[3] === "High" ? "success" : row[3] === "Low" ? "muted" : "default"
													}
												>
													{row[3]}
												</Badge>
											</TableCell>
											<TableCell>{row[4]}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					<Card className="min-w-0">
						<CardHeader>
							<CardTitle>Market Page</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 pt-0">
							<div className="border-2 border-foreground p-3">
								<div className="mb-2 text-xs font-bold">Mini Signal Sparkline</div>
								<svg viewBox="0 0 240 60" className="h-16 w-full">
									<path
										d="M0 42 L30 38 L60 40 L90 28 L120 24 L150 18 L180 22 L210 16 L240 20"
										fill="none"
										stroke="var(--foreground)"
										strokeWidth="2"
									/>
									<path
										d="M0 30 L30 31 L60 34 L90 32 L120 30 L150 36 L180 37 L210 35 L240 34"
										fill="none"
										stroke="var(--foreground)"
										strokeWidth="1.5"
										strokeOpacity="0.5"
										strokeDasharray="4 3"
									/>
								</svg>
							</div>
							<div className="border-2 border-foreground p-3">
								<div className="text-xs font-bold">Flow Summary</div>
								<ul className="mt-2 list-disc pl-5 text-sm">
									<li>Top sports cohort reducing YES exposure</li>
									<li>Lead wallets lagging price momentum</li>
									<li>Uncertainty tight in 3-day horizon</li>
								</ul>
							</div>
							<div className="border-2 border-foreground p-3 text-sm">
								<div className="font-bold">What would flip it?</div>
								<p className="mt-1">
									Re-accumulation by high-skill wallets + cross-community buy confirmation.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			<section className="space-y-4 border-t-2 border-foreground pt-10">
				<h2 className="text-3xl font-bold">Build your edge on signal quality.</h2>
				<div className="flex flex-wrap gap-3">
					<Link href="/screener">
						<Button size="lg">Launch Demo</Button>
					</Link>
				</div>
				<p className="text-sm text-muted">Not financial advice. Research-only signal.</p>
			</section>

			<footer className="border-t-2 border-foreground pt-6 text-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-4">
						<Link href="https://github.com/Thomson-Lam/CxC" target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
