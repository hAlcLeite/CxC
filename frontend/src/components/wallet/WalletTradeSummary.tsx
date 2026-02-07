import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	Card,
	CardTitle,
	CardContent,
	Badge,
} from "@/components/ui";
import type { WalletTradeSummary as WalletTradeSummaryType } from "@/lib/types";

interface WalletTradeSummaryProps {
	summary: WalletTradeSummaryType;
}

export function WalletTradeSummary({ summary }: WalletTradeSummaryProps) {
	return (
		<>
			<Card header>
				<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
					<CardTitle>Trade Activity</CardTitle>
				</div>
				<CardContent className="p-4">
					<p className="mb-4 text-sm">
						Raw trade activity
					</p>
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<div className="text-sm">Total Trades</div>
							<div className="mt-1 text-2xl font-bold">
								{summary.trade_count}
							</div>
						</div>
						<div>
							<div className="text-sm">Markets Traded</div>
							<div className="mt-1 text-2xl font-bold">
								{summary.market_count}
							</div>
						</div>
						<div>
							<div className="text-sm">Total Volume</div>
							<div className="mt-1 text-2xl font-bold">
								${summary.total_volume.toFixed(2)}
							</div>
						</div>
						<div>
							<div className="text-sm">Avg Price</div>
							<div className="mt-1 text-2xl font-bold">
								{summary.avg_price.toFixed(3)}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{summary.recent_trades.length > 0 && (
				<Card header>
					<div className="bg-foreground text-background border-b-2 border-background px-4 py-2">
						<CardTitle>Recent Trades</CardTitle>
					</div>
					<CardContent className="p-4">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Time</TableHead>
									<TableHead>Market</TableHead>
									<TableHead>Side</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Price</TableHead>
									<TableHead>Size</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{summary.recent_trades.map((trade, idx) => (
									<TableRow key={`${trade.market_id}-${trade.ts}-${idx}`}>
										<TableCell className="whitespace-nowrap text-sm">
											{new Date(trade.ts).toLocaleString()}
										</TableCell>
										<TableCell
											className="max-w-[200px] truncate text-sm"
											title={trade.question ?? trade.market_id}
										>
											{trade.question ?? trade.market_id}
										</TableCell>
										<TableCell>
											<Badge
												variant={trade.side === "YES" ? "success" : "danger"}
											>
												{trade.side}
											</Badge>
										</TableCell>
										<TableCell>{trade.action}</TableCell>
										<TableCell>{trade.price.toFixed(3)}</TableCell>
										<TableCell>{trade.size.toFixed(2)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</>
	);
}
