import { Card, CardTitle, CardContent, Badge } from "@/components/ui";
import type { BacktestSummary as BacktestSummaryType } from "@/lib/types";
import { isValid, format } from "date-fns";

interface BacktestSummaryProps {
	summary: BacktestSummaryType;
}

export function BacktestSummary({ summary }: BacktestSummaryProps) {
	const hasMetrics = summary.total_markets > 0 && summary.brier_improvement != null;
	const brierImprovement = (summary.brier_improvement ?? 0) * 100;
	const isImproved = brierImprovement > 0;
	const date = new Date(summary.evaluated_at);
	const formattedDate = isValid(date) ? format(date, "MM, d, yyyy HH:mm") : "Pending";

	return (
		<Card>
			<CardTitle>Backtest Results</CardTitle>
			<CardContent className="mt-4">
				<div className="mb-6 flex flex-wrap gap-2">
					<Badge variant="default">Run ID: {summary.run_id}</Badge>
					<Badge variant="default">
						Cutoff: {summary.cutoff_hours}h before resolution
					</Badge>
					<Badge variant="default">
						Evaluated: {formattedDate}
					</Badge>
				</div>

				{summary.note && (
					<p className="mb-6 text-sm text-muted">{summary.note}</p>
				)}

				{hasMetrics ? (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<div className="text-sm text-muted">Total Markets</div>
							<div className="mt-1 text-2xl font-bold">{summary.total_markets}</div>
						</div>

						<div>
							<div className="text-sm text-muted">SmartCrowd Brier</div>
							<div className="mt-1 text-2xl font-bold">
								{summary.smartcrowd_brier?.toFixed(4)}
							</div>
						</div>

						<div>
							<div className="text-sm text-muted">Market Brier</div>
							<div className="mt-1 text-2xl font-bold">
								{summary.market_brier?.toFixed(4)}
							</div>
						</div>

						<div>
							<div className="text-sm text-muted">Improvement</div>
							<div
								className={`mt-1 text-2xl font-bold ${isImproved ? "text-success" : "text-danger"
									}`}
							>
								{isImproved ? "+" : ""}
								{brierImprovement.toFixed(1)}%
							</div>
						</div>
					</div>
				) : (
					<div className="py-4 text-center">
						<div className="text-sm text-muted">Total Markets</div>
						<div className="mt-1 text-2xl font-bold">0</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
