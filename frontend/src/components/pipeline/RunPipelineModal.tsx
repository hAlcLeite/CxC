"use client";

import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { useIngestMutation, useRecomputeMutation } from "@/lib/hooks";
import type { IngestResult } from "@/lib/types";
import clsx from "clsx";

interface RunPipelineModalProps {
	open: boolean;
	onClose: () => void;
}

type PipelineMode = "quick" | "full";

export function RunPipelineModal({ open, onClose }: RunPipelineModalProps) {
	const [mode, setMode] = useState<PipelineMode>("quick");
	const [result, setResult] = useState<IngestResult | null>(null);
	const [includeActive, setIncludeActive] = useState(true);
	const [includeClosed, setIncludeClosed] = useState(true);
	const [activeLimit, setActiveLimit] = useState(20);
	const [closedLimit, setClosedLimit] = useState(20);
	const [tradesPerMarket, setTradesPerMarket] = useState(500);
	const [chunkSize, setChunkSize] = useState(1);
	const ingestMutation = useIngestMutation();
	const recomputeMutation = useRecomputeMutation();

	const isLoading = ingestMutation.isPending || recomputeMutation.isPending;
	const error = ingestMutation.error || recomputeMutation.error;

	const handleRun = async () => {
		setResult(null);
		try {
			if (mode === "quick") {
				await recomputeMutation.mutateAsync({ include_resolved_snapshots: true });
				onClose();
			} else {
				const res = await ingestMutation.mutateAsync({
					params: {
						include_active_markets: includeActive,
						include_closed_markets: includeClosed,
						active_markets_limit: activeLimit,
						closed_markets_limit: closedLimit,
						trades_per_market: tradesPerMarket,
						market_chunk_size: chunkSize,
					},
					runRecompute: true,
				});
				if (res.ingest.chunks_failed > 0) {
					setResult(res);
				} else {
					onClose();
				}
			}
		} catch {
			// Error is handled by mutation state
		}
	};

	const handleClose = () => {
		setResult(null);
		onClose();
	};

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
			<div className="w-full max-w-md border-2 border-foreground bg-background p-6">
				<h2 className="mb-4 text-xl font-bold">Refresh Data</h2>

				{result ? (
					<div className="space-y-4">
						<div className="border-2 border-warning p-3 text-sm">
							<div className="font-bold">Completed with warnings</div>
							<div className="mt-1 opacity-80">
								{result.ingest.chunks_failed} of {result.ingest.chunks_total} market
								chunks failed to fetch trades. Data was still ingested for the
								successful chunks.
							</div>
						</div>
						<div className="space-y-1 text-sm">
							<div>Markets upserted: {result.ingest.markets_upserted}</div>
							<div>Trades inserted: {result.ingest.trades_inserted}</div>
							<div>Trades fetched: {result.ingest.trades_fetched}</div>
						</div>
						{result.ingest.chunk_errors.length > 0 && (
							<details className="text-sm">
								<summary className="cursor-pointer font-bold opacity-70 hover:opacity-100">
									Failed chunks ({result.ingest.chunk_errors.length})
								</summary>
								<div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
									{result.ingest.chunk_errors.map((ce, i) => (
										<div key={i} className="border border-foreground/20 p-2 text-xs opacity-70">
											Chunk {ce.chunk_index}: {ce.error}
										</div>
									))}
								</div>
							</details>
						)}
						<Button onClick={handleClose} className="w-full">
							Close
						</Button>
					</div>
				) : (
					<>
						<div className="mb-6 space-y-3">
							<button
								onClick={() => setMode("quick")}
								className={clsx(
									"w-full border-2 p-4 text-left transition-colors",
									mode === "quick"
										? "border-foreground bg-foreground text-background"
										: "border-foreground/50 hover:border-foreground"
								)}
							>
								<div className="font-bold">Quick Refresh</div>
								<div className="text-sm opacity-70">
									Recompute metrics and snapshots using existing trade data
								</div>
							</button>

							<button
								onClick={() => setMode("full")}
								className={clsx(
									"w-full border-2 p-4 text-left transition-colors",
									mode === "full"
										? "border-foreground bg-foreground text-background"
										: "border-foreground/50 hover:border-foreground"
								)}
							>
								<div className="font-bold">Full Ingest</div>
								<div className="text-sm opacity-70">
									Fetch new trades from Polymarket and recompute all metrics
								</div>
							</button>

							{mode === "full" && (
								<div className="space-y-3 border-2 border-foreground p-4">
									<div className="text-xs font-bold uppercase tracking-[0.08em]">Ingest Parameters</div>
									<div className="flex gap-4">
										<label className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={includeActive}
												onChange={(e) => setIncludeActive(e.target.checked)}
												className="h-4 w-4 accent-foreground"
											/>
											Active Markets
										</label>
										<label className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={includeClosed}
												onChange={(e) => setIncludeClosed(e.target.checked)}
												className="h-4 w-4 accent-foreground"
											/>
											Closed Markets
										</label>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<label className="space-y-1">
											<span className="text-xs">Active Limit</span>
											<input
												type="number"
												value={activeLimit}
												onChange={(e) => setActiveLimit(Number(e.target.value))}
												min={1}
												className="w-full border-2 border-foreground bg-background px-2 py-1 font-mono text-sm text-foreground focus:outline-none"
											/>
										</label>
										<label className="space-y-1">
											<span className="text-xs">Closed Limit</span>
											<input
												type="number"
												value={closedLimit}
												onChange={(e) => setClosedLimit(Number(e.target.value))}
												min={1}
												className="w-full border-2 border-foreground bg-background px-2 py-1 font-mono text-sm text-foreground focus:outline-none"
											/>
										</label>
										<label className="space-y-1">
											<span className="text-xs">Trades / Market</span>
											<input
												type="number"
												value={tradesPerMarket}
												onChange={(e) => setTradesPerMarket(Number(e.target.value))}
												min={1}
												className="w-full border-2 border-foreground bg-background px-2 py-1 font-mono text-sm text-foreground focus:outline-none"
											/>
										</label>
										<label className="space-y-1">
											<span className="text-xs">Chunk Size</span>
											<input
												type="number"
												value={chunkSize}
												onChange={(e) => setChunkSize(Number(e.target.value))}
												min={1}
												className="w-full border-2 border-foreground bg-background px-2 py-1 font-mono text-sm text-foreground focus:outline-none"
											/>
										</label>
									</div>
								</div>
							)}
						</div>

						{error && (
							<div className="mb-4 border-2 border-danger p-3 text-sm text-danger">
								{error.message}
							</div>
						)}

						<div className="flex gap-3">
							<Button
								variant="secondary"
								onClick={handleClose}
								disabled={isLoading}
								className="flex-1"
							>
								Cancel
							</Button>
							<Button onClick={handleRun} disabled={isLoading} className="flex-1">
								{isLoading ? (
									<span className="flex items-center gap-2">
										<Spinner size="sm" />
										Running...
									</span>
								) : (
									"Run"
								)}
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
