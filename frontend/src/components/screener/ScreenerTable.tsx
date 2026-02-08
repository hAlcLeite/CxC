"use client";

import Link from "next/link";
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	Badge,
} from "@/components/ui";
import { DivergenceBar } from "./DivergenceBar";
import type { ScreenerMarket } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

interface ScreenerTableProps {
	markets: ScreenerMarket[];
	sortField?: string;
	sortDir?: "asc" | "desc";
	onSort?: (field: string) => void;
	watchedMarketIds?: Set<string>;
	onToggleWatchlist?: (marketId: string) => void;
}

function formatCategoryLabel(value: string): string {
	return value
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function SortableHeader({
	field,
	label,
	currentSort,
	sortDir,
	onSort,
}: {
	field: string;
	label: string;
	currentSort?: string;
	sortDir?: "asc" | "desc";
	onSort?: (field: string) => void;
}) {
	const isActive = currentSort === field;

	return (
		<TableHead
			className={onSort ? "cursor-pointer hover:bg-foreground/5" : ""}
			onClick={() => onSort?.(field)}
		>
			<span className="flex items-center gap-1">
				{label}
				{isActive && (
					<span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
				)}
			</span>
		</TableHead>
	);
}

function EyeIcon({ active }: { active: boolean }) {
	if (active) {
		return (
			<svg
				viewBox="0 0 24 24"
				className="h-4 w-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				aria-hidden="true"
			>
				<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		);
	}

	return (
		<svg
			viewBox="0 0 24 24"
			className="h-4 w-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M3 3l18 18" />
			<path d="M10.6 10.7A3 3 0 0 0 9 12a3 3 0 0 0 4.3 2.7" />
			<path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.2 0 10 7 10 7a16.3 16.3 0 0 1-3.3 4.1" />
			<path d="M6.6 6.7C4.6 8.1 3.2 10.4 2 12c0 0 3.8 7 10 7 1.8 0 3.4-.5 4.9-1.3" />
		</svg>
	);
}

export function ScreenerTable({
	markets,
	sortField,
	sortDir,
	onSort,
	watchedMarketIds,
	onToggleWatchlist,
}: ScreenerTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<SortableHeader
						field="question"
						label="Market"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<SortableHeader
						field="category"
						label="Category"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<SortableHeader
						field="divergence"
						label="Divergence"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<SortableHeader
						field="confidence"
						label="Confidence"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<SortableHeader
						field="market_prob"
						label="Market"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<SortableHeader
						field="precognition_prob"
						label="Precognition"
						currentSort={sortField}
						sortDir={sortDir}
						onSort={onSort}
					/>
					<TableHead>Updated</TableHead>
					<TableHead className="text-center">Watch</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{markets.map((market) => (
					<TableRow key={market.market_id}>
						<TableCell className="max-w-xs">
							<Link
								href={`/markets/${market.market_id}`}
								className="block truncate hover:underline"
							>
								{market.question}
							</Link>
						</TableCell>
						<TableCell className="max-w-[13rem]">
							<Badge
								className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
								title={market.category ? formatCategoryLabel(market.category) : "—"}
							>
								{market.category ? formatCategoryLabel(market.category) : "—"}
							</Badge>
						</TableCell>
						<TableCell>
							<DivergenceBar divergence={market.divergence} />
						</TableCell>
						<TableCell>
							<span
								className={
									market.confidence >= 0.7
										? "text-success"
										: market.confidence >= 0.4
											? "text-foreground"
											: "text-muted"
								}
							>
								{(market.confidence * 100).toFixed(0)}%
							</span>
						</TableCell>
						<TableCell>{(market.market_prob * 100).toFixed(1)}%</TableCell>
						<TableCell>{(market.precognition_prob * 100).toFixed(1)}%</TableCell>
						<TableCell className="text-muted">
							{formatDistanceToNow(new Date(market.snapshot_time), {
								addSuffix: true,
							})}
						</TableCell>
						<TableCell className="text-center">
							<button
								type="button"
								onClick={() => onToggleWatchlist?.(market.market_id)}
								className={`mx-auto flex h-8 w-8 items-center justify-center border-2 transition-colors ${
									watchedMarketIds?.has(market.market_id)
										? "border-foreground bg-foreground text-background"
										: "border-foreground bg-background text-foreground hover:bg-foreground hover:text-background"
								}`}
								aria-label={
									watchedMarketIds?.has(market.market_id)
										? "Remove from watchlist"
										: "Add to watchlist"
								}
								title={
									watchedMarketIds?.has(market.market_id)
										? "Remove from watchlist"
										: "Add to watchlist"
								}
							>
								<EyeIcon active={Boolean(watchedMarketIds?.has(market.market_id))} />
							</button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
