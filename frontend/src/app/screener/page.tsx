"use client";

import { Suspense, useMemo, useState } from "react";
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
	const [search, setSearch] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("all");

	const markets = data?.markets ?? [];

	const categories = useMemo(
		() => [...new Set(markets.map((m) => m.category).filter(Boolean))].sort(),
		[markets]
	);

	const filteredMarkets = useMemo(() => {
		let result = markets;
		if (search) {
			const q = search.toLowerCase();
			result = result.filter((m) => m.question.toLowerCase().includes(q));
		}
		if (categoryFilter !== "all") {
			result = result.filter((m) => m.category === categoryFilter);
		}
		return result;
	}, [markets, search, categoryFilter]);

	const sortedMarkets = sortMarkets(filteredMarkets, sortField, sortDir);

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
				<h1 className="text-5xl font-bold">Screener</h1>
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
				<h1 className="text-5xl font-bold">Screener</h1>
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
					<h1 className="text-5xl font-bold">Screener</h1>
					<p className="mt-5 font-bold">
						{data.count} markets ranked by precognition divergence
					</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search markets..."
					className="border-2 border-foreground bg-background px-2 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none"
				/>
				<select
					value={categoryFilter}
					onChange={(e) => setCategoryFilter(e.target.value)}
					className="border-2 border-foreground bg-background py-2 font-mono text-sm text-foreground focus:outline-none"
				>
					<option value="all">All Categories</option>
					{categories.map((cat) => (
						<option key={cat} value={cat}>
							{cat}
						</option>
					))}
				</select>
				{(search || categoryFilter !== "all") && (
					<span className="text-sm text-muted">
						{sortedMarkets.length} result{sortedMarkets.length !== 1 && "s"}
					</span>
				)}
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
