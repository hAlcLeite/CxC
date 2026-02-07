"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchScreener } from "../api";

export function useScreener(params?: { limit?: number; minConfidence?: number }) {
  return useQuery({
    queryKey: ["screener", params],
    queryFn: () => fetchScreener(params),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
