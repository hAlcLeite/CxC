"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { AlertCard } from "./AlertCard";
import type { Alert } from "@/lib/types";

interface AlertsListProps {
  alerts: Alert[];
}

export function AlertsList({ alerts }: AlertsListProps) {
  const prevCountRef = useRef(alerts.length);

  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      const newAlerts = alerts.length - prevCountRef.current;
      toast(`${newAlerts} new alert${newAlerts > 1 ? "s" : ""} detected`, {
        description: "Check the alerts page for details",
      });
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length]);

  if (!alerts.length) {
    return (
      <div className="py-12 text-center text-muted">
        No active alerts at this time
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert, idx) => (
        <AlertCard
          key={`${alert.market_id}-${alert.type}-${alert.snapshot_time}-${idx}`}
          alert={alert}
        />
      ))}
    </div>
  );
}
