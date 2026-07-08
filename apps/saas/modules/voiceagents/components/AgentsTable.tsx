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
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import {
	ActivityIcon,
	ArrowDownIcon,
	ArrowUpIcon,
	AudioLinesIcon,
	BotIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsUpDownIcon,
	EllipsisVerticalIcon,
	ExternalLinkIcon,
	GitBranchIcon,
	PlusIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useAgentsQuery, useDeleteAgentMutation } from "../lib/api";

const PAGE_SIZE = 10;

const SORTABLE_COLUMNS = [
	{ key: "name", label: "Agent" },
	{ key: "type", label: "Type" },
	{ key: "status", label: "Status" },
	{ key: "model", label: "Model" },
	{ key: "version", label: "Version" },
	{ key: "modified", label: "Modified" },
] as const;

type SortKey = (typeof SORTABLE_COLUMNS)[number]["key"];
type SortDir = "asc" | "desc";

interface AgentConfig {
	description?: string;
	flow?: { nodes?: unknown[] };
	llm?: { model?: string };
}

export function AgentsTable() {
	const router = useRouter();
	const { data: agents, isLoading } = useAgentsQuery();
	const deleteMutation = useDeleteAgentMutation();

	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("modified");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

	const filtered = useMemo(() => {
		if (!agents) {
			return [];
		}
		const query = search.trim().toLowerCase();
		if (!query) {
			return agents;
		}
		return agents.filter((agent) => {
			const config = getAgentConfig(agent);
			return (
				agent.name.toLowerCase().includes(query) ||
				(config.description ?? "").toLowerCase().includes(query)
			);
		});
	}, [agents, search]);

	const sorted = useMemo(() => {
		const rows = [...filtered];
		rows.sort((a, b) => {
			const av = getSortValue(a, sortKey);
			const bv = getSortValue(b, sortKey);
			const result =
				typeof av === "number" && typeof bv === "number"
					? av - bv
					: String(av).localeCompare(String(bv));
			return sortDir === "asc" ? result : -result;
		});
		return rows;
	}, [filtered, sortKey, sortDir]);

	const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

	const selectedOnPage = pageRows.filter((agent) => selected.has(agent.id));
	const allPageSelected = pageRows.length > 0 && selectedOnPage.length === pageRows.length;
	const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

	function handleSort(key: SortKey) {
		if (key === sortKey) {
			setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	}

	function handleSearchChange(value: string) {
		setSearch(value);
		setPage(1);
	}

	function toggleRow(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function toggleAllOnPage() {
		setSelected((prev) => {
			const next = new Set(prev);
			if (allPageSelected) {
				for (const agent of pageRows) {
					next.delete(agent.id);
				}
			} else {
				for (const agent of pageRows) {
					next.add(agent.id);
				}
			}
			return next;
		});
	}

	function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, id: string) {
		const target = event.target as HTMLElement;
		// Interactive elements inside the row handle their own clicks.
		if (target.closest("a,button,input,[role=menuitem]")) {
			return;
		}
		router.push(`/voice-agents/${id}`);
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
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				next.delete(id);
			}
			return next;
		});
	}

	if (isLoading) {
		return (
			<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
				<div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
					<Skeleton className="h-9 w-52 rounded-lg" />
					<Skeleton className="h-9 w-32 rounded-full" />
				</div>
				<div className="flex flex-col gap-2 p-3">
					{Array.from({ length: 6 }, (_, i) => (
						<Skeleton key={i} className="h-9 w-full" />
					))}
				</div>
			</div>
		);
	}

	if (!agents?.length) {
		return (
			<div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-xl border bg-card py-12 text-center">
				<AudioLinesIcon className="size-10 opacity-40" />
				<p className="opacity-60">No voice agents yet. Create your first one.</p>
				<Button asChild variant="primary">
					<Link href="/voice-agents/new">
						<PlusIcon className="size-4" /> New agent
					</Link>
				</Button>
			</div>
		);
	}

	const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
	const rangeEnd = Math.min(currentPage * PAGE_SIZE, sorted.length);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
			{/* Toolbar */}
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5">
				<div className="flex items-center gap-3">
					<div className="relative">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => handleSearchChange(e.target.value)}
							placeholder="Search agents..."
							className="h-9 w-52 rounded-lg pl-8 text-sm"
						/>
					</div>
					{selected.size > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">{selected.size} selected</span>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setConfirmIds([...selected])}
							>
								<Trash2Icon className="size-3" /> Delete
							</Button>
						</div>
					)}
				</div>
				<Button asChild variant="primary">
					<Link href="/voice-agents/new">
						<PlusIcon className="size-4" /> New agent
					</Link>
				</Button>
			</div>

			{/* Table */}
			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-full border-separate border-spacing-0 text-sm">
					<thead>
						<tr className="h-10">
							<th className={cn(headerCellClass, "w-12 px-3")}>
								<input
									type="checkbox"
									aria-label="Select all agents on page"
									checked={allPageSelected}
									ref={(el) => {
										if (el) {
											el.indeterminate = somePageSelected;
										}
									}}
									onChange={toggleAllOnPage}
									className="size-4 cursor-pointer accent-primary"
								/>
							</th>
							{SORTABLE_COLUMNS.map((column) => (
								<th key={column.key} className={cn(headerCellClass, "px-3")}>
									<button
										type="button"
										onClick={() => handleSort(column.key)}
										className="flex items-center gap-1 transition-colors hover:text-foreground"
									>
										{column.label}
										{sortKey === column.key ? (
											sortDir === "asc" ? (
												<ArrowUpIcon className="size-3 text-foreground" />
											) : (
												<ArrowDownIcon className="size-3 text-foreground" />
											)
										) : (
											<ChevronsUpDownIcon className="size-3 opacity-50" />
										)}
									</button>
								</th>
							))}
							<th className={cn(headerCellClass, "w-12 px-3")}>
								<span className="sr-only">Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{pageRows.length === 0 ? (
							<tr>
								<td colSpan={8} className="py-10 text-center text-muted-foreground">
									No agents match &ldquo;{search}&rdquo;
								</td>
							</tr>
						) : (
							pageRows.map((agent) => {
								const config = getAgentConfig(agent);
								const isSelected = selected.has(agent.id);
								return (
									<tr
										key={agent.id}
										onClick={(e) => handleRowClick(e, agent.id)}
										data-state={isSelected ? "selected" : undefined}
										className={cn(
											"group h-9 cursor-pointer transition-colors hover:bg-muted/40",
											isSelected && "bg-muted/60",
										)}
									>
										<td className={cn(bodyCellClass, "w-12")}>
											<input
												type="checkbox"
												aria-label={`Select ${agent.name}`}
												checked={isSelected}
												onChange={() => toggleRow(agent.id)}
												onClick={(e) => e.stopPropagation()}
												className="size-4 cursor-pointer accent-primary"
											/>
										</td>
										<td className={cn(bodyCellClass, "max-w-[40ch]")}>
											<Link
												href={`/voice-agents/${agent.id}`}
												title={config.description || undefined}
												className="block truncate font-medium text-foreground"
											>
												{agent.name}
											</Link>
										</td>
										<td className={bodyCellClass}>
											<TypePill config={config} />
										</td>
										<td className={bodyCellClass}>
											<StatusPill status={agent.status} />
										</td>
										<td className={cn(bodyCellClass, "text-muted-foreground")}>
											{config.llm?.model ?? "—"}
										</td>
										<td className={bodyCellClass}>
											<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
												v{agent.version}
											</span>
										</td>
										<td className={cn(bodyCellClass, "text-muted-foreground")}>
											{formatDate(agent.updated_at)}
										</td>
										<td className={cn(bodyCellClass, "w-12")}>
											<span className="sr-only">Actions</span>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label={`Actions for ${agent.name}`}
														onClick={(e) => e.stopPropagation()}
														className="size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
													>
														<EllipsisVerticalIcon className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => router.push(`/voice-agents/${agent.id}`)}
													>
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
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination footer */}
			<div className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-muted-foreground text-xs">
				<span>
					{rangeStart}-{rangeEnd} of {sorted.length}
				</span>
				<div className="flex items-center gap-2">
					<span>
						Page {currentPage} of {totalPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Previous page"
						disabled={currentPage <= 1}
						onClick={() => setPage(currentPage - 1)}
						className="size-7"
					>
						<ChevronLeftIcon className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Next page"
						disabled={currentPage >= totalPages}
						onClick={() => setPage(currentPage + 1)}
						className="size-7"
					>
						<ChevronRightIcon className="size-4" />
					</Button>
				</div>
			</div>

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
								? `"${agents.find((a) => a.id === confirmIds[0])?.name ?? "This agent"}" will be permanently deleted. This cannot be undone.`
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
		</div>
	);
}

const headerCellClass =
	"sticky top-0 z-10 h-10 border-b bg-muted text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap";
const bodyCellClass = "border-b px-3 py-0 align-middle whitespace-nowrap";

function TypePill({ config }: { config: AgentConfig }) {
	if (config.flow) {
		const count = config.flow.nodes?.length ?? 0;
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 font-medium text-violet-600 text-xs dark:text-violet-400">
				<GitBranchIcon className="size-3" />
				Flow · {count} {count === 1 ? "node" : "nodes"}
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
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
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-xs",
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
