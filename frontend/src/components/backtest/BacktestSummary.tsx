import { Card, CardTitle, CardContent, Badge } from "@/components/ui";
import type { BacktestSummary as BacktestSummaryType } from "@/lib/types";
import { format } from "date-fns";

interface BacktestSummaryProps {
  summary: BacktestSummaryType;
}

export function BacktestSummary({ summary }: BacktestSummaryProps) {
  const brierImprovement = summary.brier_improvement * 100;
  const isImproved = brierImprovement > 0;

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
            Evaluated: {format(new Date(summary.evaluated_at), "MMM d, yyyy HH:mm")}
          </Badge>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-sm text-muted">Total Markets</div>
            <div className="mt-1 text-2xl font-bold">{summary.total_markets}</div>
          </div>

          <div>
            <div className="text-sm text-muted">SmartCrowd Brier</div>
            <div className="mt-1 text-2xl font-bold">
              {summary.smartcrowd_brier.toFixed(4)}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted">Market Brier</div>
            <div className="mt-1 text-2xl font-bold">
              {summary.market_brier.toFixed(4)}
            </div>
          </div>

          <div>
            <div className="text-sm text-muted">Improvement</div>
            <div
              className={`mt-1 text-2xl font-bold ${
                isImproved ? "text-success" : "text-danger"
              }`}
            >
              {isImproved ? "+" : ""}
              {brierImprovement.toFixed(1)}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
