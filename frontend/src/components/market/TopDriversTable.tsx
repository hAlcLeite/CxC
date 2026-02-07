import Link from "next/link";
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
import type { TopDriver } from "@/lib/types";

interface TopDriversTableProps {
  drivers: TopDriver[];
}

function shortenWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function TopDriversTable({ drivers }: TopDriversTableProps) {
  if (!drivers.length) {
    return (
      <Card>
        <CardTitle>Top Drivers</CardTitle>
        <CardContent className="py-8 text-center text-muted">
          No driver data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Top Drivers</CardTitle>
      <CardContent className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wallet</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Belief</TableHead>
              <TableHead>Contribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((driver, idx) => (
              <TableRow key={driver.wallet || idx}>
                <TableCell>
                  <Link
                    href={`/wallets/${driver.wallet}`}
                    className="hover:underline"
                    title={driver.wallet}
                  >
                    {shortenWallet(driver.wallet)}
                  </Link>
                </TableCell>
                <TableCell>{(driver.weight * 100).toFixed(2)}%</TableCell>
                <TableCell>{(driver.belief * 100).toFixed(1)}%</TableCell>
                <TableCell
                  className={
                    driver.contribution > 0
                      ? "text-success"
                      : driver.contribution < 0
                        ? "text-danger"
                        : ""
                  }
                >
                  {driver.contribution > 0 ? "+" : ""}
                  {(driver.contribution * 100).toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
