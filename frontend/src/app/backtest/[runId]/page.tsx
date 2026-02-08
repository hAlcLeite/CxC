"use client";

import { use } from "react";
import Link from "next/link";
import { LoadingState, Card, CardContent } from "@/components/ui";
import { BacktestSummary } from "@/components/backtest/BacktestSummary";
import { EdgeBuckets } from "@/components/backtest/EdgeBuckets";
import { EdgeBucketsChart } from "@/components/backtest/EdgeBucketsChart";
import { useBacktest } from "@/lib/hooks";

export default function BacktestDetailPage({
	params,
}: {
	params: Promise<{ runId: string }>;
}) {
	const { runId } = use(params);
	const { data, isLoading, error } = useBacktest(runId);

	if (isLoading) {
		return <LoadingState message="Loading backtest results..." />;
	}

	if (error || !data) {
		return (
			<div className="space-y-4">
				<Link href="/backtest" className="text-muted hover:underline">
					&larr; Back to Backtest
				</Link>
				<Card className="border-danger">
					<CardContent className="py-8 text-center">
						<p className="text-danger">
							{error?.message || "Backtest not found"}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<Link href="/backtest" className="text-muted hover:underline">
					&larr; Back to Backtest
				</Link>
			</div>

			<BacktestSummary summary={data} />

			{data.edge_buckets ? (
				<>
					<EdgeBucketsChart
						buckets={data.edge_buckets}
						selectedHour={data.cutoff_hours}
					/>
					<EdgeBuckets buckets={data.edge_buckets} />
				</>
			) : (
				<Card className="border-dashed">
					<CardContent className="py-8 text-center">
						<p className="text-muted">
							{data.note ?? "No edge bucket data available"}
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
