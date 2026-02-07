"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, Button, Spinner } from "@/components/ui";
import { explainDivergence } from "@/lib/api";
import styles from "./DivergenceExplainer.module.css";

interface DivergenceExplainerProps {
    marketId: string;
    divergence: number;
}

/**
 * AI-powered divergence explainer component.
 * Shows "🤖 Explain Divergence" button when divergence > 3%.
 * Rate limited to 1 call per minute per market (server-side).
 * Cached for 5 minutes (server-side).
 */
export function DivergenceExplainer({
    marketId,
    divergence,
}: DivergenceExplainerProps) {
    const [explanation, setExplanation] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wasCached, setWasCached] = useState(false);

    // Only show if divergence > 3%
    if (Math.abs(divergence) <= 0.03) {
        return null;
    }

    const handleExplain = async () => {
        setIsLoading(true);
        setError(null);
        setExplanation(null);

        try {
            const result = await explainDivergence(marketId);
            setExplanation(result.explanation);
            setWasCached(result.cached);
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : "Failed to get explanation";
            // Check for rate limit error
            if (errorMessage.includes("429") || errorMessage.includes("wait")) {
                setError("Please wait a moment before requesting another explanation.");
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card
            className="overflow-hidden border-border bg-background"
            style={{ padding: 0 }}
        >
            <CardContent className="p-0">
                <div className="grid h-8 grid-cols-[1fr_auto] items-stretch sm:grid-cols-[minmax(220px,max-content)_1fr_auto]">
                    <div className="flex h-full items-center gap-2 bg-foreground px-3 text-xs font-medium uppercase tracking-[0.08em] text-background sm:text-sm">
                        AI Divergence Analysis
                    </div>

                    <div className="hidden h-full items-center px-3 text-xs uppercase tracking-[0.07em] text-muted sm:flex">
                        {isLoading
                            ? "Analyzing market signal"
                            : wasCached && explanation
                              ? "Cached response"
                              : "Model-assisted divergence read"}
                    </div>

                    <div className="h-full min-w-[168px] border-l border-border">
                        <Button
                            onClick={handleExplain}
                            variant="ghost"
                            disabled={isLoading}
                            className={`group !flex !h-full !min-h-0 !w-full !items-center !justify-center !gap-2 !border-0 !bg-background !px-3 !py-0 text-xs uppercase tracking-[0.08em] text-foreground hover:!bg-foreground hover:!text-background sm:text-sm ${styles.explainButton}`}
                        >
                            <span className={styles.geminiIcon} aria-hidden="true">
                                <Image
                                    src="/logos/gemini.png"
                                    alt=""
                                    width={14}
                                    height={14}
                                    className={styles.geminiLogo}
                                />
                                <span className={styles.geminiGlow} />
                            </span>
                            {isLoading
                                ? "Analyzing..."
                                  : explanation
                                    ? "Refresh Explanation"
                                  : "Explain Divergence"}
                        </Button>
                    </div>
                </div>

                {isLoading && (
                    <div className="flex items-center gap-2 px-3 py-3 text-muted">
                        <Spinner size="sm" />
                        <span className="text-sm">Analyzing market with AI...</span>
                    </div>
                )}

                {error && (
                    <div className="m-3 rounded-md bg-danger/10 p-3 text-sm text-danger">
                        {error}
                    </div>
                )}

                {explanation && (
                    <div className="px-3 py-3">
                        <p className="text-sm leading-relaxed">{explanation}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
