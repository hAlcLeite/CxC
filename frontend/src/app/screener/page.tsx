"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState, Button, Card, CardContent } from "@/components/ui";
import { ScreenerTable } from "@/components/screener/ScreenerTable";
import { useScreener } from "@/lib/hooks";
import { RunPipelineModal } from "@/components/pipeline/RunPipelineModal";
import type { ScreenerMarket } from "@/lib/types";

type SortField = keyof ScreenerMarket;
type SortDir = "asc" | "desc";

function sortMarkets(
  markets: ScreenerMarket[],
  sortField: SortField,
  sortDir: SortDir
): ScreenerMarket[] {
  return [...markets].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal ?? "");
    const bStr = String(bVal ?? "");
    return sortDir === "asc"
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });
}

function ScreenerContent() {
  const searchParams = useSearchParams();
  const limitParam = searchParams.get("limit");
  const minConfidenceParam = searchParams.get("minConfidence");

  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const minConfidence = minConfidenceParam ? parseFloat(minConfidenceParam) : 0;

  const { data, isLoading, error } = useScreener({ limit, minConfidence });
  const [showPipelineModal, setShowPipelineModal] = useState(false);

  const [sortField, setSortField] = useState<SortField>("divergence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const markets = data?.markets ?? [];
  const sortedMarkets = sortMarkets(markets, sortField, sortDir);

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field as SortField);
      setSortDir("desc");
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading screener data..." />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Screener</h1>
        <Card className="border-danger">
          <CardContent className="py-8 text-center">
            <p className="text-danger">Failed to load screener data</p>
            <p className="mt-2 text-sm text-muted">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.markets.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Screener</h1>
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <h2 className="mb-2 text-xl font-bold">No Markets Found</h2>
            <p className="mb-6 text-muted">
              Run an ingest to start tracking prediction markets
            </p>
            <Button onClick={() => setShowPipelineModal(true)}>
              Ingest Data
            </Button>
          </CardContent>
        </Card>
        <RunPipelineModal
          open={showPipelineModal}
          onClose={() => setShowPipelineModal(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Screener</h1>
          <p className="mt-1 text-muted">
            {data.count} markets ranked by SmartCrowd divergence
          </p>
        </div>
      </div>

      <ScreenerTable
        markets={sortedMarkets}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
      />

      <RunPipelineModal
        open={showPipelineModal}
        onClose={() => setShowPipelineModal(false)}
      />
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading..." />}>
      <ScreenerContent />
    </Suspense>
  );
}
