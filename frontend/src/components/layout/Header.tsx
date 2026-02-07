"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui";
import { RunPipelineModal } from "@/components/pipeline/RunPipelineModal";
import { useAlerts } from "@/lib/hooks";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/screener", label: "Screener" },
  { href: "/backtest", label: "Backtest" },
  { href: "/alerts", label: "Alerts" },
];

export function Header() {
  const pathname = usePathname();
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const { data: alertsData } = useAlerts();

  const alertCount = alertsData?.count ?? 0;

  return (
    <>
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold tracking-tight">
              SMARTCROWD
            </Link>

            <nav className="flex items-center gap-1">
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
                    <span className="ml-2 inline-flex h-5 w-5 items-center justify-center border-2 border-danger text-xs text-danger">
                      {alertCount > 99 ? "99+" : alertCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>

          <Button size="sm" onClick={() => setShowPipelineModal(true)}>
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
