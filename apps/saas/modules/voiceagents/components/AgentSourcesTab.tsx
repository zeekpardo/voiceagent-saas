"use client";

import { type MessageChannel, MESSAGE_CHANNEL_LABELS } from "@repo/api/modules/crm/lib/channels";
import { normalizeName } from "@repo/api/modules/crm/lib/normalize";
import { readCustomVariableDefs } from "@repo/api/modules/voiceagents/lib/custom-variables";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { avatarClasses, initials } from "@shared/lib/avatar";
import {
	useAgentSourcesQuery,
	useAttachSourceMutation,
	useAutoMapSourceMutation,
	useCreateSourceFieldMutation,
	useDetachSourceMutation,
	useSaveSourceMappingMutation,
	useSourceTagsQuery,
	useSourceTriggerUrlQuery,
	useSourcesQuery,
} from "@sources/lib/api";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import {
	ArrowLeftIcon,
	CheckIcon,
	ChevronDownIcon,
	CopyIcon,
	PlugIcon,
	PlusIcon,
	SearchIcon,
	SparklesIcon,
	TagIcon,
	TriangleAlertIcon,
	WandIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useNumbersQuery } from "../lib/api";
import { ContactFieldPicker } from "./ContactFieldPicker";

/** Sentinel for "use the gateway/trunk default" — Radix Select forbids "" values. */
const DEFAULT_FROM = "__default__";
/** Sentinel that switches the from-number field to free-text E.164 entry. */
const CUSTOM_FROM = "__custom__";

function formatE164(e164: string): string {
	const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
	if (match) return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
	return e164;
}

interface TagFilter {
	tag: string;
	mode: "is" | "is_not";
}

/** Channel chips, in display order (SMS first, like the CloseBot reference). */
const CHANNEL_CHIP_ORDER: MessageChannel[] = [
	"sms",
	"fb",
	"ig",
	"email",
	"whatsapp",
	"gmb",
	"live_chat",
	"custom",
];

function SourceAvatar({ name }: { name: string }) {
	return (
		<span
			className={cn(
				"size-6 font-medium flex shrink-0 items-center justify-center rounded-full text-[10px]",
				avatarClasses(name),
			)}
		>
			{initials(name)}
		</span>
	);
}

/**
 * CloseBot-style Sources workspace panel: a searchable list of the sources
 * this agent monitors (click a row to drill in), and a per-source detail view
 * with tag filters, field sync and the workflow trigger URL. One agent, many
 * sub-accounts — every setting here is scoped to the (agent, source) pair, so
 * nothing bleeds across locations.
 */
export function AgentSourcesTab({
	agentId,
	agentConfig,
}: {
	agentId: string;
	agentConfig: Record<string, unknown>;
}) {
	const { data: allSources, isLoading: allSourcesLoading } = useSourcesQuery();
	const { data: attached, isLoading: attachedLoading } = useAgentSourcesQuery(agentId);
	const attachMutation = useAttachSourceMutation(agentId);
	const detachMutation = useDetachSourceMutation(agentId);

	const [openSourceId, setOpenSourceId] = useState<string | null>(null);
	const [isAdding, setIsAdding] = useState(false);
	const [search, setSearch] = useState("");

	const attachedIds = new Set((attached ?? []).map((a) => a.sourceId));

	const filtered = (attached ?? []).filter((a) =>
		a.source.name.toLowerCase().includes(search.trim().toLowerCase()),
	);

	const attach = async (sourceId: string) => {
		try {
			await attachMutation.mutateAsync(sourceId);
			toastSuccess("Source attached — field mappings synced automatically");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Attach failed");
		}
	};

	const detach = async (sourceId: string) => {
		try {
			await detachMutation.mutateAsync(sourceId);
			if (openSourceId === sourceId) setOpenSourceId(null);
			toastSuccess("Source detached");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Detach failed");
		}
	};

	if (allSourcesLoading || attachedLoading) return <Skeleton className="h-64" />;

	if (!allSources?.length) {
		return (
			<div className="gap-3 flex flex-col">
				<p className="text-sm opacity-70">
					No sources connected yet. Connect a CRM sub-account first, then attach it here.
				</p>
				<Button asChild variant="outline">
					<Link href="/sources">
						<PlugIcon className="size-4" /> Go to Sources
					</Link>
				</Button>
			</div>
		);
	}

	const openRow = attached?.find((a) => a.sourceId === openSourceId);
	if (openSourceId && openRow) {
		return (
			<SourceDetail
				key={openSourceId}
				agentId={agentId}
				sourceId={openSourceId}
				sourceName={openRow.source.name}
				agentConfig={agentConfig}
				onBack={() => setOpenSourceId(null)}
			/>
		);
	}

	// Add view (closebot-style): every org source in one list — attached ones
	// dimmed with a check, the rest attach on click and stay here so several
	// can be added in a row.
	if (isAdding) {
		const addFiltered = (allSources ?? []).filter((s) =>
			s.name.toLowerCase().includes(search.trim().toLowerCase()),
		);
		return (
			<div className="gap-4 flex flex-col">
				<div className="gap-2 flex items-center">
					<button
						type="button"
						aria-label="Back to attached sources"
						onClick={() => {
							setIsAdding(false);
							setSearch("");
						}}
						className="p-1 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ArrowLeftIcon className="size-4" />
					</button>
					<div className="relative flex-1">
						<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search sources..."
							className="h-9 pl-8 text-sm rounded-lg"
						/>
					</div>
				</div>
				{!addFiltered.length ? (
					<p className="py-6 text-sm text-center opacity-60">No sources match "{search}"</p>
				) : (
					<div className="divide-y">
						{addFiltered.map((s) => {
							const isAttached = attachedIds.has(s.id);
							if (isAttached) {
								return (
									<div
										key={s.id}
										className="gap-2.5 px-3 flex h-[52px] cursor-default items-center opacity-40"
									>
										<SourceAvatar name={s.name} />
										<span className="min-w-0 font-medium text-sm flex-1 truncate">{s.name}</span>
										<CheckIcon className="size-3.5 shrink-0 text-muted-foreground" />
									</div>
								);
							}
							return (
								<button
									key={s.id}
									type="button"
									disabled={attachMutation.isPending}
									onClick={() => void attach(s.id)}
									className="gap-2.5 px-3 flex h-[52px] w-full items-center rounded-lg text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
								>
									<SourceAvatar name={s.name} />
									<span className="min-w-0 font-medium text-sm flex-1 truncate">{s.name}</span>
									<PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
								</button>
							);
						})}
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					Missing a sub-account?{" "}
					<Link href="/sources" className="underline hover:text-foreground">
						Connect it on the Sources page
					</Link>{" "}
					first.
				</p>
			</div>
		);
	}

	return (
		<div className="gap-4 flex flex-col">
			<div className="gap-2 flex items-center">
				<div className="relative flex-1">
					<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter sources..."
						className="h-9 pl-8 text-sm rounded-lg"
					/>
				</div>
				<Button
					size="sm"
					variant="primary"
					className="shrink-0"
					onClick={() => {
						setIsAdding(true);
						setSearch("");
					}}
				>
					<PlusIcon className="size-4" /> New
				</Button>
			</div>

			{!filtered.length ? (
				<p className="py-6 text-sm text-center opacity-60">
					{attached?.length
						? `No sources match "${search}"`
						: "This agent isn't monitoring any sources yet — attach one with New."}
				</p>
			) : (
				<div className="divide-y">
					{filtered.map((a) => {
						const mappedCount = (a.fieldMappings as unknown[]).length;
						const filterCount = ((a.tagFilters ?? []) as unknown[]).length;
						const meta = [
							`${mappedCount} ${mappedCount === 1 ? "field" : "fields"} synced`,
							...(filterCount > 0
								? [`${filterCount} ${filterCount === 1 ? "filter" : "filters"}`]
								: []),
						].join(" · ");
						return (
							<div
								key={a.sourceId}
								className="gap-2.5 px-3 flex h-[52px] items-center rounded-lg transition-colors hover:bg-muted/50"
							>
								<button
									type="button"
									onClick={() => setOpenSourceId(a.sourceId)}
									className="min-w-0 gap-2.5 flex flex-1 items-center text-left"
								>
									<SourceAvatar name={a.source.name} />
									<span className="min-w-0 flex-1">
										<span className="font-medium text-sm block truncate">{a.source.name}</span>
										<span className="text-[11px] text-muted-foreground">{meta}</span>
									</span>
								</button>
								<button
									type="button"
									aria-label={`Detach ${a.source.name}`}
									onClick={() => void detach(a.sourceId)}
									className="p-0.5 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
								>
									<XIcon className="size-3.5" />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function Section({
	title,
	hint,
	children,
	defaultOpen = true,
}: {
	title: string;
	hint?: React.ReactNode;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div>
			<div className="gap-1.5 pb-2 flex w-full items-center border-b">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="group gap-1.5 flex flex-1 items-center"
				>
					<ChevronDownIcon
						className={cn(
							"size-3 text-muted-foreground transition-transform",
							!open && "-rotate-90",
						)}
					/>
					<h4 className="font-semibold tracking-wide text-[11px] text-muted-foreground uppercase transition-colors group-hover:text-foreground">
						{title}
					</h4>
				</button>
				{hint}
			</div>
			{open && <div className="px-1 pt-4">{children}</div>}
		</div>
	);
}

function SourceDetail({
	agentId,
	sourceId,
	sourceName,
	agentConfig,
	onBack,
}: {
	agentId: string;
	sourceId: string;
	sourceName: string;
	agentConfig: Record<string, unknown>;
	onBack: () => void;
}) {
	const { data: crmTags } = useSourceTagsQuery(sourceId);
	const { data: attached, isLoading: mappingLoading } = useAgentSourcesQuery(agentId);
	const mapping = attached?.find((a) => a.sourceId === sourceId);
	const saveMutation = useSaveSourceMappingMutation(agentId);
	const createFieldMutation = useCreateSourceFieldMutation(sourceId);
	const autoMapMutation = useAutoMapSourceMutation(agentId);
	const { data: triggerUrl } = useSourceTriggerUrlQuery(agentId, sourceId);
	const { data: numbers } = useNumbersQuery();

	// Caller ID appended to the copied trigger URL as `?from=`. Defaults to the
	// gateway/trunk default (no param) so existing copy/paste habits don't
	// suddenly require picking a number.
	const [fromSelect, setFromSelect] = useState<string>(DEFAULT_FROM);
	const [customFrom, setCustomFrom] = useState("");
	const selectedFrom = fromSelect === CUSTOM_FROM ? customFrom.trim() : fromSelect;
	const triggerUrlWithFrom = useMemo(() => {
		if (!triggerUrl?.url) return "";
		if (fromSelect === DEFAULT_FROM || !selectedFrom) return triggerUrl.url;
		// Digits only — CRM webhook editors (GHL included) re-encode pasted URLs,
		// turning an encoded "+" (%2B) into %252B and corrupting the number. Bare
		// digits survive any re-encoding; the trigger route normalizes to E.164.
		return `${triggerUrl.url}?from=${selectedFrom.replace(/\D/g, "")}`;
	}, [triggerUrl?.url, fromSelect, selectedFrom]);

	const extractFields = Object.keys(
		(agentConfig.postCall as { extract?: Record<string, string> } | undefined)?.extract ?? {},
	);
	// Agent-level Job Flow Variable definitions — each gets a per-source value input.
	const customVariables = useMemo(() => readCustomVariableDefs(agentConfig), [agentConfig]);

	// Hydrate once per mount — the component is keyed by sourceId.
	const [enabled, setEnabled] = useState(() => mapping?.enabled ?? true);
	// Per extractField: the picked contact field (key + label). Legacy saved
	// mappings may only have crmFieldId/crmFieldName or standardField — resolve
	// those to a best-effort key/label so the picker preselects correctly.
	const [fieldMap, setFieldMap] = useState<
		Record<string, { contactField?: string; contactFieldLabel?: string }>
	>(() =>
		Object.fromEntries(
			(
				(mapping?.fieldMappings ?? []) as {
					extractField: string;
					contactField?: string;
					contactFieldLabel?: string;
					standardField?: string;
					crmFieldId?: string;
					crmFieldName?: string;
				}[]
			).map((m) => [
				m.extractField,
				{
					contactField: m.contactField ?? m.standardField ?? m.crmFieldName ?? undefined,
					contactFieldLabel: m.contactFieldLabel ?? m.crmFieldName ?? undefined,
				},
			]),
		),
	);
	const [tagFilters, setTagFilters] = useState<TagFilter[]>(() =>
		((mapping?.tagFilters ?? []) as unknown as TagFilter[]).filter((f) => f?.tag),
	);
	// Per-source variable value overrides, keyed by variable name. Hydrated once.
	const [variableValues, setVariableValues] = useState<Record<string, string>>(
		() => (mapping?.variableValues ?? {}) as Record<string, string>,
	);
	const [channels, setChannels] = useState<MessageChannel[]>(() =>
		((mapping?.channels ?? []) as MessageChannel[]).filter((c) => CHANNEL_CHIP_ORDER.includes(c)),
	);
	const toggleChannel = (channel: MessageChannel) =>
		setChannels((prev) =>
			prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
		);
	const [tagSearch, setTagSearch] = useState("");
	const [filterOpen, setFilterOpen] = useState(false);

	const tagOptions = useMemo(() => {
		const q = tagSearch.trim().toLowerCase();
		const used = new Set(tagFilters.map((f) => f.tag.toLowerCase()));
		return (crmTags ?? [])
			.filter((t) => !used.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q)))
			.slice(0, 30);
	}, [crmTags, tagSearch, tagFilters]);

	if (mappingLoading) return <Skeleton className="h-64" />;

	const autoMap = async () => {
		try {
			const result = await autoMapMutation.mutateAsync(sourceId);
			const parts = [
				result.matched.length > 0 ? `matched ${result.matched.length} existing` : "",
				result.created.length > 0 ? `created ${result.created.length} new` : "",
			].filter(Boolean);
			toastSuccess(
				parts.length > 0
					? `All fields mapped — ${parts.join(", ")} in ${sourceName}`
					: "All fields were already mapped",
			);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Auto-map failed");
		}
	};

	const copyTriggerUrl = async () => {
		if (!triggerUrlWithFrom) return;
		await navigator.clipboard.writeText(triggerUrlWithFrom);
		toastSuccess(
			fromSelect === DEFAULT_FROM || !selectedFrom
				? "Trigger URL copied"
				: "Trigger URL copied — calls will use this from-number",
		);
	};

	const createAndBind = async (extractField: string) => {
		try {
			const created = await createFieldMutation.mutateAsync(`Voice: ${extractField}`);
			// Mirror the unified key formula from listContactFields on the server
			// (provider key, else "contact.<normalized name>") so the picker's
			// cached list (invalidated by the mutation) resolves to the same entry.
			const key = created.key || `contact.${normalizeName(created.name)}`;
			setFieldMap((prev) => ({
				...prev,
				[extractField]: { contactField: key, contactFieldLabel: created.name },
			}));
			toastSuccess(`Created "${created.name}" in ${sourceName}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Field creation failed");
		}
	};

	const addFilter = (mode: TagFilter["mode"], tag: string) => {
		setTagFilters((prev) => [...prev, { tag, mode }]);
		setTagSearch("");
		setFilterOpen(false);
	};

	const save = async () => {
		try {
			await saveMutation.mutateAsync({
				sourceId,
				enabled,
				channels,
				fieldMappings: Object.entries(fieldMap)
					.filter(([, m]) => m.contactField)
					.map(([extractField, m]) => ({
						extractField,
						contactField: m.contactField,
						contactFieldLabel: m.contactFieldLabel,
					})),
				tagFilters,
				// Tagging / stage moves are workflow concerns now — pass any stored
				// rules through untouched.
				tagRules: (mapping?.tagRules ?? []) as {
					extractField: string;
					equals: string;
					tag: string;
				}[],
				stageRules: (mapping?.stageRules ?? []) as {
					extractField: string;
					equals: string;
					pipelineId: string;
					stageId: string;
					pipelineName?: string;
					stageName?: string;
				}[],
				// Keep only values for still-defined variables, dropping empties so
				// they fall back to the definition default at dispatch.
				variableValues: Object.fromEntries(
					customVariables
						.map((v) => [v.name, (variableValues[v.name] ?? "").trim()] as const)
						.filter(([, value]) => value.length > 0),
				),
			});
			toastSuccess("Source settings saved");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Save failed");
		}
	};

	return (
		<div className="gap-4 flex flex-col">
			<div className="gap-2.5 pb-3 flex items-center border-b">
				<button
					type="button"
					aria-label="Back to sources"
					onClick={onBack}
					className="p-1 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<ArrowLeftIcon className="size-4" />
				</button>
				<SourceAvatar name={sourceName} />
				<span className="font-semibold text-sm truncate">{sourceName}</span>
				<div className="gap-2 text-sm ml-auto flex items-center">
					<span className="text-xs text-muted-foreground">Active</span>
					<Switch checked={enabled} onCheckedChange={setEnabled} />
				</div>
			</div>

			<div className="gap-1.5 border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-600 text-xs dark:text-amber-400 flex items-center rounded-lg border">
				<TriangleAlertIcon className="size-3.5 shrink-0" />
				<span>
					Settings here apply to {sourceName} only — other locations using this agent are
					unaffected.
				</span>
			</div>

			<div className="gap-4 pt-1 flex flex-col">
				<Section
					title="Channels"
					hint={
						<InfoHint>
							Text channels this agent monitors for this source. When a contact messages on an
							enabled channel, this agent replies on the same channel. One agent per channel per
							source.
						</InfoHint>
					}
				>
					<div className="gap-2 flex flex-wrap items-center">
						{CHANNEL_CHIP_ORDER.map((channel) => {
							const active = channels.includes(channel);
							return (
								<button
									key={channel}
									type="button"
									aria-pressed={active}
									onClick={() => toggleChannel(channel)}
									className={cn(
										"gap-1.5 px-3 py-1.5 font-medium text-xs inline-flex items-center rounded-full border transition-colors",
										active
											? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
											: "text-muted-foreground hover:bg-muted/60",
									)}
								>
									{active ? (
										<CheckIcon className="size-3 shrink-0" />
									) : (
										<PlusIcon className="size-3 shrink-0 opacity-60" />
									)}
									{MESSAGE_CHANNEL_LABELS[channel]}
								</button>
							);
						})}
					</div>
				</Section>

				<Section
					title="Filters"
					hint={
						<InfoHint>
							Every condition must match for the agent to call a contact from this source — e.g. add
							tag is not "ai off" to respect opt-outs.
						</InfoHint>
					}
				>
					<div className="gap-2 flex flex-wrap items-center">
						{tagFilters.map((filter, i) => (
							<span
								key={`${filter.mode}-${filter.tag}`}
								className="gap-1 px-3 py-1.5 text-xs inline-flex items-center rounded-full border"
							>
								<TagIcon className="size-3 shrink-0 text-muted-foreground" />
								<span className="text-muted-foreground">tag</span>
								<span
									className={cn(
										"font-semibold",
										filter.mode === "is_not" ? "text-red-500" : "text-emerald-600",
									)}
								>
									{filter.mode === "is_not" ? "is not" : "is"}
								</span>
								<span className="font-semibold">{filter.tag}</span>
								<button
									type="button"
									aria-label={`Remove filter ${filter.tag}`}
									onClick={() => setTagFilters((prev) => prev.filter((_, j) => j !== i))}
									className="ml-0.5 opacity-50 hover:opacity-100"
								>
									<XIcon className="size-3" />
								</button>
							</span>
						))}
						<Popover open={filterOpen} onOpenChange={setFilterOpen}>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="gap-1 px-2 py-1 font-semibold text-violet-600 text-xs hover:bg-violet-500/10 dark:text-violet-400 inline-flex items-center rounded-md transition-colors"
								>
									<PlusIcon className="size-3" /> Add filter
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64 p-2">
								<div className="mb-1.5 relative">
									<SearchIcon className="left-2.5 size-3.5 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={tagSearch}
										onChange={(e) => setTagSearch(e.target.value)}
										placeholder="Search tags..."
										className="h-8 pl-8 text-sm"
									/>
								</div>
								<div className="max-h-48 overflow-y-auto">
									{tagOptions.length === 0 ? (
										<p className="px-2 py-1.5 text-xs opacity-50">
											{crmTags?.length ? "No matching tags" : "No tags in this CRM yet"}
										</p>
									) : (
										tagOptions.map((tag) => (
											<div
												key={tag}
												className="gap-1 px-2 py-1 flex items-center rounded-md hover:bg-muted/60"
											>
												<TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="min-w-0 text-sm flex-1 truncate">{tag}</span>
												<button
													type="button"
													onClick={() => addFilter("is", tag)}
													className="rounded px-1.5 py-0.5 font-medium text-emerald-600 text-xs hover:bg-emerald-500/10"
												>
													is
												</button>
												<button
													type="button"
													onClick={() => addFilter("is_not", tag)}
													className="rounded px-1.5 py-0.5 font-medium text-red-500 text-xs hover:bg-red-500/10"
												>
													is not
												</button>
											</div>
										))
									)}
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</Section>

				<Section
					title="Field sync"
					hint={
						<InfoHint>
							After every call, each captured value is written to the mapped CRM custom field —
							"unknown" values never overwrite existing data.
						</InfoHint>
					}
				>
					<div className="gap-3 flex flex-col">
						<div className="flex justify-end">
							<Button
								variant="outline"
								size="sm"
								className="shrink-0"
								loading={autoMapMutation.isPending}
								onClick={autoMap}
								title={`Match each captured field to a ${sourceName} custom field by name, creating any that don't exist`}
							>
								<WandIcon className="size-4" /> Set up for me
							</Button>
						</div>
						{extractFields.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								This agent has no extracted fields yet — add them in Agent settings → "After the
								call".
							</p>
						) : (
							extractFields.map((ef) => (
								<div key={ef} className="gap-2 flex items-center">
									<span className="w-40 font-mono text-xs shrink-0 truncate">{ef}</span>
									<span className="opacity-40">→</span>
									<ContactFieldPicker
										sourceId={sourceId}
										value={fieldMap[ef]?.contactField ?? null}
										placeholder="Not synced"
										className="flex-1"
										onChange={(key, label) =>
											setFieldMap((prev) => ({
												...prev,
												[ef]: {
													contactField: key ?? undefined,
													contactFieldLabel: label ?? undefined,
												},
											}))
										}
									/>
									{!fieldMap[ef]?.contactField && (
										<Button
											variant="ghost"
											size="icon"
											className="size-8 shrink-0"
											aria-label={`Create "Voice: ${ef}" in ${sourceName}`}
											title={`Create "Voice: ${ef}" as a new custom field in ${sourceName}`}
											loading={createFieldMutation.isPending}
											onClick={() => createAndBind(ef)}
										>
											<SparklesIcon className="size-4" />
										</Button>
									)}
								</div>
							))
						)}
					</div>
				</Section>

				{customVariables.length > 0 && (
					<Section
						title="Variables"
						hint={
							<InfoHint>
								Per-source values for this job's custom variables. Leave blank to use the variable's
								default; a value here overrides the default for {sourceName} only.
							</InfoHint>
						}
					>
						<div className="gap-3 flex flex-col">
							{customVariables.map((v) => (
								<div key={v.name} className="gap-2 flex items-center">
									<span
										className="w-40 font-mono text-xs shrink-0 truncate"
										title={v.description || v.name}
									>
										{v.name}
									</span>
									<Input
										value={variableValues[v.name] ?? ""}
										onChange={(e) =>
											setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))
										}
										placeholder={v.default ? `Default: ${v.default}` : "Use default"}
										className="h-8 text-sm flex-1"
									/>
								</div>
							))}
						</div>
					</Section>
				)}

				<Section
					title="Trigger URL"
					defaultOpen={false}
					hint={
						<InfoHint side="left">
							Point a {sourceName} workflow webhook at this URL to place an outbound call from this
							agent — the contact's CRM details become {"{{variables}}"}. In {sourceName}: Workflow
							→ trigger "Contact Tag Added" → action "Wait" (e.g. 10 min) → action "Webhook" (POST
							this URL). Keep the URL secret — anyone who has it can place calls with this agent.
						</InfoHint>
					}
				>
					<div className="gap-3 flex flex-col">
						<div className="gap-1.5 flex flex-col">
							<span className="font-medium text-xs text-muted-foreground">
								From number (caller ID)
							</span>
							<div className="gap-2 flex items-center">
								<Select value={fromSelect} onValueChange={setFromSelect}>
									<SelectTrigger className="h-8 text-xs flex-1" aria-label="From number">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={DEFAULT_FROM}>
											<span className="text-muted-foreground">Gateway default</span>
										</SelectItem>
										{numbers?.map((n) => (
											<SelectItem key={n.id} value={n.e164}>
												{formatE164(n.e164)}
											</SelectItem>
										))}
										<SelectItem value={CUSTOM_FROM}>Custom number…</SelectItem>
									</SelectContent>
								</Select>
								{fromSelect === CUSTOM_FROM && (
									<Input
										value={customFrom}
										onChange={(e) => setCustomFrom(e.target.value)}
										placeholder="+16505550123"
										className="h-8 w-40 font-mono text-xs"
									/>
								)}
							</div>
						</div>

						<div className="gap-2 flex items-center">
							<Input readOnly value={triggerUrlWithFrom} className="h-8 font-mono text-xs" />
							<Button
								variant="outline"
								size="icon"
								aria-label="Copy trigger URL"
								className="size-8 shrink-0"
								onClick={copyTriggerUrl}
							>
								<CopyIcon className="size-4" />
							</Button>
						</div>
					</div>
				</Section>
			</div>

			<div className="pt-3 flex justify-end border-t">
				<Button size="sm" loading={saveMutation.isPending} onClick={save}>
					Save
				</Button>
			</div>
		</div>
	);
}
