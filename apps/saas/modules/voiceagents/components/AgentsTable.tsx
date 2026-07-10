"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { cn } from "@repo/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { DataTable, type DataTableColumn } from "@shared/components/DataTable";
import { useTableState } from "@shared/hooks/use-table-state";
import {
	ActivityIcon,
	AudioLinesIcon,
	BotIcon,
	EllipsisVerticalIcon,
	ExternalLinkIcon,
	GitBranchIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAgentsQuery, useDeleteAgentMutation } from "../lib/api";

interface AgentConfig {
	description?: string;
	flow?: { nodes?: unknown[] };
	llm?: { model?: string };
}

export function AgentsTable() {
	const router = useRouter();
	const { data: agents, isLoading } = useAgentsQuery();
	const deleteMutation = useDeleteAgentMutation();

	const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

	const table = useTableState<GatewayAgent>({
		data: agents,
		getId: (agent) => agent.id,
		searchPredicate: (agent, query) => {
			const config = getAgentConfig(agent);
			return (
				agent.name.toLowerCase().includes(query) ||
				(config.description ?? "").toLowerCase().includes(query)
			);
		},
		getSortValue: (agent, key) => getSortValue(agent, key as SortKey),
		defaultSortKey: "modified",
		defaultSortDir: "desc",
	});

	function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, agent: GatewayAgent) {
		const target = event.target as HTMLElement;
		// Interactive elements inside the row handle their own clicks.
		if (target.closest("a,button,input,[role=menuitem]")) {
			return;
		}
		router.push(`/voice-agents/${agent.id}`);
	}

	async function handleConfirmDelete() {
		const ids = confirmIds;
		if (!ids?.length) {
			return;
		}
		const results = await Promise.allSettled(ids.map((id) => deleteMutation.mutateAsync(id)));
		const failed = results.filter((result) => result.status === "rejected").length;
		const deleted = ids.length - failed;
		if (deleted > 0) {
			toastSuccess(deleted === 1 ? "Agent deleted" : `${deleted} agents deleted`);
		}
		if (failed > 0) {
			toastError(failed === 1 ? "Could not delete 1 agent" : `Could not delete ${failed} agents`);
		}
		table.clearSelection(ids);
		setConfirmIds(null);
	}

	const columns: DataTableColumn<GatewayAgent>[] = [
		{
			key: "name",
			label: "Agent",
			cellClassName: "max-w-[40ch]",
			render: (agent) => {
				const config = getAgentConfig(agent);
				return (
					<Link
						href={`/voice-agents/${agent.id}`}
						title={config.description || undefined}
						className="font-medium block truncate text-foreground"
					>
						{agent.name}
					</Link>
				);
			},
		},
		{
			key: "type",
			label: "Type",
			render: (agent) => <TypePill config={getAgentConfig(agent)} />,
		},
		{
			key: "status",
			label: "Status",
			render: (agent) => <StatusPill status={agent.status} />,
		},
		{
			key: "model",
			label: "Model",
			cellClassName: "text-muted-foreground",
			render: (agent) => getAgentConfig(agent).llm?.model ?? "—",
		},
		{
			key: "version",
			label: "Version",
			render: (agent) => (
				<span className="px-2 py-0.5 font-medium text-xs inline-flex items-center rounded-full bg-primary/10 text-primary">
					v{agent.version}
				</span>
			),
		},
		{
			key: "modified",
			label: "Modified",
			cellClassName: "text-muted-foreground",
			render: (agent) => formatDate(agent.updated_at),
		},
	];

	return (
		<>
			<DataTable
				columns={columns}
				rows={table.pageRows}
				getId={(agent) => agent.id}
				getRowLabel={(agent) => agent.name}
				isLoading={isLoading}
				isEmpty={!agents?.length}
				emptyState={
					<div className="min-h-0 gap-4 py-12 flex h-full flex-col items-center justify-center rounded-xl border bg-card text-center">
						<AudioLinesIcon className="size-10 opacity-40" />
						<p className="opacity-60">No voice agents yet. Create your first one.</p>
						<Button asChild variant="primary">
							<Link href="/voice-agents/new">
								<PlusIcon className="size-4" /> New agent
							</Link>
						</Button>
					</div>
				}
				search={table.search}
				onSearchChange={table.setSearch}
				searchPlaceholder="Search agents..."
				noResultsLabel="agents"
				sortKey={table.sortKey}
				sortDir={table.sortDir}
				onSort={table.handleSort}
				selected={table.selected}
				onToggleRow={table.toggleRow}
				onToggleAll={table.toggleAllOnPage}
				allSelected={table.allPageSelected}
				someSelected={table.somePageSelected}
				selectAllLabel="Select all agents on page"
				onRowClick={handleRowClick}
				renderRowActions={(agent) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Actions for ${agent.name}`}
								onClick={(e) => e.stopPropagation()}
								className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
							>
								<EllipsisVerticalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => router.push(`/voice-agents/${agent.id}`)}>
								<ExternalLinkIcon className="mr-2 size-4" /> Open
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={() => setConfirmIds([agent.id])}
							>
								<Trash2Icon className="mr-2 size-4" /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				toolbarActions={
					<Button asChild variant="primary">
						<Link href="/voice-agents/new">
							<PlusIcon className="size-4" /> New agent
						</Link>
					</Button>
				}
				bulkActions={
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setConfirmIds([...table.selected])}
					>
						<Trash2Icon className="size-3" /> Delete
					</Button>
				}
				page={table.currentPage}
				totalPages={table.totalPages}
				rangeStart={table.rangeStart}
				rangeEnd={table.rangeEnd}
				totalCount={table.sortedRows.length}
				onPageChange={table.setPage}
			/>

			{/* Delete confirmation */}
			<AlertDialog
				open={confirmIds !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConfirmIds(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {confirmIds?.length === 1 ? "agent" : `${confirmIds?.length} agents`}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmIds?.length === 1
								? `"${agents?.find((a) => a.id === confirmIds[0])?.name ?? "This agent"}" will be permanently deleted. This cannot be undone.`
								: `${confirmIds?.length} agents will be permanently deleted. This cannot be undone.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

type SortKey = "name" | "type" | "status" | "model" | "version" | "modified";

function TypePill({ config }: { config: AgentConfig }) {
	if (config.flow) {
		const count = config.flow.nodes?.length ?? 0;
		return (
			<span className="gap-1 border-violet-500/20 bg-violet-500/10 px-2 py-0.5 font-medium text-violet-600 text-xs dark:text-violet-400 inline-flex items-center rounded-full border">
				<GitBranchIcon className="size-3" />
				Flow · {count} {count === 1 ? "node" : "nodes"}
			</span>
		);
	}
	return (
		<span className="gap-1 px-2 py-0.5 font-medium text-xs inline-flex items-center rounded-full border bg-muted text-muted-foreground">
			<BotIcon className="size-3" />
			Single agent
		</span>
	);
}

function StatusPill({ status }: { status: string }) {
	const isActive = status === "active";
	const label = isActive ? "Active" : status.charAt(0).toUpperCase() + status.slice(1);
	return (
		<span
			className={cn(
				"gap-1 px-2 py-0.5 font-medium text-xs inline-flex items-center rounded-full border",
				isActive
					? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "bg-muted text-muted-foreground",
			)}
		>
			<ActivityIcon className="size-3" />
			{label}
		</span>
	);
}

function getAgentConfig(agent: GatewayAgent): AgentConfig {
	return agent.config as AgentConfig;
}

function getSortValue(agent: GatewayAgent, key: SortKey): string | number {
	const config = getAgentConfig(agent);
	switch (key) {
		case "name":
			return agent.name.toLowerCase();
		case "type":
			// Flow agents rank above single agents; among flows, by node count.
			return config.flow ? 1_000_000 + (config.flow.nodes?.length ?? 0) : 0;
		case "status":
			return agent.status;
		case "model":
			return config.llm?.model ?? "";
		case "version":
			return agent.version;
		case "modified":
			return Date.parse(agent.updated_at) || 0;
	}
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
});

function formatDate(value: string): string {
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) {
		return "—";
	}
	return dateFormatter.format(timestamp);
}
