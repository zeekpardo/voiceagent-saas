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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Spinner } from "@repo/ui/components/spinner";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import {
	type SearchNumbersInput,
	sourceNumbersQueryKey,
	usePurchaseNumberMutation,
	useReleaseNumberMutation,
	useSearchNumbersMutation,
	useSourceAgentIdsQuery,
	useSourceNumbersQuery,
} from "@sources/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentsQuery, useSetNumberAgentMutation } from "@voiceagents/lib/api";
import { AudioLinesIcon, PhoneIcon, PhoneOffIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

type SourceNumber = NonNullable<ReturnType<typeof useSourceNumbersQuery>["data"]>[number];

/** Sentinel for "no agent answers this number" — Radix Select forbids "" values. */
const UNASSIGNED = "__unassigned__";

/** True when an error is the engine's "phone provisioning isn't configured" 503. */
function isNotConfigured(error: unknown): boolean {
	return (error as { code?: string } | null)?.code === "SERVICE_UNAVAILABLE";
}

export function SourcePhoneNumbers({ sourceId }: { sourceId: string }) {
	const { data: numbers, isLoading } = useSourceNumbersQuery(sourceId);
	const { data: attachedAgentIds } = useSourceAgentIdsQuery(sourceId);
	const { data: allAgents, isLoading: agentsLoading } = useAgentsQuery();
	const releaseMutation = useReleaseNumberMutation(sourceId);
	const setAgentMutation = useSetNumberAgentMutation();
	const queryClient = useQueryClient();
	const [buyOpen, setBuyOpen] = useState(false);
	const [toRelease, setToRelease] = useState<SourceNumber | null>(null);

	// Prefer the agents already attached to this source (the most intuitive
	// set — a source's numbers should answer with the source's own agents).
	// Fall back to every org agent when none are attached yet.
	const attachedAgents = allAgents?.filter((agent) => attachedAgentIds?.includes(agent.id));
	const agentOptions = attachedAgents?.length ? attachedAgents : allAgents;

	async function handleAssign(number: SourceNumber, value: string) {
		if (!number.providerRef) {
			toastError("This number isn't registered with the engine yet");
			return;
		}
		const agentId = value === UNASSIGNED ? null : value;
		try {
			await setAgentMutation.mutateAsync({ id: number.providerRef, agentId });
			void queryClient.invalidateQueries({ queryKey: sourceNumbersQueryKey(sourceId) });
			const agentName = allAgents?.find((a) => a.id === agentId)?.name;
			toastSuccess(
				agentId
					? `${formatE164(number.e164)} now routes to ${agentName ?? "the selected agent"}`
					: `${formatE164(number.e164)} unassigned — inbound calls will be rejected`,
			);
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not update the number");
		}
	}

	async function handleRelease() {
		if (!toRelease) {
			return;
		}
		try {
			await releaseMutation.mutateAsync(toRelease.id);
			toastSuccess(`${formatE164(toRelease.e164)} released`);
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not release the number");
		} finally {
			setToRelease(null);
		}
	}

	return (
		<div className="gap-4 flex flex-col">
			<div className="gap-2 flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					Numbers provisioned for this subaccount. Inbound calls route to the agent attached to the
					source.
				</p>
				<Button size="sm" onClick={() => setBuyOpen(true)} className="gap-2 shrink-0">
					<PlusIcon className="size-4" /> Buy number
				</Button>
			</div>

			{isLoading ? (
				<div className="gap-2 flex flex-col">
					<Skeleton className="h-11 w-full" />
					<Skeleton className="h-11 w-full" />
				</div>
			) : !numbers?.length ? (
				<div className="gap-3 py-10 flex flex-col items-center justify-center rounded-xl border border-dashed text-center">
					<PhoneIcon className="size-8 opacity-40" />
					<p className="text-sm opacity-60">
						No numbers yet. Buy one to start taking calls for this source.
					</p>
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border bg-card">
					<table className="border-spacing-0 text-sm w-full border-separate">
						<thead>
							<tr>
								<th className={headerCellClass}>Number</th>
								<th className={headerCellClass}>Answering agent</th>
								<th className={cn(headerCellClass, "text-right")}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{numbers.map((number) => {
								const assignedAgent = allAgents?.find((a) => a.id === number.inboundAgentId);
								// The agent may belong to another organization on this gateway
								// project; it's routed but not selectable here.
								const isForeignAgent = !!number.inboundAgentId && !assignedAgent;
								// Keep the currently-assigned agent selectable even when it
								// isn't in the preferred (source-attached) option set, so an
								// existing assignment is never silently blanked out.
								const options =
									assignedAgent && !agentOptions?.some((a) => a.id === assignedAgent.id)
										? [...(agentOptions ?? []), assignedAgent]
										: agentOptions;
								return (
									<tr key={number.id} className="h-12 transition-colors hover:bg-muted/40">
										<td className={cn(bodyCellClass, "font-medium text-foreground")}>
											{formatE164(number.e164)}
											{number.label ? (
												<span className="ml-2 text-xs text-muted-foreground">{number.label}</span>
											) : null}
										</td>
										<td className={bodyCellClass}>
											{isForeignAgent ? (
												<span className="text-muted-foreground">
													{number.inboundAgentName
														? `${number.inboundAgentName} (outside this organization)`
														: "Assigned outside this organization"}
												</span>
											) : agentsLoading ? (
												<Skeleton className="h-9 w-56" />
											) : (
												<Select
													value={number.inboundAgentId ?? UNASSIGNED}
													onValueChange={(value) => handleAssign(number, value)}
													disabled={setAgentMutation.isPending || !number.providerRef}
												>
													<SelectTrigger
														className="h-9 w-56"
														aria-label={`Agent for ${number.e164}`}
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{options?.map((agent) => (
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
										<td className={cn(bodyCellClass, "text-right")}>
											<Button
												variant="ghost"
												size="sm"
												className="gap-1.5 text-destructive hover:text-destructive"
												onClick={() => setToRelease(number)}
											>
												<PhoneOffIcon className="size-4" /> Release
											</Button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<BuyNumberDialog open={buyOpen} onOpenChange={setBuyOpen} sourceId={sourceId} />

			<AlertDialog open={!!toRelease} onOpenChange={(open) => !open && setToRelease(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Release {toRelease ? formatE164(toRelease.e164) : ""}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							The number is released back to the carrier and can no longer receive calls. This
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleRelease}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							Release
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function BuyNumberDialog({
	open,
	onOpenChange,
	sourceId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sourceId: string;
}) {
	const searchMutation = useSearchNumbersMutation();
	const purchaseMutation = usePurchaseNumberMutation(sourceId);
	const [country, setCountry] = useState("US");
	const [areaCode, setAreaCode] = useState("");
	const [purchasing, setPurchasing] = useState<string | null>(null);

	const results = searchMutation.data;
	const notConfigured = isNotConfigured(searchMutation.error);

	async function handleSearch() {
		const input: SearchNumbersInput = {
			sourceId,
			country: country.trim() || undefined,
			areaCode: areaCode.trim() || undefined,
			limit: 20,
		};
		try {
			await searchMutation.mutateAsync(input);
		} catch (error) {
			if (!isNotConfigured(error)) {
				toastError(error instanceof Error ? error.message : "Could not search for numbers");
			}
		}
	}

	async function handleBuy(number: string) {
		setPurchasing(number);
		try {
			await purchaseMutation.mutateAsync({ number });
			toastSuccess(`${formatE164(number)} purchased`);
			onOpenChange(false);
			searchMutation.reset();
			setAreaCode("");
		} catch (error) {
			toastError(error instanceof Error ? error.message : "Could not buy the number");
		} finally {
			setPurchasing(null);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Buy a phone number</DialogTitle>
					<DialogDescription>
						Search available numbers and purchase one for this source.
					</DialogDescription>
				</DialogHeader>

				<div className="gap-3 flex items-end">
					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="buy-country">Country</Label>
						<Input
							id="buy-country"
							value={country}
							onChange={(e) => setCountry(e.target.value.toUpperCase())}
							className="w-24"
							maxLength={2}
						/>
					</div>
					<div className="gap-1.5 flex flex-1 flex-col">
						<Label htmlFor="buy-area">Area code</Label>
						<Input
							id="buy-area"
							value={areaCode}
							onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
							placeholder="e.g. 661"
							inputMode="numeric"
						/>
					</div>
					<Button onClick={handleSearch} disabled={searchMutation.isPending} className="gap-2">
						{searchMutation.isPending ? (
							<Spinner className="size-4" />
						) : (
							<SearchIcon className="size-4" />
						)}
						Search
					</Button>
				</div>

				{notConfigured ? (
					<p className="py-6 text-sm text-center opacity-60">
						Phone provisioning isn't set up yet. Add telephony credentials to the engine to buy
						numbers.
					</p>
				) : results ? (
					results.length ? (
						<ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
							{results.map((available) => (
								<li
									key={available.number}
									className="gap-2 px-3 py-2 flex items-center justify-between"
								>
									<div className="min-w-0">
										<p className="font-medium">{formatE164(available.number)}</p>
										{available.locality || available.region ? (
											<p className="text-xs truncate text-muted-foreground">
												{[available.locality, available.region].filter(Boolean).join(", ")}
											</p>
										) : null}
									</div>
									<Button
										size="sm"
										variant="secondary"
										disabled={!!purchasing}
										onClick={() => handleBuy(available.number)}
										className="gap-1.5 shrink-0"
									>
										{purchasing === available.number ? (
											<Spinner className="size-4" />
										) : (
											<PhoneIcon className="size-4" />
										)}
										Buy
									</Button>
								</li>
							))}
						</ul>
					) : (
						<p className="py-6 text-sm text-center opacity-60">
							No numbers matched. Try a different area code.
						</p>
					)
				) : null}

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const headerCellClass =
	"h-10 border-b bg-muted px-3 text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap";
const bodyCellClass = "border-b px-3 py-0 align-middle whitespace-nowrap";

/** +16616155393 → +1 (661) 615-5393; non-NANP numbers pass through unchanged. */
function formatE164(e164: string): string {
	const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	if (match) {
		return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
	}
	return e164;
}
