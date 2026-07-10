"use client";

import { cn } from "@repo/ui";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { AudioLinesIcon, PhoneIncomingIcon } from "lucide-react";

import { useAgentsQuery, useNumbersQuery, useSetNumberAgentMutation } from "../lib/api";

/** Sentinel for "no agent answers this number" — Radix Select forbids "" values. */
const UNASSIGNED = "__unassigned__";

export function NumbersTable() {
	const { data: numbers, isLoading: numbersLoading } = useNumbersQuery();
	const { data: agents, isLoading: agentsLoading } = useAgentsQuery();
	const setAgentMutation = useSetNumberAgentMutation();

	async function handleAssign(numberId: string, e164: string, value: string) {
		const agentId = value === UNASSIGNED ? null : value;
		try {
			await setAgentMutation.mutateAsync({ id: numberId, agentId });
			const agentName = agents?.find((a) => a.id === agentId)?.name;
			toastSuccess(
				agentId
					? `${formatE164(e164)} now routes to ${agentName ?? "the selected agent"}`
					: `${formatE164(e164)} unassigned — inbound calls will be rejected`,
			);
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not update the number");
		}
	}

	if (numbersLoading || agentsLoading) {
		return (
			<div className="gap-2 p-3 flex flex-col rounded-xl border bg-card">
				{Array.from({ length: 3 }, (_, i) => (
					<Skeleton key={i} className="h-11 w-full" />
				))}
			</div>
		);
	}

	if (!numbers?.length) {
		return (
			<div className="gap-3 py-12 flex flex-col items-center justify-center rounded-xl border bg-card text-center">
				<PhoneIncomingIcon className="size-10 opacity-40" />
				<p className="opacity-60">
					No phone numbers registered yet. Numbers are provisioned at the carrier and registered
					with the engine — see the deployment docs.
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border bg-card">
			<table className="border-spacing-0 text-sm w-full border-separate">
				<thead>
					<tr className="h-10">
						<th className={cn(headerCellClass, "px-3")}>Number</th>
						<th className={cn(headerCellClass, "px-3")}>Provider</th>
						<th className={cn(headerCellClass, "px-3")}>Answering agent</th>
						<th className={cn(headerCellClass, "px-3")}>Added</th>
					</tr>
				</thead>
				<tbody>
					{numbers.map((number) => {
						const assignedAgent = agents?.find((a) => a.id === number.inbound_agent_id);
						// The agent may belong to another organization on this gateway
						// project; it's routed but not selectable here.
						const isForeignAgent = !!number.inbound_agent_id && !assignedAgent;
						return (
							<tr key={number.id} className="h-12 transition-colors hover:bg-muted/40">
								<td className={cn(bodyCellClass, "font-medium text-foreground")}>
									{formatE164(number.e164)}
								</td>
								<td className={cn(bodyCellClass, "text-muted-foreground capitalize")}>
									{number.provider_ref}
								</td>
								<td className={bodyCellClass}>
									{isForeignAgent ? (
										<span className="text-muted-foreground">
											Assigned outside this organization
										</span>
									) : (
										<Select
											value={number.inbound_agent_id ?? UNASSIGNED}
											onValueChange={(value) => handleAssign(number.id, number.e164, value)}
											disabled={setAgentMutation.isPending}
										>
											<SelectTrigger className="h-9 w-64" aria-label={`Agent for ${number.e164}`}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{agents?.map((agent) => (
													<SelectItem key={agent.id} value={agent.id}>
														<span className="gap-2 flex items-center">
															<AudioLinesIcon className="size-3.5 opacity-60" />
															{agent.name}
														</span>
													</SelectItem>
												))}
												<SelectSeparator />
												<SelectItem value={UNASSIGNED}>
													<span className="text-muted-foreground">Unassigned</span>
												</SelectItem>
											</SelectContent>
										</Select>
									)}
								</td>
								<td className={cn(bodyCellClass, "text-muted-foreground")}>
									{formatDate(number.created_at)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

const headerCellClass =
	"h-10 border-b bg-muted text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap";
const bodyCellClass = "border-b px-3 py-0 align-middle whitespace-nowrap";

/** +16616155393 → +1 (661) 615-5393; non-NANP numbers pass through unchanged. */
function formatE164(e164: string): string {
	const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	if (match) {
		return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
	}
	return e164;
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
