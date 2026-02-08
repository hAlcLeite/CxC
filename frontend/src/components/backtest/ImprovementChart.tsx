"use client";

import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	ReferenceLine,
} from "recharts";
import { Card, CardTitle, CardContent } from "@/components/ui";
import type { SweepHourlyResult } from "@/lib/types";

interface ImprovementChartProps {
	hourlyResults: SweepHourlyResult[];
}

export function ImprovementChart({ hourlyResults }: ImprovementChartProps) {
	const chartData = hourlyResults
		.filter((r) => r.total_markets > 0)
		.sort((a, b) => b.cutoff_hours - a.cutoff_hours)
		.map((r) => ({
			cutoff_hours: r.cutoff_hours,
			improvement_pct: r.brier_improvement_pct,
		}));

	return (
		<Card>
			<CardTitle>Brier Improvement %</CardTitle>
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
								labelFormatter={(v) => `${v}h before resolution`}
								formatter={(value) => value != null ? `${Number(value).toFixed(2)}%` : ""}
							/>
							<ReferenceLine
								y={0}
								stroke="#666666"
								strokeDasharray="3 3"
							/>
							<Line
								type="monotone"
								dataKey="improvement_pct"
								name="Improvement"
								stroke="#22c55e"
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
