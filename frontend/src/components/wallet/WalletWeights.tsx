import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  CardTitle,
  CardContent,
} from "@/components/ui";
import type { WalletWeight } from "@/lib/types";

interface WalletWeightsProps {
  weights: WalletWeight[];
}

export function WalletWeights({ weights }: WalletWeightsProps) {
  if (!weights.length) {
    return (
      <Card header>
        <div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-3">
          <CardTitle>Trust Weights</CardTitle>
        </div>
        <CardContent className="py-8 text-center text-muted">
          No weight data available for this wallet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card header>
      <div className="bg-foreground text-background border-b-2 border-background py-2 w-full px-3">
        <CardTitle>Trust Weights</CardTitle>
      </div>
      <CardContent className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Horizon</TableHead>
              <TableHead>Final Weight</TableHead>
              <TableHead>Raw Weight</TableHead>
              <TableHead>Shrunk Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weights.map((weight, idx) => (
              <TableRow key={`${weight.category}-${weight.horizon_bucket}-${idx}`}>
                <TableCell>{weight.category || "all"}</TableCell>
                <TableCell>{weight.horizon_bucket}</TableCell>
                <TableCell className="font-bold">
                  {(weight.weight * 100).toFixed(2)}%
                </TableCell>
                <TableCell>{(weight.raw_weight * 100).toFixed(2)}%</TableCell>
                <TableCell>{(weight.shrunk_weight * 100).toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
