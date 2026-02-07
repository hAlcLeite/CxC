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
import type { TimeSeriesPoint } from "@/lib/types";
import { format } from "date-fns";

interface ProbabilityChartProps {
  timeSeries: TimeSeriesPoint[];
}

export function ProbabilityChart({ timeSeries }: ProbabilityChartProps) {
  const chartData = timeSeries.map((point) => ({
    time: format(new Date(point.snapshot_time), "MMM d HH:mm"),
    market: point.market_prob * 100,
    smartcrowd: point.smartcrowd_prob * 100,
    divergence: point.divergence * 100,
  }));

  return (
    <Card>
      <CardTitle>Probability Over Time</CardTitle>
      <CardContent className="mt-4">
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
                domain={[0, 100]}
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
                dataKey="smartcrowd"
                name="SmartCrowd"
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
