"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
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

import { ContactFieldPicker } from "./ContactFieldPicker";

interface TagFilter {
	tag: string;
	mode: "is" | "is_not";
}

/** Mirrors the server's `normalizeName` (crm/lib/standard-fields.ts) for deriving a fallback field key. */
function normalize(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Deterministic pastel per source name — same trick as the inbox avatars. */
const AVATAR_COLORS = [
	"bg-rose-400",
	"bg-violet-400",
	"bg-sky-400",
	"bg-emerald-400",
	"bg-amber-400",
	"bg-slate-400",
];

function avatarColor(name: string): string {
	let hash = 0;
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]!.toUpperCase())
			.join("") || "?"
	);
}

function SourceAvatar({ name }: { name: string }) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-[10px] text-white",
				avatarColor(name),
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
			<div className="flex flex-col gap-3">
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
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<button
						type="button"
						aria-label="Back to attached sources"
						onClick={() => {
							setIsAdding(false);
							setSearch("");
						}}
						className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ArrowLeftIcon className="size-4" />
					</button>
					<div className="relative flex-1">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search sources..."
							className="h-9 rounded-lg pl-8 text-sm"
						/>
					</div>
				</div>
				{!addFiltered.length ? (
					<p className="py-6 text-center text-sm opacity-60">No sources match "{search}"</p>
				) : (
					<div className="divide-y">
						{addFiltered.map((s) => {
							const isAttached = attachedIds.has(s.id);
							if (isAttached) {
								return (
									<div
										key={s.id}
										className="flex h-[52px] cursor-default items-center gap-2.5 px-3 opacity-40"
									>
										<SourceAvatar name={s.name} />
										<span className="min-w-0 flex-1 truncate font-medium text-sm">{s.name}</span>
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
									className="flex h-[52px] w-full items-center gap-2.5 rounded-lg px-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
								>
									<SourceAvatar name={s.name} />
									<span className="min-w-0 flex-1 truncate font-medium text-sm">{s.name}</span>
									<PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
								</button>
							);
						})}
					</div>
				)}
				<p className="text-muted-foreground text-xs">
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
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter sources..."
						className="h-9 rounded-lg pl-8 text-sm"
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
				<p className="py-6 text-center text-sm opacity-60">
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
							...(filterCount > 0 ? [`${filterCount} ${filterCount === 1 ? "filter" : "filters"}`] : []),
						].join(" · ");
						return (
							<div
								key={a.sourceId}
								className="flex h-[52px] items-center gap-2.5 rounded-lg px-3 transition-colors hover:bg-muted/50"
							>
								<button
									type="button"
									onClick={() => setOpenSourceId(a.sourceId)}
									className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
								>
									<SourceAvatar name={a.source.name} />
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-sm">{a.source.name}</span>
										<span className="text-[11px] text-muted-foreground">{meta}</span>
									</span>
								</button>
								<button
									type="button"
									aria-label={`Detach ${a.source.name}`}
									onClick={() => void detach(a.sourceId)}
									className="shrink-0 p-0.5 text-muted-foreground transition-colors hover:text-destructive"
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
	children,
	defaultOpen = true,
}: {
	title: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="group flex w-full items-center gap-1.5 border-b pb-2"
			>
				<ChevronDownIcon
					className={cn("size-3 text-muted-foreground transition-transform", !open && "-rotate-90")}
				/>
				<h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide transition-colors group-hover:text-foreground">
					{title}
				</h4>
			</button>
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

	const extractFields = Object.keys(
		((agentConfig.postCall as { extract?: Record<string, string> } | undefined)?.extract ?? {}),
	);

	// Hydrate once per mount — the component is keyed by sourceId.
	const [enabled, setEnabled] = useState(() => mapping?.enabled ?? true);
	const [writeNote, setWriteNote] = useState(() => mapping?.writeNote ?? true);
	// Per extractField: the picked contact field (key + label). Legacy saved
	// mappings may only have crmFieldId/crmFieldName or standardField — resolve
	// those to a best-effort key/label so the picker preselects correctly.
	const [fieldMap, setFieldMap] = useState<Record<string, { contactField?: string; contactFieldLabel?: string }>>(
		() =>
			Object.fromEntries(
				((mapping?.fieldMappings ?? []) as {
					extractField: string;
					contactField?: string;
					contactFieldLabel?: string;
					standardField?: string;
					crmFieldId?: string;
					crmFieldName?: string;
				}[]).map((m) => [
					m.extractField,
					{
						contactField: m.contactField ?? m.standardField ?? m.crmFieldName ?? undefined,
						contactFieldLabel: m.contactFieldLabel ?? m.crmFieldName ?? undefined,
					},
				]),
			),
	);
	const [tagFilters, setTagFilters] = useState<TagFilter[]>(
		() => ((mapping?.tagFilters ?? []) as unknown as TagFilter[]).filter((f) => f?.tag),
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
		if (!triggerUrl?.url) return;
		await navigator.clipboard.writeText(triggerUrl.url);
		toastSuccess("Trigger URL copied");
	};

	const createAndBind = async (extractField: string) => {
		try {
			const created = await createFieldMutation.mutateAsync(`Voice: ${extractField}`);
			// Mirror the unified key formula from listContactFields on the server
			// (provider key, else "contact.<normalized name>") so the picker's
			// cached list (invalidated by the mutation) resolves to the same entry.
			const key = created.key || `contact.${normalize(created.name)}`;
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
				writeNote,
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
				tagRules: (mapping?.tagRules ?? []) as { extractField: string; equals: string; tag: string }[],
				stageRules: (mapping?.stageRules ?? []) as {
					extractField: string;
					equals: string;
					pipelineId: string;
					stageId: string;
					pipelineName?: string;
					stageName?: string;
				}[],
			});
			toastSuccess("Source settings saved");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Save failed");
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2.5 border-b pb-3">
				<button
					type="button"
					aria-label="Back to sources"
					onClick={onBack}
					className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<ArrowLeftIcon className="size-4" />
				</button>
				<SourceAvatar name={sourceName} />
				<span className="truncate font-semibold text-sm">{sourceName}</span>
				<div className="ml-auto flex items-center gap-2 text-sm">
					<span className="text-muted-foreground text-xs">Active</span>
					<Switch checked={enabled} onCheckedChange={setEnabled} />
				</div>
			</div>

			<div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-600 text-xs dark:text-amber-400">
				<TriangleAlertIcon className="size-3.5 shrink-0" />
				<span>Settings here apply to {sourceName} only — other locations using this agent are unaffected.</span>
			</div>

			<div className="flex flex-col gap-4 pt-1">
				<Section title="Filters">
					<div className="flex flex-wrap items-center gap-2">
						{tagFilters.map((filter, i) => (
							<span
								key={`${filter.mode}-${filter.tag}`}
								className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs"
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
									className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-violet-600 text-xs transition-colors hover:bg-violet-500/10 dark:text-violet-400"
								>
									<PlusIcon className="size-3" /> Add filter
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64 p-2">
								<div className="relative mb-1.5">
									<SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
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
											<div key={tag} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/60">
												<TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="min-w-0 flex-1 truncate text-sm">{tag}</span>
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
					<p className="mt-2 text-muted-foreground text-xs">
						Every condition must match for the agent to call a contact from this source — e.g.
						add <span className="font-medium">tag is not "ai off"</span> to respect opt-outs.
					</p>
				</Section>

				<Section title="Field sync">
					<div className="flex flex-col gap-3">
						<div className="flex items-start justify-between gap-3">
							<p className="text-muted-foreground text-xs">
								After every call, each captured value is written to the mapped CRM custom field
								("unknown" values never overwrite existing data).
							</p>
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
							<p className="text-muted-foreground text-xs">
								This agent has no extracted fields yet — add them in Agent settings → "After the
								call".
							</p>
						) : (
							extractFields.map((ef) => (
								<div key={ef} className="flex items-center gap-2">
									<span className="w-40 shrink-0 truncate font-mono text-xs">{ef}</span>
									<span className="opacity-40">→</span>
									<ContactFieldPicker
										sourceId={sourceId}
										value={fieldMap[ef]?.contactField ?? null}
										placeholder="Not synced"
										className="flex-1"
										onChange={(key, label) =>
											setFieldMap((prev) => ({
												...prev,
												[ef]: { contactField: key ?? undefined, contactFieldLabel: label ?? undefined },
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

				<Section title="Trigger URL" defaultOpen={false}>
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-xs">
							Point a {sourceName} workflow webhook at this URL to place an outbound call from
							this agent — the contact's CRM details become {"{{variables}}"}.
						</p>
						<div className="flex items-center gap-2">
							<Input readOnly value={triggerUrl?.url ?? ""} className="h-8 font-mono text-xs" />
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
						<p className="text-muted-foreground text-xs opacity-70">
							Keep this URL secret — anyone who has it can place calls with this agent.
						</p>
					</div>
				</Section>

				<Section title="Call notes" defaultOpen={false}>
					<div className="flex items-center justify-between gap-3">
						<p className="text-muted-foreground text-xs">
							Write a summary + captured values to the contact's timeline after each call.
						</p>
						<Switch checked={writeNote} onCheckedChange={setWriteNote} />
					</div>
				</Section>
			</div>

			<div className="flex justify-end border-t pt-3">
				<Button size="sm" loading={saveMutation.isPending} onClick={save}>
					Save
				</Button>
			</div>
		</div>
	);
}
