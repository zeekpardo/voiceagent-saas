"use client";

import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { RotateCcwIcon } from "lucide-react";

import { useAgentVersionsQuery, useRestoreVersionMutation } from "../lib/api";
import { relativeTime } from "./inbox/helpers";

/**
 * Read-only version history for the flow builder, shown in a right-rail aside.
 * Lists the agent's published versions (newest first); restoring a version
 * asks for confirmation, then creates a NEW version from that snapshot — the
 * canvas reloads because the agent version bumps.
 */
export function VersionHistoryPanel({
	agentId,
	currentVersion,
}: {
	agentId: string;
	currentVersion: number;
}) {
	const { confirm } = useConfirmationAlert();
	const { data, isLoading } = useAgentVersionsQuery(agentId, true);
	const restoreMutation = useRestoreVersionMutation(agentId);

	const handleRestore = (version: number) => {
		confirm({
			title: `Restore v${version}?`,
			message:
				"This creates a new version from that snapshot and loads it onto the canvas. Your current published version is kept in history.",
			confirmLabel: "Restore",
			onConfirm: async () => {
				try {
					const restored = await restoreMutation.mutateAsync(version);
					toastSuccess(`Restored v${version} — agent is now v${restored.version}`);
				} catch (err) {
					toastError(err instanceof Error ? err.message : "Could not restore the version");
				}
			},
		});
	};

	if (isLoading) {
		return (
			<div className="gap-2 flex flex-col">
				<Skeleton className="h-14" />
				<Skeleton className="h-14" />
				<Skeleton className="h-14" />
			</div>
		);
	}

	const versions = data?.versions ?? [];
	if (versions.length === 0) {
		return <p className="text-sm text-muted-foreground">No versions yet.</p>;
	}

	return (
		<ul className="gap-2 flex flex-col">
			{versions.map((entry) => {
				const isCurrent = entry.version === currentVersion;
				return (
					<li
						key={entry.version}
						className={cn(
							"gap-3 px-3 py-2.5 flex items-center rounded-lg border",
							isCurrent && "border-primary/40 bg-primary/5",
						)}
					>
						<div className="min-w-0 flex-1">
							<div className="gap-2 flex items-center">
								<span className="font-medium text-sm">v{entry.version}</span>
								{isCurrent && <Badge status="info">current</Badge>}
							</div>
							<p className="text-xs text-muted-foreground">{relativeTime(entry.created_at)}</p>
						</div>
						{!isCurrent && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								loading={restoreMutation.isPending && restoreMutation.variables === entry.version}
								disabled={restoreMutation.isPending}
								onClick={() => handleRestore(entry.version)}
							>
								<RotateCcwIcon className="size-3.5" /> Restore
							</Button>
						)}
					</li>
				);
			})}
		</ul>
	);
}
