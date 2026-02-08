"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui";
import { RunPipelineModal } from "@/components/pipeline/RunPipelineModal";
import { useAlerts } from "@/lib/hooks";

const navItems = [
	{ href: "/dashboard", label: "Dashboard" },
	{ href: "/screener", label: "Screener" },
	{ href: "/backtest", label: "Backtest" },
	{ href: "/alerts", label: "Alerts" },
];

export function Header() {
	const pathname = usePathname();
	const [showPipelineModal, setShowPipelineModal] = useState(false);
	const { data: alertsData } = useAlerts();

	const alertCount = alertsData?.count ?? 0;
	const isLanding = pathname === "/";

	if (isLanding) {
		return null;
	}

	return (
		<>
			<header className="border-b-2 border-foreground bg-background">
				<div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-8 gap-y-1 px-4 py-2">
					<Link href="/" className="text-xl font-bold tracking-tight">
						Precognition
					</Link>

					<nav className="order-last flex flex-wrap items-center gap-1 sm:order-none">
						{navItems.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								className={clsx(
									"px-3 py-2 font-mono text-sm transition-colors",
									"border-2 border-transparent",
									pathname === item.href
										? "border-foreground bg-foreground text-background"
										: "hover:border-foreground"
								)}
							>
								{item.label}
								{item.label === "Alerts" && alertCount > 0 && (
									<span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center border-2 border-danger px-1 text-xs leading-none tabular-nums text-danger">
										{alertCount > 99 ? "99+" : alertCount}
									</span>
								)}
							</Link>
						))}
					</nav>

					<Button size="sm" onClick={() => setShowPipelineModal(true)} className="ml-auto py-2">
						Refresh Data
					</Button>
				</div>
			</header>

			<RunPipelineModal
				open={showPipelineModal}
				onClose={() => setShowPipelineModal(false)}
			/>
		</>
	);
}
