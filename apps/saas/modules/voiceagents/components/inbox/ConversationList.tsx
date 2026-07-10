"use client";

import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { GlobeIcon, PhoneIncomingIcon, PhoneOutgoingIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
	avatarClasses,
	type Call,
	callDisplayName,
	callPhoneNumber,
	initials,
	relativeTime,
	STATUS_DOT_CLASSES,
} from "./helpers";

const DIRECTION_ICONS = {
	inbound: PhoneIncomingIcon,
	outbound: PhoneOutgoingIcon,
	web: GlobeIcon,
} as const;

export function ConversationList({
	calls,
	isLoading,
	selectedId,
	onSelect,
}: {
	calls: Call[];
	isLoading: boolean;
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const [search, setSearch] = useState("");

	const filteredCalls = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return calls;
		}
		return calls.filter((call) => {
			const haystack = [callDisplayName(call), callPhoneNumber(call) ?? "", call.summary ?? ""]
				.join(" ")
				.toLowerCase();
			return haystack.includes(query);
		});
	}, [calls, search]);

	return (
		<div className="min-h-0 flex h-full flex-col">
			<div className="p-3 shrink-0 border-b">
				<div className="relative">
					<SearchIcon className="left-3 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Search calls…"
						aria-label="Search calls"
						className="pl-9 h-8 text-sm"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading ? (
					<ConversationListSkeleton />
				) : filteredCalls.length === 0 ? (
					<p className="p-6 text-sm text-center text-muted-foreground">
						{search ? "No calls match your search." : "No calls yet."}
					</p>
				) : (
					<ul>
						{filteredCalls.map((call) => (
							<ConversationRow
								key={call.id}
								call={call}
								isSelected={call.id === selectedId}
								onSelect={() => onSelect(call.id)}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function ConversationRow({
	call,
	isSelected,
	onSelect,
}: {
	call: Call;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const name = callDisplayName(call);
	const snippet = call.summary ?? call.end_reason ?? call.status;
	const DirectionIcon = DIRECTION_ICONS[call.direction] ?? GlobeIcon;

	return (
		<li>
			<button
				type="button"
				onClick={onSelect}
				aria-current={isSelected ? "true" : undefined}
				className={cn(
					"gap-3 px-3 py-2.5 flex w-full items-start border-b text-left transition-colors",
					isSelected ? "bg-primary/5" : "hover:bg-muted/50",
				)}
			>
				<span
					className={cn(
						"size-9 font-medium text-xs relative flex shrink-0 items-center justify-center rounded-full",
						avatarClasses(name),
					)}
				>
					{initials(name)}
					<span
						aria-hidden
						className={cn(
							"-right-0.5 -bottom-0.5 size-2.5 absolute rounded-full ring-2 ring-card",
							STATUS_DOT_CLASSES[call.status] ?? "bg-muted-foreground",
						)}
					/>
				</span>

				<span className="min-w-0 flex-1">
					<span className="gap-2 flex items-baseline justify-between">
						<span className="gap-1.5 font-medium text-sm min-w-0 flex items-center">
							<span className="truncate">{name}</span>
							<DirectionIcon className="size-3 shrink-0 text-muted-foreground" />
						</span>
						<span className="text-xs shrink-0 text-muted-foreground">
							{relativeTime(call.created_at)}
						</span>
					</span>
					<span className="mt-0.5 text-xs block truncate text-muted-foreground">{snippet}</span>
				</span>
			</button>
		</li>
	);
}

function ConversationListSkeleton() {
	return (
		<div className="gap-3 p-3 flex flex-col">
			{Array.from({ length: 8 }, (_, i) => (
				// oxlint-disable-next-line no-array-index-key -- static skeleton list
				<div key={i} className="gap-3 flex items-center">
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<div className="gap-1.5 flex flex-1 flex-col">
						<Skeleton className="h-3.5 w-2/3" />
						<Skeleton className="h-3 w-full" />
					</div>
				</div>
			))}
		</div>
	);
}
