import clsx from "clsx";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
	hover?: boolean;
	header?: boolean;
}

export function Card({ hover, header, className, children, ...props }: CardProps) {
	return (
		<div
			className={clsx(
				"border-2 border-foreground bg-background",
				header ? "p-0" : "p-4",
				hover && "group transition-colors hover:bg-foreground hover:text-background hover:border-background",
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function CardHeader({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={clsx("mb-4", className)} {...props}>
			{children}
		</div>
	);
}

export function CardTitle({
	className,
	children,
	...props
}: HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h3 className={clsx("text-lg font-bold", className)} {...props}>
			{children}
		</h3>
	);
}

export function CardContent({
	className,
	children,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={clsx(className)} {...props}>
			{children}
		</div>
	);
}
