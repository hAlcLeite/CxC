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
import type { EdgeBucket } from "@/lib/types";

interface EdgeBucketsProps {
  buckets: EdgeBucket[];
}

export function EdgeBuckets({ buckets }: EdgeBucketsProps) {
  if (!buckets.length) {
    return (
      <Card>
        <CardTitle>Edge Buckets</CardTitle>
        <CardContent className="py-8 text-center text-muted">
          No edge bucket data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Edge Buckets</CardTitle>
      <CardContent className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Avg Edge</TableHead>
              <TableHead>Avg PnL</TableHead>
              <TableHead>Win Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((bucket) => (
              <TableRow key={bucket.bucket}>
                <TableCell className="font-bold">{bucket.bucket}</TableCell>
                <TableCell>{bucket.count}</TableCell>
                <TableCell
                  className={
                    bucket.avg_edge > 0
                      ? "text-success"
                      : bucket.avg_edge < 0
                        ? "text-danger"
                        : ""
                  }
                >
                  {bucket.avg_edge > 0 ? "+" : ""}
                  {(bucket.avg_edge * 100).toFixed(2)}%
                </TableCell>
                <TableCell
                  className={
                    bucket.avg_pnl > 0
                      ? "text-success"
                      : bucket.avg_pnl < 0
                        ? "text-danger"
                        : ""
                  }
                >
                  {bucket.avg_pnl > 0 ? "+" : ""}
                  {(bucket.avg_pnl * 100).toFixed(2)}%
                </TableCell>
                <TableCell
                  className={
                    bucket.win_rate > 0.5
                      ? "text-success"
                      : bucket.win_rate < 0.5
                        ? "text-danger"
                        : ""
                  }
                >
                  {(bucket.win_rate * 100).toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
