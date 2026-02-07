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

const landingNavItems = [
  { href: "#features", label: "Features" },
  { href: "#visualization", label: "Visualization" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "#tracks", label: "Tracks" },
  { href: "#demo", label: "Demo" },
];

export function Header() {
  const pathname = usePathname();
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const { data: alertsData } = useAlerts();

  const alertCount = alertsData?.count ?? 0;
  const isLanding = pathname === "/";
  const signInHref = "#demo";

  return (
    <>
      <header className="border-b-2 border-foreground bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold tracking-tight">
              SMARTCROWD
            </Link>

            <nav className="flex items-center gap-1">
              {(isLanding ? landingNavItems : navItems).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "px-3 py-2 font-mono text-sm transition-colors",
                    "border-2 border-transparent",
                    !isLanding && pathname === item.href
                      ? "border-foreground bg-foreground text-background"
                      : "hover:border-foreground"
                  )}
                >
                  {item.label}
                  {!isLanding && item.label === "Alerts" && alertCount > 0 && (
                    <span className="ml-2 inline-flex h-5 w-5 items-center justify-center border-2 border-danger text-xs text-danger">
                      {alertCount > 99 ? "99+" : alertCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>

          {isLanding ? (
            <Link href={signInHref}>
              <Button size="sm" variant="secondary">Sign In</Button>
            </Link>
          ) : (
            <Button size="sm" onClick={() => setShowPipelineModal(true)}>
              Refresh Data
            </Button>
          )}
        </div>
      </header>

      {!isLanding && (
        <RunPipelineModal
          open={showPipelineModal}
          onClose={() => setShowPipelineModal(false)}
        />
      )}
    </>
  );
}
