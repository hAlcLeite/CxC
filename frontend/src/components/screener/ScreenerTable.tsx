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

export function ScreenerTable({
	markets,
	sortField,
	sortDir,
	onSort,
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
						<TableCell>
							<Badge>
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
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
