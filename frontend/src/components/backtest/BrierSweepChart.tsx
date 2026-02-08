"use client";

import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import { Card, CardTitle, CardContent } from "@/components/ui";
import type { SweepHourlyResult } from "@/lib/types";

interface BrierSweepChartProps {
	hourlyResults: SweepHourlyResult[];
}

export function BrierSweepChart({ hourlyResults }: BrierSweepChartProps) {
	const chartData = hourlyResults
		.filter((r) => r.total_markets > 0)
		.sort((a, b) => b.cutoff_hours - a.cutoff_hours)
		.map((r) => ({
			cutoff_hours: r.cutoff_hours,
			precognition: r.precognition_brier,
			market: r.market_brier,
		}));

	return (
		<Card>
			<CardTitle>Brier Score Over Time</CardTitle>
			<CardContent className="mt-4">
				<div className="h-80">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={chartData}>
							<XAxis
								dataKey="cutoff_hours"
								reversed
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
								label={{
									value: "Hours Before Resolution",
									position: "insideBottom",
									offset: -5,
									fill: "#666666",
									fontSize: 12,
								}}
							/>
							<YAxis
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
								tickFormatter={(v) => Number(v).toFixed(3)}
							/>
							<Tooltip
								contentStyle={{
									background: "#0a0a0a",
									border: "2px solid #ededed",
									borderRadius: 0,
								}}
								labelStyle={{ color: "#ededed" }}
								itemStyle={{ color: "#ededed" }}
								labelFormatter={(v) => `${v}h before resolution`}
								formatter={(value) => value != null ? Number(value).toFixed(4) : ""}
							/>
							<Legend wrapperStyle={{ color: "#ededed" }} />
							<Line
								type="monotone"
								dataKey="precognition"
								name="Precognition"
								stroke="#ededed"
								strokeWidth={2}
								dot={false}
							/>
							<Line
								type="monotone"
								dataKey="market"
								name="Market"
								stroke="#666666"
								strokeWidth={2}
								dot={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
