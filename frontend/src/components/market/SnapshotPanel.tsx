import { Card, CardTitle, CardContent, Badge } from "@/components/ui";
import { DivergenceBar } from "@/components/screener/DivergenceBar";
import type { LatestSnapshot } from "@/lib/types";

interface SnapshotPanelProps {
  snapshot: LatestSnapshot;
}

export function SnapshotPanel({ snapshot }: SnapshotPanelProps) {
  return (
    <Card>
      <CardTitle>Latest Snapshot</CardTitle>
      <CardContent className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <div className="text-sm text-muted">Divergence</div>
          <div className="mt-1">
            <DivergenceBar divergence={snapshot.divergence} />
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Market Probability</div>
          <div className="mt-1 text-2xl font-bold">
            {(snapshot.market_prob * 100).toFixed(1)}%
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">SmartCrowd Probability</div>
          <div className="mt-1 text-2xl font-bold">
            {(snapshot.smartcrowd_prob * 100).toFixed(1)}%
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Confidence</div>
          <div className="mt-1">
            <Badge
              variant={
                snapshot.confidence >= 0.7
                  ? "success"
                  : snapshot.confidence >= 0.4
                    ? "default"
                    : "muted"
              }
            >
              {(snapshot.confidence * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Disagreement</div>
          <div className="mt-1">
            <Badge variant={snapshot.disagreement > 0.5 ? "danger" : "muted"}>
              {(snapshot.disagreement * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Participation Quality</div>
          <div className="mt-1">
            <Badge
              variant={
                snapshot.participation_quality >= 0.5 ? "success" : "muted"
              }
            >
              {(snapshot.participation_quality * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Integrity Risk</div>
          <div className="mt-1">
            <Badge
              variant={snapshot.integrity_risk >= 0.5 ? "danger" : "muted"}
            >
              {(snapshot.integrity_risk * 100).toFixed(0)}%
            </Badge>
          </div>
        </div>

        <div>
          <div className="text-sm text-muted">Active Wallets</div>
          <div className="mt-1 text-xl font-bold">{snapshot.active_wallets}</div>
        </div>
      </CardContent>
    </Card>
  );
}
