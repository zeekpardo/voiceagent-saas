"use client";

import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Skeleton } from "@repo/ui/components/skeleton";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { type ContactFieldOption, useSourceContactFieldsQuery } from "@sources/lib/api";

interface ContactFieldPickerProps {
	/** The CRM sub-account (Source) whose writable contact fields should be listed. */
	sourceId: string;
	/** Currently selected field key, e.g. "contact.email" / "contact.pool", or null/undefined for "Leave empty". */
	value?: string | null;
	/** Called with (key, label) on pick, or (null, null) for "Leave empty". */
	onChange: (key: string | null, label: string | null) => void;
	disabled?: boolean;
	className?: string;
	/** Trigger text shown when nothing is selected. Defaults to "Leave empty". */
	placeholder?: string;
}

/**
 * Reusable searchable combobox for picking a CRM contact field. Field lists
 * come entirely from the backend (`voiceagents.sources.contactFields`) — no
 * field names or keys are ever hard-coded here, so it works for any provider.
 *
 * CloseBot-style UX: trigger shows the selected label (or a placeholder), the
 * dropdown has a search box, a "Leave empty" option pinned to the top, then
 * standard fields followed by the sub-account's custom fields — each row
 * shows the human label with its `contact.key` as a muted subtitle.
 */
export function ContactFieldPicker({
	sourceId,
	value,
	onChange,
	disabled,
	className,
	placeholder = "Leave empty",
}: ContactFieldPickerProps) {
	const { data, isLoading, isError } = useSourceContactFieldsQuery(sourceId);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const fields = data?.fields ?? [];
	const selected = fields.find((f) => f.key === value);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return fields;
		return fields.filter(
			(f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
		);
	}, [fields, search]);

	const standardFields = filtered.filter((f) => f.kind === "standard");
	const customFields = filtered.filter((f) => f.kind === "custom");

	const pick = (key: string | null, label: string | null) => {
		onChange(key, label);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					className={cn(
						"flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
						{selected ? selected.label : placeholder}
					</span>
					<ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<div className="relative mb-1.5">
					<SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search fields..."
						className="h-8 pl-8 text-sm"
					/>
				</div>
				<div className="max-h-64 overflow-y-auto">
					<button
						type="button"
						onClick={() => pick(null, null)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
							!value && "font-medium",
						)}
					>
						<span className="flex-1">{placeholder}</span>
						{!value && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" />}
					</button>

					{isLoading ? (
						<div className="flex flex-col gap-1.5 px-2 py-2">
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</div>
					) : isError ? (
						<p className="px-2 py-3 text-center text-muted-foreground text-xs">
							Couldn't load fields for this source.
						</p>
					) : filtered.length === 0 ? (
						<p className="px-2 py-3 text-center text-muted-foreground text-xs">
							{fields.length ? `No fields match "${search}"` : "No writable fields found"}
						</p>
					) : (
						<>
							{standardFields.length > 0 && (
								<ContactFieldGroup label="Standard" items={standardFields} value={value} onPick={pick} />
							)}
							{customFields.length > 0 && (
								<ContactFieldGroup label="Custom" items={customFields} value={value} onPick={pick} />
							)}
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ContactFieldGroup({
	label,
	items,
	value,
	onPick,
}: {
	label: string;
	items: ContactFieldOption[];
	value?: string | null;
	onPick: (key: string, label: string) => void;
}) {
	return (
		<div className="mb-1">
			<p className="px-2 pt-1.5 pb-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
				{label}
			</p>
			{items.map((f) => {
				const isSelected = value === f.key;
				return (
					<button
						key={f.key}
						type="button"
						onClick={() => onPick(f.key, f.label)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
							isSelected && "font-medium",
						)}
					>
						<span className="min-w-0 flex-1 truncate">{f.label}</span>
						<span className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">
							{f.key}
						</span>
						{isSelected && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" />}
					</button>
				);
			})}
		</div>
	);
}
