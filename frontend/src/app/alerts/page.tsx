"use client";

import { LoadingState, Card, CardContent, Badge } from "@/components/ui";
import { AlertsList } from "@/components/alerts/AlertsList";
import { useAlerts } from "@/lib/hooks";
import type { Alert } from "@/lib/types";

export default function AlertsPage() {
  const { data, isLoading, error, dataUpdatedAt } = useAlerts();

  if (isLoading) {
    return <LoadingState message="Loading alerts..." />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Alerts</h1>
        <Card className="border-danger">
          <CardContent className="py-8 text-center">
            <p className="text-danger">Failed to load alerts</p>
            <p className="mt-2 text-sm text-muted">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alerts = data?.alerts ?? [];
  const byType = data?.by_type ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Alerts</h1>
          <p className="mt-1 text-muted">
            Real-time signals from SmartCrowd analysis
          </p>
        </div>
        <div className="text-sm text-muted">
          Last updated:{" "}
          {dataUpdatedAt
            ? new Date(dataUpdatedAt).toLocaleTimeString()
            : "—"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="default">Total: {alerts.length}</Badge>
        {(Object.entries(byType) as [string, Alert[]][]).map(([type, typeAlerts]) => (
          <Badge
            key={type}
            variant={
              type === "integrity_risk_spike"
                ? "danger"
                : type === "trusted_cohort_regime_shift"
                  ? "success"
                  : "default"
            }
          >
            {type.replace(/_/g, " ")}: {typeAlerts.length}
          </Badge>
        ))}
      </div>

      <AlertsList alerts={alerts} />
    </div>
  );
}
