"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

type InfluenceNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  community: "A" | "B" | "C";
  centrality: number;
};

type InfluenceEdge = {
  from: string;
  to: string;
  leadLag: boolean;
};

const INFLUENCE_NODES: InfluenceNode[] = [
  { id: "n1", label: "Sports Alpha", x: 80, y: 110, size: 11, community: "A", centrality: 0.82 },
  { id: "n2", label: "Macro Drift", x: 180, y: 70, size: 8, community: "B", centrality: 0.46 },
  { id: "n3", label: "Arb Desk 19", x: 290, y: 105, size: 12, community: "C", centrality: 0.88 },
  { id: "n4", label: "Value Cluster", x: 120, y: 190, size: 9, community: "A", centrality: 0.5 },
  { id: "n5", label: "Flow Sentinel", x: 230, y: 185, size: 10, community: "B", centrality: 0.62 },
  { id: "n6", label: "Narrative Fade", x: 340, y: 170, size: 7, community: "C", centrality: 0.33 },
];

const INFLUENCE_EDGES: InfluenceEdge[] = [
  { from: "n1", to: "n5", leadLag: true },
  { from: "n5", to: "n3", leadLag: false },
  { from: "n2", to: "n3", leadLag: true },
  { from: "n4", to: "n5", leadLag: false },
  { from: "n1", to: "n4", leadLag: false },
  { from: "n3", to: "n6", leadLag: true },
  { from: "n2", to: "n5", leadLag: false },
];

function communityStyle(community: InfluenceNode["community"]) {
  if (community === "A") return { fill: "var(--foreground)", fillOpacity: 0.9 };
  if (community === "B") return { fill: "var(--foreground)", fillOpacity: 0.68 };
  return { fill: "var(--foreground)", fillOpacity: 0.46 };
}

function getNodeById(id: string) {
  return INFLUENCE_NODES.find((node) => node.id === id);
}

function DotGridBackground({ mouseX, mouseY }: { mouseX: number; mouseY: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 opacity-15"
      style={{
        maskImage: `radial-gradient(800px circle at ${mouseX * 100}% ${mouseY * 100}%, black 35%, transparent 82%)`,
        WebkitMaskImage: `radial-gradient(800px circle at ${mouseX * 100}% ${mouseY * 100}%, black 35%, transparent 82%)`,
      }}
    >
      <div
        className="h-full w-full bg-[radial-gradient(circle,_var(--foreground)_1px,transparent_1.4px)] [background-size:24px_24px]"
        style={{
          transform: `translate3d(${(mouseX - 0.5) * 18}px, ${(mouseY - 0.5) * 18}px, 0)`,
          backgroundPosition: `${mouseX * 16}px ${mouseY * 16}px`,
        }}
      />
    </div>
  );
}

export default function LandingPage() {
  const [showCommunities, setShowCommunities] = useState(true);
  const [showGlow, setShowGlow] = useState(true);
  const [showLeadLag, setShowLeadLag] = useState(true);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.34 });
  const activeNode = activeNodeId ? getNodeById(activeNodeId) : null;

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const nextX = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
      const nextY = Math.max(0, Math.min(1, event.clientY / window.innerHeight));
      setMousePos({ x: nextX, y: nextY });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  return (
    <div className="relative isolate space-y-16 pb-12">
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-20 blur-[2px] grayscale"
        >
          <source src="/bg/data-viz-bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-background/55" />
      </div>
      <DotGridBackground mouseX={mousePos.x} mouseY={mousePos.y} />

      <section
        id="top"
        className="relative z-10 flex min-h-[calc(100vh-10rem)] items-center justify-center"
      >
        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <h1 className="text-6xl font-bold tracking-tight">Precognition</h1>
          <Link href="/dashboard">
            <Button size="lg">Enter App</Button>
          </Link>
        </div>
      </section>

      <section id="features" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="text-3xl font-bold">Why It&apos;s Different</h2>
          <p className="mt-2 text-muted">
            A manipulation-aware probability model built on wallet behavior.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            "Wallet-weighted, not price-only",
            "Conditional skill by category/horizon",
            "Shrinkage + uncertainty",
            "Manipulation-aware confidence",
            "Sequence-based belief inference",
          ].map((item) => (
            <Card key={item}>
              <CardContent className="flex gap-3">
                <svg
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="16" height="16" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 10h10M10 5v10" stroke="currentColor" strokeWidth="2" />
                </svg>
                <p className="text-sm">{item}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="visualization" className="space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold">Living Influence Graph</h2>
            <p className="mt-2 text-muted">
              NetworkX computes communities + influence; the UI renders it in real-time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={showCommunities ? "primary" : "secondary"}
              onClick={() => setShowCommunities((value) => !value)}
            >
              Communities
            </Button>
            <Button
              size="sm"
              variant={showGlow ? "primary" : "secondary"}
              onClick={() => setShowGlow((value) => !value)}
            >
              Centrality Glow
            </Button>
            <Button
              size="sm"
              variant={showLeadLag ? "primary" : "secondary"}
              onClick={() => setShowLeadLag((value) => !value)}
            >
              Lead/Lag Edges
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="relative p-2">
            <svg viewBox="0 0 420 250" className="h-[280px] w-full border-2 border-foreground">
              <rect x="0" y="0" width="420" height="250" fill="var(--background)" />
              {INFLUENCE_EDGES.map((edge, index) => {
                const fromNode = getNodeById(edge.from);
                const toNode = getNodeById(edge.to);
                if (!fromNode || !toNode) return null;
                if (!showLeadLag && edge.leadLag) return null;
                const isHighlighted =
                  activeNodeId === edge.from || activeNodeId === edge.to;
                return (
                  <line
                    key={`${edge.from}-${edge.to}-${index}`}
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="var(--foreground)"
                    strokeWidth={isHighlighted ? 2.4 : 1.5}
                    strokeOpacity={isHighlighted ? 0.9 : 0.35}
                    strokeDasharray={edge.leadLag ? "6 4" : "0"}
                  />
                );
              })}

              {INFLUENCE_NODES.map((node) => {
                const isActive = node.id === activeNodeId;
                const nodeStyle = showCommunities
                  ? communityStyle(node.community)
                  : { fill: "var(--foreground)", fillOpacity: 0.8 };
                return (
                  <g key={node.id}>
                    {showGlow && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.size + 7}
                        fill="var(--foreground)"
                        fillOpacity={0.05 + node.centrality * 0.15}
                        className="animate-pulse"
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isActive ? node.size + 1.8 : node.size}
                      stroke="var(--foreground)"
                      strokeWidth={isActive ? 3 : 2}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}, centrality ${(node.centrality * 100).toFixed(0)} percent`}
                      onMouseEnter={() => setActiveNodeId(node.id)}
                      onMouseLeave={() => setActiveNodeId(null)}
                      onFocus={() => setActiveNodeId(node.id)}
                      onBlur={() => setActiveNodeId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveNodeId(node.id);
                        }
                        if (event.key === "Escape") {
                          setActiveNodeId(null);
                        }
                      }}
                      style={nodeStyle}
                      className="cursor-pointer focus:outline-none"
                    />
                    <text
                      x={node.x}
                      y={node.y + node.size + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--foreground)"
                      fillOpacity={0.8}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {activeNode && (
              <div
                className="pointer-events-none absolute border-2 border-foreground bg-background px-3 py-2 text-xs"
                style={{
                  left: `calc(${(activeNode.x / 420) * 100}% - 34px)`,
                  top: `calc(${(activeNode.y / 250) * 100}% + 6px)`,
                }}
              >
                <div className="font-bold">{activeNode.label}</div>
                <div className="text-muted">
                  Centrality {(activeNode.centrality * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section id="how-it-works" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="text-3xl font-bold">How It Works</h2>
          <p className="mt-2 text-muted">
            A short flow from raw wallet activity to a calibrated probability signal.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            "We ingest wallet-level trade flow from active prediction markets.",
            "We group wallets into cohorts by category, horizon, and historical calibration.",
            "We infer cohort belief from trading sequences and net flow, not just last price.",
            "We publish SmartCrowd Prob next to Market Prob with a short explanation.",
          ].map((step, index) => (
            <Card key={step}>
              <CardContent className="space-y-3">
                <Badge variant="muted">Step {index + 1}</Badge>
                <p className="text-sm">{step}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="space-y-3 text-sm">
            <p>
              Market implies 62%, SmartCrowd says 53% because calibrated cohorts are net selling YES.
            </p>
            <p className="text-muted">
              Confidence is higher when skilled cohorts agree and flow looks organic, and lower when activity looks thin, erratic, or potentially coordinated; research-only, not financial advice.
            </p>
          </CardContent>
        </Card>
      </section>

      <section id="tracks" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="text-3xl font-bold">Tracks We Hit</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Most Creative Data Visualization", "Living Influence Graph / Constellation Map"],
            ["Best Use of Gemini API", "Explanation agent"],
            ["Best Audio AI Hack", "Voice briefings / alerts via ElevenLabs"],
            ["Best Use of Auth0", "Login + roles + personalized alerts"],
            ["Best Use of Solana", "Tamper-evident signal attestations"],
            ["AI For Good", "Integrity shield / manipulation detection"],
          ].map(([title, detail]) => (
            <Card key={title}>
              <CardContent className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-bold">{title}</div>
                  <div className="mt-1 text-muted">{detail}</div>
                </div>
                <Badge variant="success">CHECK</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="demo" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="text-3xl font-bold">Product Preview</h2>
          <p className="mt-2 text-muted">Live-style HTML mocks using the same component system.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Market Screener</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead>Market Prob</TableHead>
                    <TableHead>SmartCrowd</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Divergence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Super Bowl winner decided by OT?", "62%", "53%", "High", "9.0%"],
                    ["Fed cuts rates before June?", "41%", "49%", "Medium", "8.0%"],
                    ["Major ETF inflow next week?", "57%", "61%", "High", "4.0%"],
                    ["Will CPI print under 2.8%?", "36%", "31%", "Medium", "5.0%"],
                    ["L2 token launches by Q3?", "68%", "60%", "Low", "8.0%"],
                  ].map((row) => (
                    <TableRow key={row[0]}>
                      <TableCell className="max-w-xs truncate">{row[0]}</TableCell>
                      <TableCell>{row[1]}</TableCell>
                      <TableCell>{row[2]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row[3] === "High" ? "success" : row[3] === "Low" ? "muted" : "default"
                          }
                        >
                          {row[3]}
                        </Badge>
                      </TableCell>
                      <TableCell>{row[4]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Market Page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="border-2 border-foreground p-3">
                <div className="mb-2 text-xs text-muted">Mini Signal Sparkline</div>
                <svg viewBox="0 0 240 60" className="h-16 w-full">
                  <path
                    d="M0 42 L30 38 L60 40 L90 28 L120 24 L150 18 L180 22 L210 16 L240 20"
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth="2"
                  />
                  <path
                    d="M0 30 L30 31 L60 34 L90 32 L120 30 L150 36 L180 37 L210 35 L240 34"
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
              <div className="border-2 border-foreground p-3">
                <div className="text-xs text-muted">Flow Summary</div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  <li>Top sports cohort reducing YES exposure</li>
                  <li>Lead wallets lagging price momentum</li>
                  <li>Uncertainty tight in 3-day horizon</li>
                </ul>
              </div>
              <div className="border-2 border-foreground p-3 text-sm">
                <div className="font-bold">What would flip it?</div>
                <p className="mt-1 text-muted">
                  Re-accumulation by high-skill wallets + cross-community buy confirmation.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4 border-t-2 border-foreground pt-10">
        <h2 className="text-3xl font-bold">Build your edge on signal quality.</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/screener">
            <Button size="lg">Launch Demo</Button>
          </Link>
          <Link href="#how-it-works">
            <Button size="lg" variant="secondary">Read the Method</Button>
          </Link>
        </div>
        <p className="text-sm text-muted">Not financial advice. Research-only signal.</p>
      </section>

      <footer className="border-t-2 border-foreground pt-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-muted">Built for [Hackathon Name]</div>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:underline">GitHub</Link>
            <Link href="#" className="hover:underline">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
