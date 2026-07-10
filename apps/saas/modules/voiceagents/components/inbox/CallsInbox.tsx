"use client";

import { cn } from "@repo/ui";
import { Skeleton } from "@repo/ui/components/skeleton";
import { InboxIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useAgentsQuery, useInboxCallsQuery } from "../../lib/api";
import { ConversationDetail } from "./ConversationDetail";
import { ConversationList } from "./ConversationList";

/**
 * CloseBot-style chat inbox for voice calls: a views/filter column, a
 * searchable conversation list, and a chat-bubble transcript pane, all in
 * one full-viewport card (same shell-escape trick as AgentDetail).
 */
export function CallsInbox() {
	const { data: calls, isLoading: callsLoading } = useInboxCallsQuery();
	const { data: agents, isLoading: agentsLoading } = useAgentsQuery();
	const [agentFilter, setAgentFilter] = useState<string | null>(null);
	const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

	const sortedCalls = useMemo(
		() =>
			[...(calls ?? [])].sort(
				(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
			),
		[calls],
	);

	const countByAgent = useMemo(() => {
		const counts = new Map<string, number>();
		for (const call of sortedCalls) {
			counts.set(call.agent_id, (counts.get(call.agent_id) ?? 0) + 1);
		}
		return counts;
	}, [sortedCalls]);

	const filteredCalls = useMemo(
		() => (agentFilter ? sortedCalls.filter((call) => call.agent_id === agentFilter) : sortedCalls),
		[sortedCalls, agentFilter],
	);

	const agentNameById = useMemo(
		() => new Map(agents?.map((agent) => [agent.id, agent.name]) ?? []),
		[agents],
	);

	const selectedCall = sortedCalls.find((call) => call.id === selectedCallId) ?? null;
	const isLoading = callsLoading || agentsLoading;

	return (
		// data-fullbleed lifts the app shell's container max-width (AppWrapper
		// :has() opt-out); the negative margins escape its padding — together
		// the inbox fills the whole content card, edge to edge.
		<div
			data-fullbleed
			className="-mx-6 -my-6 md:h-[calc(100dvh-1rem-2px)] flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col"
		>
			<div className="min-h-0 flex flex-1 overflow-hidden">
				<aside className="py-3 lg:flex hidden w-[190px] shrink-0 flex-col overflow-y-auto border-r">
					<div className="px-3 pb-2 gap-2 flex items-center">
						<InboxIcon className="size-4 text-muted-foreground" />
						<h1 className="font-medium text-sm">Calls</h1>
					</div>
					{isLoading ? (
						<ViewsSkeleton />
					) : (
						<nav className="px-2 gap-0.5 flex flex-col">
							<ViewRow
								label="All"
								count={sortedCalls.length}
								isActive={agentFilter === null}
								onClick={() => setAgentFilter(null)}
							/>
							<p className="px-2 pt-3 pb-1 font-medium tracking-wide text-[11px] text-muted-foreground uppercase">
								Agents
							</p>
							{agents?.map((agent) => (
								<ViewRow
									key={agent.id}
									label={agent.name}
									count={countByAgent.get(agent.id) ?? 0}
									isActive={agentFilter === agent.id}
									onClick={() => setAgentFilter(agent.id)}
								/>
							))}
						</nav>
					)}
				</aside>

				<div className="w-[320px] shrink-0 border-r">
					<ConversationList
						calls={filteredCalls}
						isLoading={isLoading}
						selectedId={selectedCallId}
						onSelect={setSelectedCallId}
					/>
				</div>

				<main className="min-w-0 flex-1">
					<ConversationDetail
						call={selectedCall}
						agentName={selectedCall ? (agentNameById.get(selectedCall.agent_id) ?? null) : null}
					/>
				</main>
			</div>
		</div>
	);
}

function ViewRow({
	label,
	count,
	isActive,
	onClick,
}: {
	label: string;
	count: number;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={isActive}
			className={cn(
				"gap-2 px-2 py-1.5 text-sm flex w-full items-center rounded-md text-left transition-colors",
				isActive
					? "font-medium bg-primary/5 text-foreground"
					: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
			)}
		>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="text-xs shrink-0 text-muted-foreground tabular-nums">{count}</span>
		</button>
	);
}

function ViewsSkeleton() {
	return (
		<div className="px-2 gap-2 flex flex-col">
			{Array.from({ length: 4 }, (_, i) => (
				// oxlint-disable-next-line no-array-index-key -- static skeleton list
				<Skeleton key={i} className="h-7 w-full" />
			))}
		</div>
	);
}
