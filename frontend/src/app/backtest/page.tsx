"use client";

import { useState } from "react";
import { Button, Card, CardContent, Badge, Spinner } from "@/components/ui";
import { BacktestSummary } from "@/components/backtest/BacktestSummary";
import { EdgeBuckets } from "@/components/backtest/EdgeBuckets";
import { BrierSweepChart } from "@/components/backtest/BrierSweepChart";
import { ImprovementChart } from "@/components/backtest/ImprovementChart";
import { EdgeBucketsChart } from "@/components/backtest/EdgeBucketsChart";
import { useRunBacktest, useRunBacktestSweep } from "@/lib/hooks";

type Mode = "sweep" | "single";

export default function BacktestPage() {
	const [mode, setMode] = useState<Mode>("sweep");

	// Single mode state
	const [cutoffHours, setCutoffHours] = useState(1);
	const runBacktest = useRunBacktest();

	// Sweep mode state
	const [maxHours, setMaxHours] = useState(168);
	const runSweep = useRunBacktestSweep();
	const [selectedSweepHour, setSelectedSweepHour] = useState(1);
	// Separate display state so mid-type doesn't trigger layout shifts
	const [hourInput, setHourInput] = useState("1");

	const isValidCutoff =
		cutoffHours > 0 && cutoffHours <= 168 && !Number.isNaN(cutoffHours);
	const isValidMaxHours =
		maxHours > 0 && maxHours <= 168 && !Number.isNaN(maxHours);

	const handleRunBacktest = () => {
		if (!isValidCutoff) return;
		runBacktest.mutate({ cutoff_hours: cutoffHours });
	};

	const handleRunSweep = () => {
		if (!isValidMaxHours) return;
		setSelectedSweepHour(1);
		setHourInput("1");
		runSweep.mutate({ max_hours: maxHours });
	};

	const commitHour = (val: string) => {
		const n = Number(val);
		const max = runSweep.data?.hours_evaluated ?? 168;
		if (!Number.isNaN(n) && n >= 1 && n <= max) {
			setSelectedSweepHour(n);
		} else {
			setHourInput(String(selectedSweepHour));
		}
	};

	const stepHour = (delta: number) => {
		const max = runSweep.data?.hours_evaluated ?? 168;
		const next = Math.min(max, Math.max(1, selectedSweepHour + delta));
		setSelectedSweepHour(next);
		setHourInput(String(next));
	};

	const selectedHourData = runSweep.data?.hourly_results.find(
		(r) => r.cutoff_hours === selectedSweepHour
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Backtest</h1>
				<p className="mt-1">
					Evaluate Precognition signal performance against resolved markets
				</p>
			</div>

			{/* Mode toggle */}
			<div className="inline-flex border-2 border-foreground p-0.5">
				<button
					type="button"
					onClick={() => setMode("sweep")}
					className={`px-3 py-1 text-xs font-mono transition-colors ${mode === "sweep"
						? "bg-foreground text-background"
						: "bg-background text-foreground hover:bg-foreground hover:text-background"
						}`}
				>
					Sweep
				</button>
				<button
					type="button"
					onClick={() => setMode("single")}
					className={`px-3 py-1 text-xs font-mono transition-colors ${mode === "single"
						? "bg-foreground text-background"
						: "bg-background text-foreground hover:bg-foreground hover:text-background"
						}`}
				>
					Single
				</button>
			</div>

			{mode === "sweep" ? (
				<>
					{/* Sweep controls */}
					<Card>
						<CardContent>
							<div className="flex flex-wrap items-end gap-4">
								<div>
									<label className="block text-sm">
										Max Hours
									</label>
									<input
										type="number"
										value={maxHours}
										onChange={(e) =>
											setMaxHours(Number(e.target.value))
										}
										min={1}
										max={168}
										className="mt-3 w-24 border-2 border-foreground bg-background px-3 py-2 font-mono"
									/>
								</div>
								<Button
									onClick={handleRunSweep}
									disabled={
										runSweep.isPending || !isValidMaxHours
									}
								>
									{runSweep.isPending ? (
										<span className="flex items-center gap-2">
											<Spinner size="sm" />
											Running Sweep...
										</span>
									) : (
										"Run Sweep"
									)}
								</Button>
							</div>

							{runSweep.error && (
								<div className="mt-4 border-2 border-danger p-3 text-sm text-danger">
									{runSweep.error.message}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Sweep results */}
					{runSweep.data && (
						<>
							{/* Summary badges */}
							<div className="flex flex-wrap gap-2">
								<Badge variant="default">
									Resolved Markets:{" "}
									{runSweep.data.total_resolved_markets}
								</Badge>
								<Badge variant="default">
									Hours Evaluated:{" "}
									{runSweep.data.hours_evaluated}
								</Badge>
							</div>

							{/* Charts */}
							<BrierSweepChart
								hourlyResults={runSweep.data.hourly_results}
							/>
							<ImprovementChart
								hourlyResults={runSweep.data.hourly_results}
							/>

							{/* Hour selector for edge buckets */}
							<Card>
								<CardContent>
									<label className="block text-lg font-bold">
										Cutoff Hour for Edge Buckets
									</label>
									<div className="mt-4 flex items-center gap-2">
										<input
											type="number"
											value={hourInput}
											onChange={(e) =>
												setHourInput(e.target.value)
											}
											onBlur={() =>
												commitHour(hourInput)
											}
											onKeyDown={(e) => {
												if (e.key === "Enter")
													commitHour(hourInput);
											}}
											min={1}
											max={runSweep.data.hours_evaluated}
											className="w-24 border-2 border-foreground bg-background px-3 py-2 font-mono"
										/>
										<div className="inline-flex border-2 border-foreground">
											<button
												type="button"
												onClick={() => stepHour(-1)}
												disabled={
													selectedSweepHour <= 1
												}
												className="px-3 py-2 font-mono text-sm transition-colors hover:bg-foreground hover:text-background disabled:opacity-30"
											>
												−
											</button>
											<button
												type="button"
												onClick={() => stepHour(1)}
												disabled={
													selectedSweepHour >=
													runSweep.data.hours_evaluated
												}
												className="border-l-2 border-foreground px-3 py-2 font-mono text-sm transition-colors hover:bg-foreground hover:text-background disabled:opacity-30"
											>
												+
											</button>
										</div>
									</div>
								</CardContent>
							</Card>

							{selectedHourData?.edge_buckets ? (
								<>
									<EdgeBucketsChart
										buckets={selectedHourData.edge_buckets}
										selectedHour={selectedSweepHour}
									/>
									<EdgeBuckets
										buckets={selectedHourData.edge_buckets}
									/>
								</>
							) : (
								<Card className="border-dashed">
									<CardContent className="py-12 text-center">
										<p className="text-muted">
											Maximum cutoff hours reached
										</p>
									</CardContent>
								</Card>
							)}
						</>
					)}

					{!runSweep.data && !runSweep.isPending && (
						<Card className="border-dashed">
							<CardContent className="py-12 text-center">
								<p className="text-muted">
									Run a sweep to evaluate Precognition across
									all cutoff hours
								</p>
							</CardContent>
						</Card>
					)}
				</>
			) : (
				<>
					{/* Single mode - existing UI */}
					<Card>
						<CardContent>
							<div className="flex flex-wrap items-end gap-4">
								<div>
									<label className="block text-sm">
										Cutoff Hours Before Resolution
									</label>
									<input
										type="number"
										value={cutoffHours}
										onChange={(e) =>
											setCutoffHours(
												Number(e.target.value)
											)
										}
										min={1}
										max={168}
										className="mt-3 w-24 border-2 border-foreground bg-background px-3 py-2 font-mono"
									/>
								</div>
								<Button
									onClick={handleRunBacktest}
									disabled={
										runBacktest.isPending || !isValidCutoff
									}
								>
									{runBacktest.isPending ? (
										<span className="flex items-center gap-2">
											<Spinner size="sm" />
											Running...
										</span>
									) : (
										"Run Backtest"
									)}
								</Button>
							</div>

							{runBacktest.error && (
								<div className="mt-4 border-2 border-danger p-3 text-sm text-danger">
									{runBacktest.error.message}
								</div>
							)}
						</CardContent>
					</Card>

					{runBacktest.data && (
						<>
							<BacktestSummary summary={runBacktest.data} />
							{runBacktest.data.edge_buckets ? (
								<EdgeBuckets
									buckets={runBacktest.data.edge_buckets}
								/>
							) : (
								<Card className="border-dashed">
									<CardContent className="py-8 text-center">
										<p className="text-muted">
											{runBacktest.data.note ??
												"No edge bucket data available"}
										</p>
									</CardContent>
								</Card>
							)}
						</>
					)}

					{!runBacktest.data && !runBacktest.isPending && (
						<Card className="border-dashed">
							<CardContent className="py-12 text-center">
								<p className="text-muted">
									Run a backtest to evaluate Precognition
									signal performance
								</p>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
