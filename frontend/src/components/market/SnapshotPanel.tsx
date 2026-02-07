import { Card, CardTitle, CardContent, Badge } from "@/components/ui";
import { DivergenceBar } from "@/components/screener/DivergenceBar";
import type { LatestSnapshot } from "@/lib/types";

interface SnapshotPanelProps {
	snapshot: LatestSnapshot;
}

export function SnapshotPanel({ snapshot }: SnapshotPanelProps) {
	return (
		<Card>
			<div>
				<CardTitle>Latest Snapshot</CardTitle>
			</div>
			<CardContent className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<div>
					<div className="text-sm">Divergence</div>
					<div className="mt-1">
						<DivergenceBar divergence={snapshot.divergence} />
					</div>
				</div>

				<div>
					<div className="text-sm">Market Probability</div>
					<div className="mt-1 text-2xl font-bold">
						{(snapshot.market_prob * 100).toFixed(1)}%
					</div>
				</div>

				<div>
					<div className="text-sm">Precognition Probability</div>
					<div className="mt-1 text-2xl font-bold">
						{(snapshot.precognition_prob * 100).toFixed(1)}%
					</div>
				</div>

				<div>
					<div className="text-sm">Confidence</div>
					<div className="mt-1">
						<Badge
							variant={
								snapshot.confidence >= 0.7
									? "success"
									: snapshot.confidence >= 0.4
										? "default"
										: "default"
							}
						>
							{(snapshot.confidence * 100).toFixed(0)}%
						</Badge>
					</div>
				</div>

				<div>
					<div className="text-sm">Disagreement</div>
					<div className="mt-1">
						<Badge variant={snapshot.disagreement > 0.5 ? "danger" : "default"}>
							{(snapshot.disagreement * 100).toFixed(0)}%
						</Badge>
					</div>
				</div>

				<div>
					<div className="text-sm">Participation Quality</div>
					<div className="mt-1">
						<Badge
							variant={
								snapshot.participation_quality >= 0.5 ? "success" : "default"
							}
						>
							{(snapshot.participation_quality * 100).toFixed(0)}%
						</Badge>
					</div>
				</div>

				<div>
					<div className="text-sm">Integrity Risk</div>
					<div className="mt-1">
						<Badge
							variant={snapshot.integrity_risk >= 0.5 ? "danger" : "default"}
						>
							{(snapshot.integrity_risk * 100).toFixed(0)}%
						</Badge>
					</div>
				</div>

				<div>
					<div className="text-sm">Active Wallets</div>
					<div className="mt-1 text-xl font-bold">{snapshot.active_wallets}</div>
				</div>
			</CardContent>
		</Card>
	);
}
