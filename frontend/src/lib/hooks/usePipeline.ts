"use client";

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ingestPolymarket, recomputePipeline, checkHealth } from "../api";
import type { IngestParams, RecomputeParams } from "../types";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: checkHealth,
    staleTime: 30 * 1000, // 30 seconds
    retry: false,
  });
}

export function useIngestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      params,
      runRecompute = true,
    }: {
      params?: IngestParams;
      runRecompute?: boolean;
    }) => ingestPolymarket(params, runRecompute),
    onSuccess: () => {
      // Invalidate all data caches after ingest
      queryClient.invalidateQueries({ queryKey: ["screener"] });
      queryClient.invalidateQueries({ queryKey: ["market"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["backtest"] });
    },
  });
}

export function useRecomputeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params?: RecomputeParams) => recomputePipeline(params),
    onSuccess: () => {
      // Invalidate computed data caches
      queryClient.invalidateQueries({ queryKey: ["screener"] });
      queryClient.invalidateQueries({ queryKey: ["market"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
