"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, Button, Spinner } from "@/components/ui";
import { fetchMarketSentiment, type SentimentResponse } from "@/lib/api";

interface SentimentCardProps {
    marketId: string;
    autoLoad?: boolean;
}

/**
 * Snowflake-powered public sentiment analyzer component.
 * Neobrutalist design: black/white, sharp corners, hover effects.
 */
export function SentimentCard({ marketId, autoLoad = false }: SentimentCardProps) {
    const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (autoLoad) {
            handleFetchSentiment();
        }
    }, [marketId, autoLoad]);

    const handleFetchSentiment = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await fetchMarketSentiment(marketId);
            setSentiment(result);
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : "Failed to analyze sentiment";
            if (errorMessage.includes("429") || errorMessage.includes("wait")) {
                setError("Please wait 30 seconds before requesting again.");
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Sentiment indicator - monochrome with intensity
    const getSentimentIndicator = (score: number): string => {
        if (score > 0.15) return "▲";
        if (score < -0.15) return "▼";
        return "●";
    };

    const getSentimentLabel = (score: number): string => {
        if (score > 0.3) return "VERY BULLISH";
        if (score > 0.15) return "BULLISH";
        if (score < -0.3) return "VERY BEARISH";
        if (score < -0.15) return "BEARISH";
        return "NEUTRAL";
    };

    return (
        <Card className="border-2 border-white bg-black">
            <CardContent className="py-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-bold tracking-tight">PUBLIC SENTIMENT</span>
                        <span className="border border-white px-2 py-0.5 text-xs font-mono">
                            SNOWFLAKE
                        </span>
                        {sentiment?.cached && (
                            <span className="text-xs text-white/50">[CACHED]</span>
                        )}
                    </div>

                    {!sentiment && !isLoading && (
                        <button
                            onClick={handleFetchSentiment}
                            disabled={isLoading}
                            className="border-2 border-white bg-black px-4 py-1.5 text-sm font-bold uppercase tracking-wide transition-all hover:bg-white hover:text-black"
                        >
                            Analyze News
                        </button>
                    )}
                </div>

                {isLoading && (
                    <div className="mt-4 flex items-center gap-3">
                        <Spinner size="sm" />
                        <span className="text-sm font-mono">FETCHING NEWS DATA...</span>
                    </div>
                )}

                {error && (
                    <div className="mt-4 border-2 border-white bg-white/10 p-3 text-sm">
                        {error}
                    </div>
                )}

                {sentiment && (
                    <div className="mt-4 space-y-4">
                        {/* Main Score Display */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <span className="text-4xl font-bold">
                                    {getSentimentIndicator(sentiment.avg_sentiment)}
                                </span>
                                <div>
                                    <div className="text-2xl font-bold tracking-tight">
                                        {getSentimentLabel(sentiment.avg_sentiment)}
                                    </div>
                                    <div className="font-mono text-sm text-white/60">
                                        SCORE: {sentiment.avg_sentiment > 0 ? "+" : ""}{sentiment.avg_sentiment.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-white/50">TOPIC</div>
                                <div className="font-mono text-sm">{sentiment.topic}</div>
                            </div>
                        </div>

                        {/* Insight Box */}
                        <div className="border-2 border-white p-4">
                            <p className="text-sm leading-relaxed">{sentiment.insight}</p>
                        </div>

                        {/* Headlines Section */}
                        {sentiment.headlines.length > 0 && (
                            <div>
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="flex w-full items-center justify-between border-2 border-white bg-black px-3 py-2 text-left font-mono text-sm transition-all hover:bg-white hover:text-black"
                                >
                                    <span>{sentiment.headlines.length} HEADLINES ANALYZED</span>
                                    <span className="text-lg">{isExpanded ? "−" : "+"}</span>
                                </button>

                                {isExpanded && (
                                    <div className="border-x-2 border-b-2 border-white">
                                        {sentiment.headlines.map((headline, idx) => (
                                            <div
                                                key={idx}
                                                className="border-t border-white/20 p-3 transition-all hover:bg-white/5"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <span className="text-lg font-bold">
                                                        {headline.sentiment > 0.15 ? "▲" : headline.sentiment < -0.15 ? "▼" : "●"}
                                                    </span>
                                                    <div className="flex-1">
                                                        {headline.link ? (
                                                            <a
                                                                href={headline.link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm underline underline-offset-2 transition-all hover:bg-white hover:text-black hover:no-underline"
                                                            >
                                                                {headline.text}
                                                            </a>
                                                        ) : (
                                                            <p className="text-sm">{headline.text}</p>
                                                        )}
                                                        <div className="mt-1 font-mono text-xs text-white/50">
                                                            {headline.sentiment > 0 ? "+" : ""}{headline.sentiment.toFixed(2)}
                                                            {headline.published && ` · ${headline.published}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Refresh Link */}
                        <button
                            onClick={handleFetchSentiment}
                            className="font-mono text-xs text-white/50 transition-all hover:text-white hover:underline"
                        >
                            ↻ REFRESH
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
