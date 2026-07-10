"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsUpDownIcon,
	SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { SortDir } from "../hooks/use-table-state";

export interface DataTableColumn<T> {
	key: string;
	label: string;
	headerClassName?: string;
	cellClassName?: string;
	render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
	columns: DataTableColumn<T>[];
	rows: T[];
	getId: (row: T) => string;
	getRowLabel: (row: T) => string;

	isLoading?: boolean;
	/** True when there is no data at all (ignoring the current search filter). */
	isEmpty?: boolean;
	emptyState?: ReactNode;

	search: string;
	onSearchChange: (value: string) => void;
	searchPlaceholder: string;
	noResultsLabel: string;

	sortKey: string;
	sortDir: SortDir;
	onSort: (key: string) => void;

	selected: Set<string>;
	onToggleRow: (id: string) => void;
	onToggleAll: () => void;
	allSelected: boolean;
	someSelected: boolean;
	selectAllLabel: string;

	renderRowActions?: (row: T) => ReactNode;
	onRowClick?: (event: React.MouseEvent<HTMLTableRowElement>, row: T) => void;

	toolbarActions?: ReactNode;
	bulkActions?: ReactNode;

	page: number;
	totalPages: number;
	rangeStart: number;
	rangeEnd: number;
	totalCount: number;
	onPageChange: (page: number) => void;
}

const headerCellClass =
	"sticky top-0 z-10 h-10 border-b bg-muted text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap";
const bodyCellClass = "border-b px-3 py-0 align-middle whitespace-nowrap";

/**
 * Generic shell for hand-rolled data tables: toolbar (search + bulk actions + primary
 * action), sortable header, selectable rows, and a pagination footer.
 * Behavior/state comes from `useTableState`; visuals/columns come from `columns` and the
 * render callbacks passed in by the consumer.
 */
export function DataTable<T>({
	columns,
	rows,
	getId,
	getRowLabel,
	isLoading,
	isEmpty,
	emptyState,
	search,
	onSearchChange,
	searchPlaceholder,
	noResultsLabel,
	sortKey,
	sortDir,
	onSort,
	selected,
	onToggleRow,
	onToggleAll,
	allSelected,
	someSelected,
	selectAllLabel,
	renderRowActions,
	onRowClick,
	toolbarActions,
	bulkActions,
	page,
	totalPages,
	rangeStart,
	rangeEnd,
	totalCount,
	onPageChange,
}: DataTableProps<T>) {
	if (isLoading) {
		return (
			<div className="min-h-0 flex h-full flex-col overflow-hidden rounded-xl border bg-card">
				<div className="gap-3 px-3 py-2.5 flex items-center justify-between border-b">
					<Skeleton className="h-9 w-52 rounded-lg" />
					<Skeleton className="h-9 w-32 rounded-full" />
				</div>
				<div className="gap-2 p-3 flex flex-col">
					{Array.from({ length: 6 }, (_, i) => (
						<Skeleton key={i} className="h-9 w-full" />
					))}
				</div>
			</div>
		);
	}

	if (isEmpty) {
		return <>{emptyState}</>;
	}

	const columnCount = columns.length + 1 + (renderRowActions ? 1 : 0);

	return (
		<div className="min-h-0 flex h-full flex-col overflow-hidden rounded-xl border bg-card">
			{/* Toolbar */}
			<div className="gap-3 px-3 py-2.5 flex shrink-0 items-center justify-between border-b">
				<div className="gap-3 flex items-center">
					<div className="relative">
						<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => onSearchChange(e.target.value)}
							placeholder={searchPlaceholder}
							className="h-9 w-52 pl-8 text-sm rounded-lg"
						/>
					</div>
					{selected.size > 0 && (
						<div className="gap-2 flex items-center">
							<span className="text-sm text-muted-foreground">{selected.size} selected</span>
							{bulkActions}
						</div>
					)}
				</div>
				{toolbarActions}
			</div>

			{/* Table */}
			<div className="min-h-0 flex-1 overflow-auto">
				<table className="border-spacing-0 text-sm w-full border-separate">
					<thead>
						<tr className="h-10">
							<th className={cn(headerCellClass, "w-12 px-3")}>
								<input
									type="checkbox"
									aria-label={selectAllLabel}
									checked={allSelected}
									ref={(el) => {
										if (el) {
											el.indeterminate = someSelected;
										}
									}}
									onChange={onToggleAll}
									className="size-4 cursor-pointer accent-primary"
								/>
							</th>
							{columns.map((column) => (
								<th
									key={column.key}
									className={cn(headerCellClass, "px-3", column.headerClassName)}
								>
									<button
										type="button"
										onClick={() => onSort(column.key)}
										className="gap-1 flex items-center transition-colors hover:text-foreground"
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
							{renderRowActions && (
								<th className={cn(headerCellClass, "w-12 px-3")}>
									<span className="sr-only">Actions</span>
								</th>
							)}
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr>
								<td colSpan={columnCount} className="py-10 text-center text-muted-foreground">
									No {noResultsLabel} match &ldquo;{search}&rdquo;
								</td>
							</tr>
						) : (
							rows.map((row) => {
								const id = getId(row);
								const isSelected = selected.has(id);
								return (
									<tr
										key={id}
										onClick={onRowClick ? (e) => onRowClick(e, row) : undefined}
										data-state={isSelected ? "selected" : undefined}
										className={cn(
											"group h-9 transition-colors hover:bg-muted/40",
											onRowClick && "cursor-pointer",
											isSelected && "bg-muted/60",
										)}
									>
										<td className={cn(bodyCellClass, "w-12")}>
											<input
												type="checkbox"
												aria-label={`Select ${getRowLabel(row)}`}
												checked={isSelected}
												onChange={() => onToggleRow(id)}
												onClick={(e) => e.stopPropagation()}
												className="size-4 cursor-pointer accent-primary"
											/>
										</td>
										{columns.map((column) => (
											<td key={column.key} className={cn(bodyCellClass, column.cellClassName)}>
												{column.render(row)}
											</td>
										))}
										{renderRowActions && (
											<td className={cn(bodyCellClass, "w-12")}>
												<span className="sr-only">Actions</span>
												{renderRowActions(row)}
											</td>
										)}
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination footer */}
			<div className="px-3 py-2 text-xs flex shrink-0 items-center justify-between border-t text-muted-foreground">
				<span>
					{rangeStart}-{rangeEnd} of {totalCount}
				</span>
				<div className="gap-2 flex items-center">
					<span>
						Page {page} of {totalPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Previous page"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
						className="size-7"
					>
						<ChevronLeftIcon className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Next page"
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
						className="size-7"
					>
						<ChevronRightIcon className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
