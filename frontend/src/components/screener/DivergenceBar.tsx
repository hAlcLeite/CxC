import clsx from "clsx";

interface DivergenceBarProps {
	divergence: number;
	maxDivergence?: number;
}

export function DivergenceBar({
	divergence,
	maxDivergence = 0.2,
}: DivergenceBarProps) {
	const percentage = Math.min(Math.abs(divergence) / maxDivergence, 1) * 100;
	const isPositive = divergence > 0;
	const isNearZero = Math.abs(divergence) < 0.02;

	return (
		<div className="flex items-center gap-2">
			<div className="relative h-4 w-24 border-2 border-foreground">
				<div className="absolute inset-0 flex">
					{/* Left half (negative) */}
					<div className="relative w-1/2 border-r border-foreground/30">
						{!isPositive && !isNearZero && (
							<div
								className={clsx(
									"absolute right-0 top-0 h-full",
									"bg-danger"
								)}
								style={{ width: `${percentage}%` }}
							/>
						)}
					</div>
					{/* Right half (positive) */}
					<div className="relative w-1/2">
						{isPositive && !isNearZero && (
							<div
								className={clsx(
									"absolute left-0 top-0 h-full",
									"bg-success"
								)}
								style={{ width: `${percentage}%` }}
							/>
						)}
					</div>
				</div>
			</div>
			<span
				className={clsx(
					"w-16 text-right font-mono text-sm text-white",
					isNearZero ? "text-muted" : isPositive ? "text-success" : "text-danger"
				)}
			>
				{isPositive ? "+" : ""}
				{(divergence * 100).toFixed(1)}%
			</span>
		</div>
	);
}
