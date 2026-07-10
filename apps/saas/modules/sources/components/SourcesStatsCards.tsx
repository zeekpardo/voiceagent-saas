"use client";

import { Card } from "@repo/ui/components/card";
import { AppWindowIcon, DatabaseIcon, PlugIcon, PlugZapIcon } from "lucide-react";
import { useMemo } from "react";

import { useSourcesQuery } from "../lib/api";

export function SourcesStatsCards() {
	const { data: sources } = useSourcesQuery();

	const stats = useMemo(() => {
		const total = sources?.length ?? 0;
		const connected = sources?.filter((s) => s.status === "CONNECTED").length ?? 0;
		const disconnected = total - connected;
		const byType = new Map<string, number>();
		for (const source of sources ?? []) {
			byType.set(source.providerType, (byType.get(source.providerType) ?? 0) + 1);
		}
		return { total, connected, disconnected, byType: [...byType.entries()] };
	}, [sources]);

	return (
		<div className="gap-4 md:grid-cols-4 grid grid-cols-2">
			<Card className="p-4">
				<div className="mb-2 flex items-center justify-between">
					<p className="text-sm font-medium text-muted-foreground">Total Sources</p>
					<DatabaseIcon className="size-5 text-primary" />
				</div>
				<p className="text-2xl font-semibold">{stats.total}</p>
			</Card>
			<Card className="p-4">
				<div className="mb-2 flex items-center justify-between">
					<p className="text-sm font-medium text-muted-foreground">Connected</p>
					<PlugZapIcon className="size-5 text-emerald-500" />
				</div>
				<p className="text-2xl font-semibold text-emerald-500">{stats.connected}</p>
			</Card>
			<Card className="p-4">
				<div className="mb-2 flex items-center justify-between">
					<p className="text-sm font-medium text-muted-foreground">Disconnected</p>
					<PlugIcon className="size-5 text-muted-foreground" />
				</div>
				<p className="text-2xl font-semibold">{stats.disconnected}</p>
			</Card>
			<Card className="p-4">
				<div className="mb-2 flex items-center justify-between">
					<p className="text-sm font-medium text-muted-foreground">Source Types</p>
					<AppWindowIcon className="size-5 text-primary" />
				</div>
				{stats.byType.length === 0 ? (
					<p className="text-sm opacity-50">—</p>
				) : (
					<div className="gap-1 flex flex-col">
						{stats.byType.map(([type, count]) => (
							<div key={type} className="gap-1.5 flex items-center">
								<span className="text-xs truncate text-muted-foreground">{type}</span>
								<span className="text-xs font-semibold ml-auto">{count}</span>
							</div>
						))}
					</div>
				)}
			</Card>
		</div>
	);
}
