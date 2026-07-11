"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { PhoneCallIcon } from "lucide-react";
import { useState } from "react";

import { useSourceUsageQuery } from "../lib/api";

const PERIOD_OPTIONS = [7, 30, 90] as const;

/** Read-only call-usage summary for a source: calls, minutes, and active-now
 * over a selectable lookback window. Visibility gate lives on the parent
 * (SourceDetail already requires an owned source); this just renders. */
export function SourceUsageCard({ sourceId }: { sourceId: string }) {
	const [days, setDays] = useState<(typeof PERIOD_OPTIONS)[number]>(30);
	const { data: usage, isLoading } = useSourceUsageQuery(sourceId, days);

	return (
		<div className="gap-4 flex flex-col">
			<div className="gap-1 p-0.5 flex items-center self-start rounded-lg border">
				{PERIOD_OPTIONS.map((option) => (
					<Button
						key={option}
						type="button"
						size="sm"
						variant={option === days ? "secondary" : "ghost"}
						className="h-7 px-2.5 text-xs"
						onClick={() => setDays(option)}
					>
						{option}d
					</Button>
				))}
			</div>

			{isLoading ? (
				<div className="gap-4 sm:grid-cols-3 grid grid-cols-1">
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
				</div>
			) : (
				<div className="gap-4 sm:grid-cols-3 grid grid-cols-1">
					<UsageStat label="Calls" value={usage?.calls ?? 0} />
					<UsageStat label="Minutes" value={usage?.totalMinutes ?? 0} />
					<UsageStat
						label="Active now"
						value={usage?.activeCalls ?? 0}
						icon={<PhoneCallIcon className="size-4 text-emerald-500" />}
					/>
				</div>
			)}

			{usage?.unavailable ? (
				<p className="text-xs text-muted-foreground">
					Usage data is temporarily unavailable — showing zeros.
				</p>
			) : null}

			{/* TODO: per-source concurrency limit setting lands with the engine limiter */}
		</div>
	);
}

function UsageStat({
	label,
	value,
	icon,
}: {
	label: string;
	value: number;
	icon?: React.ReactNode;
}) {
	return (
		<div className="p-3 rounded-lg border">
			<p className="text-xs text-muted-foreground">{label}</p>
			<div className={cn("gap-1.5 mt-1 flex items-center")}>
				{icon}
				<p className="font-semibold text-xl">{value}</p>
			</div>
		</div>
	);
}
