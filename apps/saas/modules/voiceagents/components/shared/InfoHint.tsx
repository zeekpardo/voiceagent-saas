"use client";

import { cn } from "@repo/ui";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A small "i" icon that reveals help text on hover — for guidance that matters
 * but doesn't belong inline (constraints, behavior notes, the "why"). Keeps the
 * builder's forms clean: put example-driven guidance in the input's placeholder,
 * and everything else behind one of these next to the label.
 *
 * Usage:
 *   <FormLabel className="flex items-center gap-1.5">
 *     Endpointing delay
 *     <InfoHint>How long to wait after the caller stops before the agent replies.</InfoHint>
 *   </FormLabel>
 */
export function InfoHint({
	children,
	className,
	side = "top",
}: {
	children: ReactNode;
	className?: string;
	side?: "top" | "right" | "bottom" | "left";
}) {
	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="More information"
						className={cn(
							"size-4 inline-flex shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							className,
						)}
					>
						<InfoIcon className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side={side} className="max-w-64 text-xs leading-snug font-normal">
					{children}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
