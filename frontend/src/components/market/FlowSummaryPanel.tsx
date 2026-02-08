import {
	Table,
	TableBody,
	TableRow,
	TableCell,
	Card,
	CardTitle,
	CardContent,
} from "@/components/ui";
import type { FlowSummary } from "@/lib/types";
import { PiFlowArrowLight } from "react-icons/pi";

interface FlowSummaryPanelProps {
	flowSummary: FlowSummary;
	explanation: string;
	confidence: number;
	disagreement: number;
	integrityRisk: number;
}

export function FlowSummaryPanel({
	flowSummary,
	explanation,
	confidence,
	disagreement,
	integrityRisk,
}: FlowSummaryPanelProps) {
	const netFlow = flowSummary.net_yes_flow_size;
	const flowColor =
		netFlow > 0 ? "text-success" : netFlow < 0 ? "text-danger" : "";
	const integrityColor =
		integrityRisk >= 0.65
			? "text-danger"
			: integrityRisk >= 0.35
				? "text-warning"
				: "text-success";

	return (
		<Card header>
			<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
				<CardTitle className="card-header-title">
					<PiFlowArrowLight /> Flow Summary
				</CardTitle>
			</div>
			<CardContent className="p-4">
				<Table>
					<TableBody>
						<TableRow>
							<TableCell className="font-bold">
								Net YES Flow
							</TableCell>
							<TableCell className={flowColor}>
								{netFlow > 0 ? "+" : ""}
								{netFlow.toFixed(2)}
							</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-bold">
								Trade Count
							</TableCell>
							<TableCell>{flowSummary.trade_count}</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-bold">
								Confidence
							</TableCell>
							<TableCell>
								{(confidence * 100).toFixed(1)}%
							</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-bold">
								Disagreement
							</TableCell>
							<TableCell>
								{(disagreement * 100).toFixed(1)}%
							</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-bold">
								Integrity Risk
							</TableCell>
							<TableCell className={integrityColor}>
								{(integrityRisk * 100).toFixed(1)}%
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
				<p className="mt-4 text-sm font-bold">{explanation}</p>
			</CardContent>
		</Card>
	);
}
