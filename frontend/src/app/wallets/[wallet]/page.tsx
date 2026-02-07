"use client";

import { use } from "react";
import Link from "next/link";
import { LoadingState, Card, CardContent } from "@/components/ui";
import { WalletMetrics } from "@/components/wallet/WalletMetrics";
import { WalletWeights } from "@/components/wallet/WalletWeights";
import { useWallet } from "@/lib/hooks";

export default function WalletDetailPage({
  params,
}: {
  params: Promise<{ wallet: string }>;
}) {
  const { wallet } = use(params);
  const { data, isLoading, error } = useWallet(wallet);

  if (isLoading) {
    return <LoadingState message="Loading wallet data..." />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/screener" className="text-muted hover:underline">
          &larr; Back to Screener
        </Link>
        <Card className="border-danger">
          <CardContent className="py-8 text-center">
            <p className="text-danger">
              {error?.message || "Wallet not found"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/screener" className="text-muted hover:underline">
          &larr; Back to Screener
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Wallet Profile</h1>
        <p className="mt-2 break-all font-mono text-sm text-muted">
          {data.wallet}
        </p>
      </div>

      <WalletMetrics metrics={data.metrics} />

      <WalletWeights weights={data.weights} />
    </div>
  );
}
