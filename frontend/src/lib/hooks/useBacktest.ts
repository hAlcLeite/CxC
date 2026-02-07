"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBacktest, runBacktest } from "../api";
import type { BacktestParams } from "../types";

export function useBacktest(runId: string) {
  return useQuery({
    queryKey: ["backtest", runId],
    queryFn: () => fetchBacktest(runId),
    enabled: !!runId,
  });
}

export function useRunBacktest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params?: BacktestParams) => runBacktest(params),
    onSuccess: (data) => {
      queryClient.setQueryData(["backtest", data.run_id], data);
    },
  });
}
