"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState, Button, Card, CardContent } from "@/components/ui";
import { ScreenerTable } from "@/components/screener/ScreenerTable";
import { useScreener } from "@/lib/hooks";
import { RunPipelineModal } from "@/components/pipeline/RunPipelineModal";
import type { ScreenerMarket } from "@/lib/types";

type SortField = keyof ScreenerMarket;
type SortDir = "asc" | "desc";
const WATCHLIST_STORAGE_KEY = "screener.watchlist.v1";

function formatCategoryLabel(value: string): string {
	return value
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

interface CategoryDropdownProps {
	categories: string[];
	value: string;
	onChange: (value: string) => void;
}

function CategoryDropdown({ categories, value, onChange }: CategoryDropdownProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current) return;
			const target = event.target as Node | null;
			if (target && !rootRef.current.contains(target)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, []);

	const options = ["all", ...categories];
	const selectedLabel =
		value === "all" ? "All Categories" : formatCategoryLabel(value);

	return (
		<div ref={rootRef} className="relative w-full sm:w-auto">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="flex h-10 w-full min-w-[190px] items-center justify-between border-2 border-foreground bg-background px-3 font-mono text-sm text-foreground transition-colors hover:bg-foreground hover:text-background sm:w-auto"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<span>{selectedLabel}</span>
				<span className="text-xl leading-none" aria-hidden="true">
					{open ? "▴" : "▾"}
				</span>
			</button>

			{open && (
				<div className="absolute left-0 top-full z-20 mt-1 min-w-full border-2 border-foreground bg-background">
					<ul role="listbox" className="max-h-64 overflow-y-auto">
						{options.map((option) => {
							const isSelected = value === option;
							const label =
								option === "all" ? "All Categories" : formatCategoryLabel(option);
							return (
								<li key={option}>
									<button
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => {
											onChange(option);
											setOpen(false);
										}}
										className={`w-full px-3 py-2 text-left font-mono text-sm ${
											isSelected
												? "bg-foreground text-background"
												: "bg-background text-foreground hover:bg-foreground hover:text-background"
										}`}
									>
										{label}
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}

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
	const [activeTab, setActiveTab] = useState<"all" | "watchlist">("all");
	const [watchlistIds, setWatchlistIds] = useState<string[]>(() => {
		if (typeof window === "undefined") return [];
		try {
			const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed)
				? parsed.filter((id) => typeof id === "string")
				: [];
		} catch {
			return [];
		}
	});

	const markets = useMemo(() => data?.markets ?? [], [data]);
	const watchlistSet = useMemo(() => new Set(watchlistIds), [watchlistIds]);

	useEffect(() => {
		window.localStorage.setItem(
			WATCHLIST_STORAGE_KEY,
			JSON.stringify(watchlistIds)
		);
	}, [watchlistIds]);

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
		if (activeTab === "watchlist") {
			result = result.filter((m) => watchlistSet.has(m.market_id));
		}
		return result;
	}, [markets, search, categoryFilter, activeTab, watchlistSet]);

	const sortedMarkets = sortMarkets(filteredMarkets, sortField, sortDir);

	const handleSort = (field: string) => {
		if (field === sortField) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			setSortField(field as SortField);
			setSortDir("desc");
		}
	};

	const handleToggleWatchlist = (marketId: string) => {
		setWatchlistIds((prev) =>
			prev.includes(marketId)
				? prev.filter((id) => id !== marketId)
				: [...prev, marketId]
		);
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

			<div className="inline-flex border-2 border-foreground">
				<button
					type="button"
					onClick={() => setActiveTab("all")}
					className={`px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] ${
						activeTab === "all"
							? "bg-foreground text-background"
							: "bg-background text-foreground hover:bg-foreground hover:text-background"
					}`}
				>
					All Markets
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("watchlist")}
					className={`border-l-2 border-foreground px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] ${
						activeTab === "watchlist"
							? "bg-foreground text-background"
							: "bg-background text-foreground hover:bg-foreground hover:text-background"
					}`}
				>
					Watchlist ({watchlistIds.length})
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search markets..."
					className="w-full border-2 border-foreground bg-background px-2 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none sm:w-64"
				/>
				<CategoryDropdown
					categories={categories}
					value={categoryFilter}
					onChange={setCategoryFilter}
				/>
				{(search || categoryFilter !== "all") && (
					<span className="text-sm text-muted">
						{sortedMarkets.length} result{sortedMarkets.length !== 1 && "s"}
					</span>
				)}
			</div>

			<Card className="border-dashed py-8 text-center sm:hidden">
				<p className="text-muted">Enjoy the best experience on Desktop</p>
			</Card>

			<div className="hidden sm:block">
				<ScreenerTable
					markets={sortedMarkets}
					sortField={sortField}
					sortDir={sortDir}
					onSort={handleSort}
					watchedMarketIds={watchlistSet}
					onToggleWatchlist={handleToggleWatchlist}
				/>
			</div>

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
