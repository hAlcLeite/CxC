"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarket } from "../api";

export function useMarket(marketId: string, historyPoints?: number) {
  return useQuery({
    queryKey: ["market", marketId, historyPoints],
    queryFn: () => fetchMarket(marketId, historyPoints),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!marketId,
  });
}
