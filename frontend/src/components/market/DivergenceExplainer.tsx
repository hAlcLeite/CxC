"use client";

import { useState } from "react";
import { Card, CardContent, Button, Spinner } from "@/components/ui";
import { explainDivergence } from "@/lib/api";

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
        <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🤖</span>
                        <span className="text-sm font-medium">AI Divergence Analysis</span>
                        {wasCached && explanation && (
                            <span className="text-xs text-muted">(cached)</span>
                        )}
                    </div>

                    {!explanation && !isLoading && (
                        <Button
                            onClick={handleExplain}
                            variant="primary"
                            size="sm"
                            disabled={isLoading}
                        >
                            Explain Divergence
                        </Button>
                    )}
                </div>

                {isLoading && (
                    <div className="mt-4 flex items-center gap-2 text-muted">
                        <Spinner size="sm" />
                        <span className="text-sm">Analyzing market with AI...</span>
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">
                        {error}
                    </div>
                )}

                {explanation && (
                    <div className="mt-4">
                        <p className="text-sm leading-relaxed">{explanation}</p>
                        <button
                            onClick={handleExplain}
                            className="mt-3 text-xs text-muted hover:text-primary transition-colors"
                        >
                            ↻ Refresh explanation
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
