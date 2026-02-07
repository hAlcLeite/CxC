"use client";

import { useState } from "react";
import { Button, Card, CardContent, Spinner } from "@/components/ui";
import { BacktestSummary } from "@/components/backtest/BacktestSummary";
import { EdgeBuckets } from "@/components/backtest/EdgeBuckets";
import { useRunBacktest } from "@/lib/hooks";

export default function BacktestPage() {
  const [cutoffHours, setCutoffHours] = useState(12);
  const runBacktest = useRunBacktest();

  const handleRunBacktest = () => {
    runBacktest.mutate({ cutoff_hours: cutoffHours });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Backtest</h1>
        <p className="mt-1 text-muted">
          Evaluate SmartCrowd signal performance against resolved markets
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm text-muted">
                Cutoff Hours Before Resolution
              </label>
              <input
                type="number"
                value={cutoffHours}
                onChange={(e) => setCutoffHours(Number(e.target.value))}
                min={1}
                max={168}
                className="mt-1 w-24 border-2 border-foreground bg-background px-3 py-2 font-mono"
              />
            </div>
            <Button
              onClick={handleRunBacktest}
              disabled={runBacktest.isPending}
            >
              {runBacktest.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Running...
                </span>
              ) : (
                "Run Backtest"
              )}
            </Button>
          </div>

          {runBacktest.error && (
            <div className="mt-4 border-2 border-danger p-3 text-sm text-danger">
              {runBacktest.error.message}
            </div>
          )}
        </CardContent>
      </Card>

      {runBacktest.data && (
        <>
          <BacktestSummary summary={runBacktest.data} />
          {runBacktest.data.edge_buckets ? (
            <EdgeBuckets buckets={runBacktest.data.edge_buckets} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-muted">
                  {runBacktest.data.note ?? "No edge bucket data available"}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!runBacktest.data && !runBacktest.isPending && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted">
              Run a backtest to evaluate SmartCrowd signal performance
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
