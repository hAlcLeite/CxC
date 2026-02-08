"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardTitle, CardContent, Badge, LoadingState, Button } from "@/components/ui";
import { useHealth, useScreener, useAlerts } from "@/lib/hooks";
import { RunPipelineModal } from "@/components/pipeline/RunPipelineModal";

export default function Dashboard() {
	const { data: health, isLoading: healthLoading, error: healthError } = useHealth();
	const { data: screener, isLoading: screenerLoading } = useScreener({ limit: 5 });
	const { data: alerts } = useAlerts();
	const [showPipelineModal, setShowPipelineModal] = useState(false);

	const hasData = screener && screener.markets.length > 0;
	const isBackendOnline = health?.status === "ok";

	if (healthLoading) {
		return <LoadingState message="Connecting to backend..." />;
	}

	return (
		<div className="space-y-8 mt-10">
			<div>
				<h1 className="text-5xl font-bold">Wallet-weighted Prediction Market Signals</h1>

			</div>

			<div className="flex gap-4">
				<Badge variant={isBackendOnline ? "success" : "danger"}>
					Backend: {isBackendOnline ? "Online" : healthError ? "Error" : "Offline"}
				</Badge>
				{screener && (
					<Badge variant="default">
						{screener.count} markets tracked
					</Badge>
				)}
				{alerts && alerts.count > 0 && (
					<Badge variant="danger">
						{alerts.count} active alerts
					</Badge>
				)}
			</div>

			{!hasData && !screenerLoading && (
				<Card className="border-dashed">
					<CardContent className="py-12 text-center">
						<h2 className="mb-2 text-xl font-bold">No Data Yet</h2>
						<p className="mb-6 text-muted">
							Run your first ingest to start tracking prediction markets
						</p>
						<Button onClick={() => setShowPipelineModal(true)}>
							Ingest Data
						</Button>
					</CardContent>
				</Card>
			)}

			{hasData && (
				<div className="grid gap-4 md:grid-cols-3">
					<Card>
						<CardTitle>Top Divergence</CardTitle>
						<CardContent className="mt-4">
							{screener.markets[0] && (
								<Link
									href={`/markets/${screener.markets[0].market_id}`}
									className="block hover:underline"
								>
									<div className="text-2xl font-bold">
										{(screener.markets[0].divergence * 100).toFixed(1)}%
									</div>
									<div className="mt-1 truncate text-sm">
										{screener.markets[0].question}
									</div>
								</Link>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardTitle>Active Markets</CardTitle>
						<CardContent className="mt-4">
							<div className="text-2xl font-bold">{screener.count}</div>
							<div className="mt-1 text-sm">
								with SmartCrowd signals
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardTitle>Active Alerts</CardTitle>
						<CardContent className="mt-4">
							<Link href="/alerts" className="block hover:underline">
								<div className="text-2xl font-bold">{alerts?.count ?? 0}</div>
								<div className="mt-1 text-sm">
									signals requiring attention
								</div>
							</Link>
						</CardContent>
					</Card>
				</div>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				<Link href="/screener">
					<Card hover className="h-full">
						<CardTitle>Screener</CardTitle>
						<CardContent className="mt-2 text-sm">
							View all markets ranked by SmartCrowd divergence
						</CardContent>
					</Card>
				</Link>

				<Link href="/backtest">
					<Card hover className="h-full">
						<CardTitle>Backtest</CardTitle>
						<CardContent className="mt-2 text-sm">
							Evaluate SmartCrowd signal performance
						</CardContent>
					</Card>
				</Link>

				<Link href="/alerts">
					<Card hover className="h-full">
						<CardTitle>Alerts</CardTitle>
						<CardContent className="mt-2 text-sm">
							Real-time regime shifts and integrity risks
						</CardContent>
					</Card>
				</Link>

				<Card
					hover
					className="h-full cursor-pointer"
					onClick={() => setShowPipelineModal(true)}
				>
					<CardTitle>Refresh Data</CardTitle>
					<CardContent className="mt-2 text-sm">
						Ingest new trades or recompute metrics
					</CardContent>
				</Card>
			</div>

			<RunPipelineModal
				open={showPipelineModal}
				onClose={() => setShowPipelineModal(false)}
			/>
		</div>
	);
}
