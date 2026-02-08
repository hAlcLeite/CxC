"use client";

import { useMemo, useState } from "react";
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
import { SiGraphite } from "react-icons/si";
import type { TimeSeriesPoint } from "@/lib/types";
import { format } from "date-fns";

interface ProbabilityChartProps {
	timeSeries: TimeSeriesPoint[];
}

function clamp(value: number, lower: number, upper: number): number {
	return Math.max(lower, Math.min(upper, value));
}

export function ProbabilityChart({ timeSeries }: ProbabilityChartProps) {
	const chartData = timeSeries.map((point) => ({
		time: format(new Date(point.snapshot_time), "MMM d HH:mm"),
		market: point.market_prob * 100,
		Precognition: point.precognition_prob * 100,
		divergence: point.divergence * 100,
	}));
	const [useFullScale, setUseFullScale] = useState(false);

	const zoomDomain = useMemo<[number, number]>(() => {
		if (!chartData.length) {
			return [0, 100];
		}
		const values = chartData.flatMap((point) => [point.market, point.Precognition]);
		const minVal = Math.min(...values);
		const maxVal = Math.max(...values);
		const spread = maxVal - minVal;
		if (spread >= 70) {
			return [0, 100];
		}

		const minVisibleSpread = 4.0;
		const paddedSpread = Math.max(spread * 1.6, minVisibleSpread);
		const center = (minVal + maxVal) / 2;

		let domainMin = center - paddedSpread / 2;
		let domainMax = center + paddedSpread / 2;

		if (domainMin < 0) {
			domainMax -= domainMin;
			domainMin = 0;
		}
		if (domainMax > 100) {
			domainMin -= domainMax - 100;
			domainMax = 100;
		}

		domainMin = clamp(domainMin, 0, 100);
		domainMax = clamp(domainMax, 0, 100);
		if (domainMax - domainMin < minVisibleSpread) {
			const middle = (domainMin + domainMax) / 2;
			domainMin = clamp(middle - minVisibleSpread / 2, 0, 100);
			domainMax = clamp(middle + minVisibleSpread / 2, 0, 100);
		}

		return [domainMin, domainMax];
	}, [chartData]);
	const yDomain: [number, number] = useFullScale ? [0, 100] : zoomDomain;

	return (
		<Card header>
			<div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-4">
				<CardTitle className="card-header-title"><SiGraphite /> Probability Over Time</CardTitle>
			</div>
			<CardContent className="p-4">
				<div className="mb-4 flex items-center justify-between">
					<div className="text-sm">
						{useFullScale ? "Full Scale (0-100%)" : "Focused Scale"}
					</div>
					<div className="inline-flex border-2 border-foreground p-0.5">
						<button
							type="button"
							onClick={() => setUseFullScale(false)}
							className={`px-3 py-1 text-xs font-mono transition-colors ${!useFullScale
								? "bg-foreground text-background"
								: "bg-background text-foreground hover:bg-foreground hover:text-background"
								}`}
						>
							Focused
						</button>
						<button
							type="button"
							onClick={() => setUseFullScale(true)}
							className={`px-3 py-1 text-xs font-mono transition-colors ${useFullScale
								? "bg-foreground text-background"
								: "bg-background text-foreground hover:bg-foreground hover:text-background"
								}`}
						>
							Full 0-100
						</button>
					</div>
				</div>
				<div className="h-80">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={chartData}>
							<XAxis
								dataKey="time"
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
							/>
							<YAxis
								domain={yDomain}
								stroke="#666666"
								tick={{ fill: "#666666", fontSize: 12 }}
								tickLine={{ stroke: "#666666" }}
								tickFormatter={(value) => `${value}%`}
							/>
							<Tooltip
								contentStyle={{
									background: "#0a0a0a",
									border: "2px solid #ededed",
									borderRadius: 0,
								}}
								labelStyle={{ color: "#ededed" }}
								itemStyle={{ color: "#ededed" }}
							/>
							<Legend
								wrapperStyle={{ color: "#ededed" }}
							/>
							<Line
								type="monotone"
								dataKey="market"
								name="Market"
								stroke="#666666"
								strokeWidth={2}
								dot={false}
							/>
							<Line
								type="monotone"
								dataKey="Precognition"
								name="Precognition"
								stroke="#ededed"
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
