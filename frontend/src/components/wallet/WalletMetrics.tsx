import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  CardTitle,
  CardContent,
} from "@/components/ui";
import type { WalletMetric } from "@/lib/types";

interface WalletMetricsProps {
  metrics: WalletMetric[];
}

export function WalletMetrics({ metrics }: WalletMetricsProps) {
  if (!metrics.length) {
    return (
      <Card header>
        <div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-3">
          <CardTitle className="text-xs font-medium uppercase tracking-[0.08em] sm:text-sm">Performance Metrics</CardTitle>
        </div>
        <CardContent className="py-8 text-center text-muted">
          No metrics available for this wallet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card header>
      <div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-3">
        <CardTitle className="text-xs font-medium uppercase tracking-[0.08em] sm:text-sm">Performance Metrics</CardTitle>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Horizon</TableHead>
              <TableHead>Trades</TableHead>
              <TableHead>Brier</TableHead>
              <TableHead>Calibration Err</TableHead>
              <TableHead>ROI</TableHead>
              <TableHead>Specialization</TableHead>
              <TableHead>Persistence</TableHead>
              <TableHead>Timing Edge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric, idx) => (
              <TableRow key={`${metric.category}-${metric.horizon_bucket}-${idx}`}>
                <TableCell>{metric.category || "all"}</TableCell>
                <TableCell>{metric.horizon_bucket}</TableCell>
                <TableCell>{metric.sample_trades}</TableCell>
                <TableCell
                  className={
                    metric.brier < 0.2
                      ? "text-success"
                      : metric.brier > 0.3
                        ? "text-danger"
                        : ""
                  }
                >
                  {metric.brier.toFixed(3)}
                </TableCell>
                <TableCell>{metric.calibration_error.toFixed(3)}</TableCell>
                <TableCell
                  className={
                    metric.roi > 0
                      ? "text-success"
                      : metric.roi < 0
                        ? "text-danger"
                        : ""
                  }
                >
                  {metric.roi > 0 ? "+" : ""}
                  {(metric.roi * 100).toFixed(1)}%
                </TableCell>
                <TableCell>{(metric.specialization * 100).toFixed(0)}%</TableCell>
                <TableCell>{(metric.persistence * 100).toFixed(0)}%</TableCell>
                <TableCell>{metric.timing_edge.toFixed(3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
