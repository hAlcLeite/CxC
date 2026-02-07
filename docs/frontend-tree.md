# Frontend File Tree

```
frontend/
├── package.json                    # Next.js 16, React 19, TypeScript 5, Tailwind 4, React Query, Recharts
├── next.config.ts                  # React Compiler enabled
├── tsconfig.json                   # strict mode, path alias @/* -> ./src/*
├── DESIGN.md                       # NeoBrutalistic dark-mode design system spec
│
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── layout.tsx              # root layout: Geist Mono font, QueryProvider, Header, Sonner toasts
│   │   ├── globals.css             # Tailwind imports, CSS vars (--background, --foreground, --success, --danger)
│   │   ├── page.tsx                # dashboard: backend health, market counts, nav cards to features
│   │   │
│   │   ├── screener/
│   │   │   └── page.tsx            # sortable market table with search params (limit, min confidence)
│   │   │
│   │   ├── markets/
│   │   │   └── [marketId]/
│   │   │       └── page.tsx        # market detail: snapshot metrics, probability chart, top drivers, flow
│   │   │
│   │   ├── wallets/
│   │   │   └── [wallet]/
│   │   │       └── page.tsx        # wallet profile: metrics + weights, or trade summary fallback
│   │   │
│   │   ├── alerts/
│   │   │   └── page.tsx            # alerts grouped by type with counts and timestamps
│   │   │
│   │   └── backtest/
│   │       ├── page.tsx            # backtest runner: cutoff hours input, results + edge buckets
│   │       └── [runId]/
│   │           └── page.tsx        # backtest detail for a specific run ID
│   │
│   ├── components/
│   │   ├── ui/                     # base design system primitives
│   │   │   ├── index.ts            # re-exports all UI components
│   │   │   ├── Button.tsx          # 3 variants (primary, secondary, ghost), 3 sizes (sm, md, lg)
│   │   │   ├── Card.tsx            # container with optional hover; CardHeader, CardTitle, CardContent
│   │   │   ├── Badge.tsx           # inline label: 4 variants (default, success, danger, muted)
│   │   │   ├── Spinner.tsx         # animated loader (sm, md, lg) + LoadingState wrapper
│   │   │   └── Table.tsx           # Table, TableHeader, TableBody, TableRow, TableHead, TableCell
│   │   │
│   │   ├── layout/
│   │   │   └── Header.tsx          # nav bar: logo, route links, refresh button, alert count badge
│   │   │
│   │   ├── screener/
│   │   │   ├── ScreenerTable.tsx   # sortable market table: question, divergence bar, confidence, probs
│   │   │   └── DivergenceBar.tsx   # centered bar: left=negative/red, right=positive/green
│   │   │
│   │   ├── market/
│   │   │   ├── SnapshotPanel.tsx   # grid of latest snapshot metrics (divergence, probs, risk, wallets)
│   │   │   ├── ProbabilityChart.tsx # Recharts line chart: market vs SmartCrowd prob over time
│   │   │   └── TopDriversTable.tsx # top contributing wallets: weight, belief, contribution, linked
│   │   │
│   │   ├── wallet/
│   │   │   ├── WalletMetrics.tsx   # metrics table: Brier, calibration, ROI, style (contrarian/early/concentrated)
│   │   │   ├── WalletWeights.tsx   # trust weight table: final, raw, shrunk by category/horizon
│   │   │   └── WalletTradeSummary.tsx  # fallback: trade count, volume, avg price + 20 recent trades
│   │   │
│   │   ├── alerts/
│   │   │   ├── AlertsList.tsx      # alert cards container with toast on new alerts, empty state
│   │   │   └── AlertCard.tsx       # single alert: type badge, category, timestamp, market link, detail
│   │   │
│   │   ├── backtest/
│   │   │   ├── BacktestSummary.tsx # run stats: Brier scores, improvement %, handles zero-market case
│   │   │   └── EdgeBuckets.tsx     # edge distribution table: bucket, count, avg edge, avg PnL, win rate
│   │   │
│   │   └── pipeline/
│   │       └── RunPipelineModal.tsx # modal: Quick Refresh (recompute) or Full Ingest (fetch + recompute)
│   │
│   ├── lib/
│   │   ├── api.ts                  # centralized fetch client: all endpoint functions, error handling
│   │   ├── types.ts                # TypeScript interfaces for every API response and data model
│   │   └── hooks/                  # React Query hooks wrapping api.ts
│   │       ├── index.ts            # re-exports all hooks
│   │       ├── useScreener.ts      # screener query, 10min stale time
│   │       ├── useMarket.ts        # market detail query, 10min stale, conditional
│   │       ├── useWallet.ts        # wallet profile query, 1hr stale time
│   │       ├── useAlerts.ts        # alerts query, 1min stale, 60s refetch polling
│   │       ├── useBacktest.ts      # backtest query + runBacktest mutation with cache invalidation
│   │       └── usePipeline.ts      # health query, ingest mutation, recompute mutation, cache invalidation
│   │
│   └── providers/
│       └── QueryProvider.tsx       # React Query client: 10min stale, 30min GC, retry once, no window refetch
```
