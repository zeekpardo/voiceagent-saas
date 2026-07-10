import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

interface UseTableStateOptions<T> {
	/** Rows to drive the table from. `undefined` while loading. */
	data: T[] | undefined;
	/** Unique id for a row, used for selection tracking. */
	getId: (row: T) => string;
	/** Returns true if the row matches the (already trimmed + lowercased) search query. */
	searchPredicate: (row: T, query: string) => boolean;
	/** Returns the value to compare on for a given sort key. */
	getSortValue: (row: T, key: string) => string | number;
	defaultSortKey: string;
	defaultSortDir?: SortDir;
	pageSize?: number;
}

export interface UseTableStateResult<T> {
	search: string;
	setSearch: (value: string) => void;
	sortKey: string;
	sortDir: SortDir;
	handleSort: (key: string) => void;
	page: number;
	setPage: (page: number) => void;
	currentPage: number;
	totalPages: number;
	/** Filtered + sorted rows (all pages). */
	sortedRows: T[];
	/** Rows for the current page. */
	pageRows: T[];
	rangeStart: number;
	rangeEnd: number;
	selected: Set<string>;
	setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
	toggleRow: (id: string) => void;
	toggleAllOnPage: () => void;
	allPageSelected: boolean;
	somePageSelected: boolean;
	/** Removes the given ids from the selection (e.g. after a bulk action completes). */
	clearSelection: (ids: string[]) => void;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Shared search + sort + pagination + row-selection state for hand-rolled data tables.
 * Pairs with the <DataTable> shell component.
 */
export function useTableState<T>({
	data,
	getId,
	searchPredicate,
	getSortValue,
	defaultSortKey,
	defaultSortDir = "asc",
	pageSize = DEFAULT_PAGE_SIZE,
}: UseTableStateOptions<T>): UseTableStateResult<T> {
	const [search, setSearchState] = useState("");
	const [sortKey, setSortKey] = useState(defaultSortKey);
	const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	function setSearch(value: string) {
		setSearchState(value);
		setPage(1);
	}

	const filtered = useMemo(() => {
		if (!data) {
			return [];
		}
		const query = search.trim().toLowerCase();
		if (!query) {
			return data;
		}
		return data.filter((row) => searchPredicate(row, query));
	}, [data, search, searchPredicate]);

	const sortedRows = useMemo(() => {
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
	}, [filtered, sortKey, sortDir, getSortValue]);

	const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	const selectedOnPage = pageRows.filter((row) => selected.has(getId(row)));
	const allPageSelected = pageRows.length > 0 && selectedOnPage.length === pageRows.length;
	const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

	function handleSort(key: string) {
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
				for (const row of pageRows) {
					next.delete(getId(row));
				}
			} else {
				for (const row of pageRows) {
					next.add(getId(row));
				}
			}
			return next;
		});
	}

	function clearSelection(ids: string[]) {
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				next.delete(id);
			}
			return next;
		});
	}

	const rangeStart = sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
	const rangeEnd = Math.min(currentPage * pageSize, sortedRows.length);

	return {
		search,
		setSearch,
		sortKey,
		sortDir,
		handleSort,
		page,
		setPage,
		currentPage,
		totalPages,
		sortedRows,
		pageRows,
		rangeStart,
		rangeEnd,
		selected,
		setSelected,
		toggleRow,
		toggleAllOnPage,
		allPageSelected,
		somePageSelected,
		clearSelection,
	};
}
