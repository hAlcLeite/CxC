"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchWallet } from "../api";

export function useWallet(wallet: string) {
  return useQuery({
    queryKey: ["wallet", wallet],
    queryFn: () => fetchWallet(wallet),
    staleTime: 60 * 60 * 1000, // 1 hour (wallet metrics rarely change)
    enabled: !!wallet,
  });
}
