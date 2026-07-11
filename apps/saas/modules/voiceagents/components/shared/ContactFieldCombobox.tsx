"use client";

import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
	type ContactFieldOption,
	useContactFieldsQuery,
} from "@voiceagents/lib/contact-fields-api";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

interface ContactFieldComboboxProps {
	/** Currently selected field key, e.g. "contact.email" / "location.city", or null. */
	value?: string | null;
	/** Called with the picked key, or null when "Leave Empty" is chosen. */
	onChange: (key: string | null) => void;
	/** Scope custom fields to this agent's Source; omit for the org's first Source. */
	agentId?: string;
	/** Render a "Leave Empty" row (mapping to null) pinned to the top. */
	allowEmpty?: boolean;
	/** Label for the empty row (defaults to "Leave Empty"). */
	emptyLabel?: string;
	/** Trigger text shown when nothing is selected. */
	placeholder?: string;
	/** Let a free-typed value become a picked key (for arbitrary/new field keys). */
	allowCustomKey?: boolean;
	/** Show contact fields only (hide the location group) — for write targets. */
	contactOnly?: boolean;
	disabled?: boolean;
	className?: string;
}

/**
 * THE shared field picker for the builder. A searchable combobox over the
 * unified field catalog (`voiceagents.contactFields.list`): contact standard +
 * custom fields, then the location catalog. CloseBot-style rows — human label
 * (semibold when selected) with the muted mono `contact.key` / `location.key`
 * beside it. Contact and Location fields are shown under subtle group headers.
 *
 * No field names or keys are hard-coded here; everything comes from the backend,
 * so it works for any provider and degrades to the standard + location catalog
 * when the CRM is unavailable.
 */
export function ContactFieldCombobox({
	value,
	onChange,
	agentId,
	allowEmpty = false,
	emptyLabel = "Leave Empty",
	placeholder = "Select a field",
	allowCustomKey = false,
	contactOnly = false,
	disabled,
	className,
}: ContactFieldComboboxProps) {
	const { data, isLoading, isError } = useContactFieldsQuery(agentId);
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	// Attach a native, non-passive wheel listener so scrolling works even when
	// the surrounding Sheet's RemoveScroll would otherwise swallow it. We drive
	// scrollTop ourselves rather than relying on native scroll being allowed.
	const scrollRef = useCallback((el: HTMLDivElement | null) => {
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			const canScroll = el.scrollHeight > el.clientHeight;
			if (!canScroll) return;
			el.scrollTop += e.deltaY;
			e.preventDefault();
			e.stopPropagation();
		};
		el.addEventListener("wheel", onWheel, { passive: false });
	}, []);

	const fields = data?.fields ?? [];
	const selected = fields.find((f) => f.key === value);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return fields;
		return fields.filter(
			(f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
		);
	}, [fields, search]);

	const contactFields = filtered.filter((f) => (f.namespace ?? "contact") === "contact");
	const locationFields = contactOnly ? [] : filtered.filter((f) => f.namespace === "location");

	const trimmedSearch = search.trim();
	const exactKeyMatch = fields.some((f) => f.key === trimmedSearch);
	const showCustomKeyRow = allowCustomKey && trimmedSearch.length > 0 && !exactKeyMatch;

	const pick = (key: string | null) => {
		onChange(key);
		setOpen(false);
		setSearch("");
	};

	const triggerLabel = selected ? selected.label : value ? value : placeholder;

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
						"h-8 gap-2 px-2.5 text-sm flex w-full items-center justify-between rounded-md border bg-background transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
				>
					<span
						className={cn("truncate text-left", !selected && !value && "text-muted-foreground")}
					>
						{triggerLabel}
					</span>
					<ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<div className="mb-1.5 relative">
					<SearchIcon className="left-2.5 size-3.5 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search fields..."
						className="h-8 pl-8 text-sm"
					/>
				</div>
				{/*
				 * The flow editor's Sheet (Radix Dialog) mounts RemoveScroll, whose
				 * document-level listener can preventDefault/stop wheel events for
				 * this Popover (portalled to `document.body`, a sibling of the Sheet)
				 * before React's onWheel ever runs — so a React handler is flaky.
				 * Instead attach a NATIVE non-passive wheel listener directly to the
				 * scroll container via a ref callback: it fires at the target and we
				 * drive scrollTop ourselves, independent of RemoveScroll. Always show
				 * the scrollbar so click-drag works too.
				 */}
				<div
					ref={scrollRef}
					className="max-h-64 [scrollbar-width:thin] [scrollbar-gutter:stable] overflow-y-scroll"
				>
					{allowEmpty && (
						<button
							type="button"
							onClick={() => pick(null)}
							className={cn(
								"gap-2 px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left hover:bg-muted/60",
								!value && "font-medium",
							)}
						>
							<span className="flex-1">{emptyLabel}</span>
							{!value && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" />}
						</button>
					)}

					{isLoading ? (
						<div className="gap-1.5 px-2 py-2 flex flex-col">
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</div>
					) : (
						<>
							{isError && (
								<p className="px-2 py-2 text-xs text-center text-muted-foreground">
									Couldn't load custom fields — showing standard fields.
								</p>
							)}
							{contactFields.length > 0 && (
								<ContactFieldGroup
									label="Contact"
									items={contactFields}
									value={value}
									onPick={pick}
								/>
							)}
							{locationFields.length > 0 && (
								<ContactFieldGroup
									label="Location"
									items={locationFields}
									value={value}
									onPick={pick}
								/>
							)}
							{showCustomKeyRow && (
								<button
									type="button"
									onClick={() => pick(trimmedSearch)}
									className="gap-2 px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left hover:bg-muted/60"
								>
									<PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="min-w-0 flex-1 truncate">Use</span>
									<span className="font-mono shrink-0 truncate text-[11px] text-muted-foreground">
										{trimmedSearch}
									</span>
								</button>
							)}
							{!isError &&
								contactFields.length === 0 &&
								locationFields.length === 0 &&
								!showCustomKeyRow && (
									<p className="px-2 py-3 text-xs text-center text-muted-foreground">
										{fields.length ? `No fields match "${search}"` : "No fields found"}
									</p>
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
	onPick: (key: string) => void;
}) {
	return (
		<div className="mb-1">
			<p className="px-2 pt-1.5 pb-0.5 font-semibold tracking-wide text-[10px] text-muted-foreground uppercase">
				{label}
			</p>
			{items.map((f) => {
				const isSelected = value === f.key;
				return (
					<button
						key={f.key}
						type="button"
						onClick={() => onPick(f.key)}
						className={cn(
							"gap-2 px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left hover:bg-muted/60",
							isSelected && "font-semibold",
						)}
					>
						<span className="min-w-0 flex-1 truncate">{f.label}</span>
						<span className="font-mono shrink-0 truncate text-[11px] text-muted-foreground">
							{f.key}
						</span>
						{isSelected && <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" />}
					</button>
				);
			})}
		</div>
	);
}
