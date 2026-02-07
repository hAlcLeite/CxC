"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAlerts } from "../api";

export function useAlerts(params?: {
  divergenceThreshold?: number;
  integrityRiskThreshold?: number;
}) {
  return useQuery({
    queryKey: ["alerts", params],
    queryFn: () => fetchAlerts(params),
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Poll every 60 seconds
  });
}
