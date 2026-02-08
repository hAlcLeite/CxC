"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoadingState, Card, CardContent, Badge } from "@/components/ui";
import { SnapshotPanel } from "@/components/market/SnapshotPanel";
import { ProbabilityChart } from "@/components/market/ProbabilityChart";
import { TopDriversTable } from "@/components/market/TopDriversTable";
import { DivergenceExplainer } from "@/components/market/DivergenceExplainer";
import { FlowSummaryPanel } from "@/components/market/FlowSummaryPanel";
import { useMarket } from "@/lib/hooks";
import { format } from "date-fns";

export default function MarketDetailPage({
	params,
}: {
	params: Promise<{ marketId: string }>;
}) {
	const { marketId } = use(params);
	const searchParams = useSearchParams();
	const from = searchParams.get("from");
	const backHref = from === "alerts" ? "/alerts" : "/screener";
	const backLabel = from === "alerts" ? "Back to Alerts" : "Back to Screener";
	const { data, isLoading, error } = useMarket(marketId);

	if (data) {
		console.log("[useMarket] time_series.length =", data.time_series?.length, data.time_series);
	}

	if (isLoading) {
		return <LoadingState message="Loading market data..." />;
	}

	if (error || !data) {
		return (
			<div className="space-y-4">
				<Link href={backHref} className="text-muted hover:underline">
					&larr; {backLabel}
				</Link>
				<Card className="border-danger">
					<CardContent className="py-8 text-center">
						<p className="text-danger">
							{error?.message || "Market not found"}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const { market, latest_snapshot, time_series, flow_summary, explanation } =
		data;

	return (
		<div className="space-y-6">
			<div>
				<Link href={backHref} className="font-bold hover:underline">
					&larr; {backLabel}
				</Link>
			</div>

			<div>
				<div className="flex items-start gap-4">
					<div className="flex-1">
						<h1 className="text-5xl font-bold">{market.question}</h1>
						<div className="mt-10 flex flex-wrap gap-2">
							{market.category && (
								<Badge>{market.category}</Badge>
							)}
							{market.end_time && (
								<Badge variant="default">
									Ends: {format(new Date(market.end_time), "MMM d, yyyy")}
								</Badge>
							)}
							{market.liquidity != null && market.liquidity !== 0 && (
								<Badge variant="default">
									Liquidity: ${market.liquidity.toLocaleString()}
								</Badge>
							)}
						</div>
					</div>
				</div>
			</div>

			<SnapshotPanel snapshot={latest_snapshot} />

			<DivergenceExplainer
				marketId={marketId}
				divergence={latest_snapshot.divergence}
			/>

			{time_series.length > 1 ? (
				<ProbabilityChart marketId={marketId} timeSeries={time_series} />
			) : (
				<Card header>
					<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
						<h3 className="text-lg font-bold">Probability Over Time</h3>
					</div>
					<CardContent className="p-6">
						<div className="flex h-[420px] items-center justify-center border-2 border-foreground/25 text-sm uppercase tracking-[0.08em] text-muted">
							Graph loading...
						</div>
					</CardContent>
				</Card>
			)}

			<TopDriversTable drivers={latest_snapshot.top_drivers} />

			<FlowSummaryPanel
				flowSummary={flow_summary}
				explanation={explanation}
				confidence={latest_snapshot.confidence}
				disagreement={latest_snapshot.disagreement}
				integrityRisk={latest_snapshot.integrity_risk}
			/>
		</div>
	);
}
