"use client";

import { use } from "react";
import Link from "next/link";
import { LoadingState, Card, CardContent, Button } from "@/components/ui";
import { WalletMetrics } from "@/components/wallet/WalletMetrics";
import { WalletWeights } from "@/components/wallet/WalletWeights";
import { WalletTradeSummary } from "@/components/wallet/WalletTradeSummary";
import { useWallet } from "@/lib/hooks";
import { toast } from "sonner";

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
				<Link href="/screener" className="text-lg font-bold text-white hover:underline">
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
				<Link href="/screener" className="text-md font-bold text-white hover:underline">
					&larr; Back to Screener
				</Link>
			</div>

			<div className="flex flex-row gap-x-4">
				<h1 className="text-2xl font-bold">Wallet Profile</h1>
				<div className="flex items-center gap-3">
					<Button
						size="sm"
						variant="secondary"
						onClick={() => {
							navigator.clipboard.writeText(data.wallet);
							toast("ID copied!");
						}}
					>
						Copy ID
					</Button>
				</div>
			</div>

			{data.trade_summary && <WalletTradeSummary summary={data.trade_summary} />}
			{/*	<WalletMetrics metrics={data.metrics} />
			<WalletWeights weights={data.weights} /> BUG: data fetching not working */}
		</div>
	);
}
