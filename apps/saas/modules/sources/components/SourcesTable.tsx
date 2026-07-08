"use client";

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
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsUpDownIcon,
	DatabaseIcon,
	EllipsisVerticalIcon,
	Unlink2Icon,
	PlusIcon,
	SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useDisconnectSourceMutation, useSourcesQuery } from "../lib/api";
import { ConnectSourceDialog } from "./ConnectSourceDialog";

const PAGE_SIZE = 10;

interface SourceRow {
	id: string;
	name: string;
	providerType: string;
	accountName: string | null;
	address: string | null;
	status: "CONNECTED" | "DISCONNECTED";
	connectedAgentsCount: number;
	createdAt: string | Date;
}

const SORTABLE_COLUMNS = [
	{ key: "name", label: "Source Name" },
	{ key: "providerType", label: "Source Type" },
	{ key: "address", label: "Address" },
	{ key: "connectedAgentsCount", label: "Connected Job Flows" },
	{ key: "status", label: "Status" },
] as const;

type SortKey = (typeof SORTABLE_COLUMNS)[number]["key"];
type SortDir = "asc" | "desc";

export function SourcesTable() {
	const { data: sources, isLoading } = useSourcesQuery();
	const disconnectMutation = useDisconnectSourceMutation();

	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
	const [connectOpen, setConnectOpen] = useState(false);

	const rows = useMemo(() => (sources ?? []) as SourceRow[], [sources]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return rows;
		return rows.filter(
			(source) =>
				source.name.toLowerCase().includes(query) ||
				(source.address ?? "").toLowerCase().includes(query),
		);
	}, [rows, search]);

	const sorted = useMemo(() => {
		const items = [...filtered];
		items.sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			const result =
				typeof av === "number" && typeof bv === "number"
					? av - bv
					: String(av ?? "").localeCompare(String(bv ?? ""));
			return sortDir === "asc" ? result : -result;
		});
		return items;
	}, [filtered, sortKey, sortDir]);

	const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

	const selectedOnPage = pageRows.filter((source) => selected.has(source.id));
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

	function toggleRow(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAllOnPage() {
		setSelected((prev) => {
			const next = new Set(prev);
			if (allPageSelected) {
				for (const source of pageRows) next.delete(source.id);
			} else {
				for (const source of pageRows) next.add(source.id);
			}
			return next;
		});
	}

	async function handleConfirmDisconnect() {
		const ids = confirmIds;
		if (!ids?.length) return;
		const results = await Promise.allSettled(ids.map((id) => disconnectMutation.mutateAsync(id)));
		const failed = results.filter((result) => result.status === "rejected").length;
		const disconnected = ids.length - failed;
		if (disconnected > 0) {
			toastSuccess(disconnected === 1 ? "Source disconnected" : `${disconnected} sources disconnected`);
		}
		if (failed > 0) {
			toastError(failed === 1 ? "Could not disconnect 1 source" : `Could not disconnect ${failed} sources`);
		}
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.delete(id);
			return next;
		});
		setConfirmIds(null);
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

	if (!rows.length) {
		return (
			<>
				<div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-xl border bg-card py-12 text-center">
					<DatabaseIcon className="size-10 opacity-40" />
					<p className="opacity-60">No sources yet. Connect a CRM sub-account to get started.</p>
					<Button variant="primary" onClick={() => setConnectOpen(true)}>
						<PlusIcon className="size-4" /> Add New Source
					</Button>
				</div>
				<ConnectSourceDialog open={connectOpen} onOpenChange={setConnectOpen} />
			</>
		);
	}

	const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
	const rangeEnd = Math.min(currentPage * PAGE_SIZE, sorted.length);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5">
				<div className="flex items-center gap-3">
					<div className="relative">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
							placeholder="Search sources..."
							className="h-9 w-52 rounded-lg pl-8 text-sm"
						/>
					</div>
					{selected.size > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground text-sm">{selected.size} selected</span>
							<Button variant="destructive" size="sm" onClick={() => setConfirmIds([...selected])}>
								<Unlink2Icon className="size-3" /> Disconnect
							</Button>
						</div>
					)}
				</div>
				<Button variant="primary" onClick={() => setConnectOpen(true)}>
					<PlusIcon className="size-4" /> Add New Source
				</Button>
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<table className="w-full border-separate border-spacing-0 text-sm">
					<thead>
						<tr className="h-10">
							<th className={cn(headerCellClass, "w-12 px-3")}>
								<input
									type="checkbox"
									aria-label="Select all sources on page"
									checked={allPageSelected}
									ref={(el) => {
										if (el) el.indeterminate = somePageSelected;
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
								<td colSpan={7} className="py-10 text-center text-muted-foreground">
									No sources match &ldquo;{search}&rdquo;
								</td>
							</tr>
						) : (
							pageRows.map((source) => {
								const isSelected = selected.has(source.id);
								return (
									<tr
										key={source.id}
										data-state={isSelected ? "selected" : undefined}
										className={cn(
											"group h-9 transition-colors hover:bg-muted/40",
											isSelected && "bg-muted/60",
										)}
									>
										<td className={cn(bodyCellClass, "w-12")}>
											<input
												type="checkbox"
												aria-label={`Select ${source.name}`}
												checked={isSelected}
												onChange={() => toggleRow(source.id)}
												className="size-4 cursor-pointer accent-primary"
											/>
										</td>
										<td className={cn(bodyCellClass, "max-w-[32ch] font-medium text-foreground")}>
											<span className="block truncate">{source.name}</span>
										</td>
										<td className={bodyCellClass}>
											<span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
												{source.providerType}
											</span>
										</td>
										<td className={cn(bodyCellClass, "max-w-[28ch] text-muted-foreground")}>
											<span className="block truncate">{source.address ?? "—"}</span>
										</td>
										<td className={bodyCellClass}>{source.connectedAgentsCount}</td>
										<td className={bodyCellClass}>
											<StatusPill status={source.status} />
										</td>
										<td className={cn(bodyCellClass, "w-12")}>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label={`Actions for ${source.name}`}
														className="size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
													>
														<EllipsisVerticalIcon className="size-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={() => setConfirmIds([source.id])}
													>
														<Unlink2Icon className="mr-2 size-4" /> Disconnect
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

			<AlertDialog
				open={confirmIds !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmIds(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Disconnect {confirmIds?.length === 1 ? "source" : `${confirmIds?.length} sources`}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Agents attached to{" "}
							{confirmIds?.length === 1
								? (rows.find((s) => s.id === confirmIds[0])?.name ?? "this source")
								: `these ${confirmIds?.length} sources`}{" "}
							stop syncing and receiving calls from it. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDisconnect}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							Disconnect
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ConnectSourceDialog open={connectOpen} onOpenChange={setConnectOpen} />
		</div>
	);
}

const headerCellClass =
	"sticky top-0 z-10 h-10 border-b bg-muted text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap";
const bodyCellClass = "border-b px-3 py-0 align-middle whitespace-nowrap";

function StatusPill({ status }: { status: "CONNECTED" | "DISCONNECTED" }) {
	const isConnected = status === "CONNECTED";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
				isConnected
					? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "bg-muted text-muted-foreground",
			)}
		>
			{isConnected ? "Connected" : "Disconnected"}
		</span>
	);
}
