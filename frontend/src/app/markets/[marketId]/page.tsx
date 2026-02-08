"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoadingState, Card, CardContent, CardTitle, Badge } from "@/components/ui";
import { SnapshotPanel } from "@/components/market/SnapshotPanel";
import { ProbabilityChart } from "@/components/market/ProbabilityChart";
import { TopDriversTable } from "@/components/market/TopDriversTable";
import { DivergenceExplainer } from "@/components/market/DivergenceExplainer";
import { useMarket } from "@/lib/hooks";
import { format } from "date-fns";
import { PiFlowArrowLight } from "react-icons/pi";

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
							{market.liquidity && (
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

			{time_series.length > 1 && <ProbabilityChart timeSeries={time_series} />}

			<TopDriversTable drivers={latest_snapshot.top_drivers} />

			<Card header>
				<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
					<CardTitle className="card-header-title"><PiFlowArrowLight /> Flow Summary</CardTitle>
				</div>
				<CardContent className="p-4">
					<div className="mt-2 flex gap-6">
						<div>
							<span>Net YES Flow: </span>{" "}
							<span
								className={
									flow_summary.net_yes_flow_size > 0
										? "text-success"
										: flow_summary.net_yes_flow_size < 0
											? "text-danger"
											: ""
								}
							>
								{flow_summary.net_yes_flow_size > 0 ? "+" : ""}
								{flow_summary.net_yes_flow_size.toFixed(2)}
							</span>
						</div>
						<div>
							<span>Trade Count:</span>{" "}
							{flow_summary.trade_count}
						</div>
					</div>
					<p className="mt-4 text-sm">{explanation}</p>
				</CardContent>
			</Card>
		</div>
	);
}
