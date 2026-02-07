import Link from "next/link";
import { Card, CardContent, Badge } from "@/components/ui";
import type { Alert } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

interface AlertCardProps {
  alert: Alert;
}

function getAlertTypeLabel(type: string): string {
  switch (type) {
    case "trusted_cohort_regime_shift":
      return "Regime Shift";
    case "integrity_risk_spike":
      return "Integrity Risk";
    case "smartcrowd_crossed_market":
      return "Signal Crossed";
    default:
      return type;
  }
}

function getAlertVariant(
  type: string
): "default" | "success" | "danger" | "muted" {
  switch (type) {
    case "trusted_cohort_regime_shift":
      return "success";
    case "integrity_risk_spike":
      return "danger";
    case "smartcrowd_crossed_market":
      return "default";
    default:
      return "muted";
  }
}

export function AlertCard({ alert }: AlertCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getAlertVariant(alert.type)}>
                {getAlertTypeLabel(alert.type)}
              </Badge>
              {alert.category && (
                <Badge variant="muted">{alert.category}</Badge>
              )}
              <span className="text-sm text-muted">
                {formatDistanceToNow(new Date(alert.snapshot_time), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <Link
              href={`/markets/${alert.market_id}`}
              className="mt-2 block text-lg font-bold hover:underline"
            >
              {alert.question}
            </Link>
            <p className="mt-2 text-sm text-muted">{alert.detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
