"use client";

import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import { Card, CardTitle, CardContent } from "@/components/ui";
import type { EdgeBucket } from "@/lib/types";

interface EdgeBucketsChartProps {
	buckets: EdgeBucket[];
	selectedHour?: number;
}

export function EdgeBucketsChart({ buckets, selectedHour }: EdgeBucketsChartProps) {
	const chartData = buckets.map((b) => ({
		bucket: b.bucket,
		avg_edge: b.avg_edge * 100,
		avg_pnl: b.avg_pnl * 100,
		win_rate: b.win_rate * 100,
	}));

	const title = selectedHour
		? `Edge Buckets (${selectedHour}h cutoff)`
		: "Edge Buckets";

	return (
		<Card>
			<CardTitle>{title}</CardTitle>
			<CardContent className="mt-4">
				<div className="h-64">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={chartData}>
							<XAxis
								dataKey="bucket"
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
							/>
							<YAxis
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
								tickFormatter={(v) => `${v}%`}
							/>
							<Tooltip
								contentStyle={{
									background: "#0a0a0a",
									border: "2px solid #ededed",
									borderRadius: 0,
								}}
								labelStyle={{ color: "#ededed" }}
								itemStyle={{ color: "#ededed" }}
								formatter={(value) => value != null ? `${Number(value).toFixed(2)}%` : ""}
							/>
							<Legend wrapperStyle={{ color: "#ededed" }} />
							<Bar dataKey="avg_edge" name="Avg Edge" fill="#ededed" />
							<Bar dataKey="avg_pnl" name="Avg PnL" fill="#22c55e" />
							<Bar dataKey="win_rate" name="Win Rate" fill="#666666" />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
