import clsx from "clsx";
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table
        className={clsx("w-full border-collapse font-mono text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={clsx("border-b-2 border-foreground", className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={clsx(className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx(
        "border-b border-foreground/20 transition-colors hover:bg-foreground/5",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={clsx(
        "px-4 py-3 text-left font-bold uppercase tracking-wider",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={clsx("px-4 py-3", className)} {...props}>
      {children}
    </td>
  );
}
