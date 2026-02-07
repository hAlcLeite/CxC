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
      <Card>
        <CardTitle>Performance Metrics</CardTitle>
        <CardContent className="py-8 text-center text-muted">
          No metrics available for this wallet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Performance Metrics</CardTitle>
      <CardContent className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Horizon</TableHead>
              <TableHead>Trades</TableHead>
              <TableHead>Brier</TableHead>
              <TableHead>Calibration</TableHead>
              <TableHead>ROI</TableHead>
              <TableHead>Contrarian</TableHead>
              <TableHead>Early</TableHead>
              <TableHead>Concentrated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric, idx) => (
              <TableRow key={`${metric.category}-${metric.horizon_bucket}-${idx}`}>
                <TableCell>{metric.category || "all"}</TableCell>
                <TableCell>{metric.horizon_bucket}</TableCell>
                <TableCell>{metric.trade_count}</TableCell>
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
                <TableCell>{(metric.calibration * 100).toFixed(1)}%</TableCell>
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
                <TableCell>{(metric.style_contrarian * 100).toFixed(0)}%</TableCell>
                <TableCell>{(metric.style_early * 100).toFixed(0)}%</TableCell>
                <TableCell>{(metric.style_concentrated * 100).toFixed(0)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
