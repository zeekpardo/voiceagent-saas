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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { DataTable, type DataTableColumn } from "@shared/components/DataTable";
import { useTableState } from "@shared/hooks/use-table-state";
import { DatabaseIcon, EllipsisVerticalIcon, PlusIcon, Unlink2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { useDisconnectSourceMutation, useSourcesQuery } from "../lib/api";
import { ConnectSourceDialog } from "./ConnectSourceDialog";

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

type SortKey = "name" | "providerType" | "address" | "connectedAgentsCount" | "status";

export function SourcesTable() {
	const { data: sources, isLoading } = useSourcesQuery();
	const disconnectMutation = useDisconnectSourceMutation();

	const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
	const [connectOpen, setConnectOpen] = useState(false);

	const rows = useMemo(() => (sources ?? []) as SourceRow[], [sources]);

	const table = useTableState<SourceRow>({
		data: rows,
		getId: (source) => source.id,
		searchPredicate: (source, query) =>
			source.name.toLowerCase().includes(query) ||
			(source.address ?? "").toLowerCase().includes(query),
		getSortValue: (source, key) => {
			const value = source[key as SortKey];
			return typeof value === "number" ? value : String(value ?? "");
		},
		defaultSortKey: "name",
		defaultSortDir: "asc",
	});

	async function handleConfirmDisconnect() {
		const ids = confirmIds;
		if (!ids?.length) return;
		const results = await Promise.allSettled(ids.map((id) => disconnectMutation.mutateAsync(id)));
		const failed = results.filter((result) => result.status === "rejected").length;
		const disconnected = ids.length - failed;
		if (disconnected > 0) {
			toastSuccess(
				disconnected === 1 ? "Source disconnected" : `${disconnected} sources disconnected`,
			);
		}
		if (failed > 0) {
			toastError(
				failed === 1 ? "Could not disconnect 1 source" : `Could not disconnect ${failed} sources`,
			);
		}
		table.clearSelection(ids);
		setConfirmIds(null);
	}

	const columns: DataTableColumn<SourceRow>[] = [
		{
			key: "name",
			label: "Source Name",
			cellClassName: "max-w-[32ch] font-medium text-foreground",
			render: (source) => <span className="block truncate">{source.name}</span>,
		},
		{
			key: "providerType",
			label: "Source Type",
			render: (source) => (
				<span className="px-2 py-0.5 text-xs font-medium inline-flex items-center rounded-full border bg-muted text-muted-foreground">
					{source.providerType}
				</span>
			),
		},
		{
			key: "address",
			label: "Address",
			cellClassName: "max-w-[28ch] text-muted-foreground",
			render: (source) => <span className="block truncate">{source.address ?? "—"}</span>,
		},
		{
			key: "connectedAgentsCount",
			label: "Connected Job Flows",
			render: (source) => source.connectedAgentsCount,
		},
		{
			key: "status",
			label: "Status",
			render: (source) => <StatusPill status={source.status} />,
		},
	];

	return (
		<>
			<DataTable
				columns={columns}
				rows={table.pageRows}
				getId={(source) => source.id}
				getRowLabel={(source) => source.name}
				isLoading={isLoading}
				isEmpty={!rows.length}
				emptyState={
					<div className="min-h-0 gap-4 py-12 flex h-full flex-col items-center justify-center rounded-xl border bg-card text-center">
						<DatabaseIcon className="size-10 opacity-40" />
						<p className="opacity-60">No sources yet. Connect a CRM sub-account to get started.</p>
						<Button variant="primary" onClick={() => setConnectOpen(true)}>
							<PlusIcon className="size-4" /> Add New Source
						</Button>
					</div>
				}
				search={table.search}
				onSearchChange={table.setSearch}
				searchPlaceholder="Search sources..."
				noResultsLabel="sources"
				sortKey={table.sortKey}
				sortDir={table.sortDir}
				onSort={table.handleSort}
				selected={table.selected}
				onToggleRow={table.toggleRow}
				onToggleAll={table.toggleAllOnPage}
				allSelected={table.allPageSelected}
				someSelected={table.somePageSelected}
				selectAllLabel="Select all sources on page"
				renderRowActions={(source) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Actions for ${source.name}`}
								className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
				)}
				toolbarActions={
					<Button variant="primary" onClick={() => setConnectOpen(true)}>
						<PlusIcon className="size-4" /> Add New Source
					</Button>
				}
				bulkActions={
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setConfirmIds([...table.selected])}
					>
						<Unlink2Icon className="size-3" /> Disconnect
					</Button>
				}
				page={table.currentPage}
				totalPages={table.totalPages}
				rangeStart={table.rangeStart}
				rangeEnd={table.rangeEnd}
				totalCount={table.sortedRows.length}
				onPageChange={table.setPage}
			/>

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
		</>
	);
}

function StatusPill({ status }: { status: "CONNECTED" | "DISCONNECTED" }) {
	const isConnected = status === "CONNECTED";
	return (
		<span
			className={cn(
				"gap-1 px-2 py-0.5 text-xs font-medium inline-flex items-center rounded-full",
				isConnected
					? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "bg-muted text-muted-foreground",
			)}
		>
			{isConnected ? "Connected" : "Disconnected"}
		</span>
	);
}
