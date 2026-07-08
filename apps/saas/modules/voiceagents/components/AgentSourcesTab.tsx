"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
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
import { CopyIcon, PlugIcon, PlusIcon, SparklesIcon, Trash2Icon, WandIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
	useAgentSourcesQuery,
	useAttachSourceMutation,
	useAutoMapSourceMutation,
	useCreateSourceFieldMutation,
	useDetachSourceMutation,
	useSaveSourceMappingMutation,
	useSourceCalendarsQuery,
	useSourceCustomFieldsQuery,
	useSourcePipelinesQuery,
	useSourceTagsQuery,
	useSourceTriggerUrlQuery,
	useSourcesQuery,
} from "@sources/lib/api";

interface TagRule {
	extractField: string;
	equals: string;
	tag: string;
}

interface StageRule {
	extractField: string;
	equals: string;
	pipelineId: string;
	stageId: string;
	pipelineName?: string;
	stageName?: string;
}

const NONE = "__none__";

/**
 * Attach/detach Sources for this agent, and — for the selected attached
 * Source — map its extracted call fields onto that sub-account's CRM
 * contacts. Closebot model: one agent can monitor many Sources; field
 * mappings are per (agent, source) since field IDs are account-specific.
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

	const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
	const [attachPick, setAttachPick] = useState<string>(NONE);

	useEffect(() => {
		if (!attached?.length) {
			setSelectedSourceId(null);
			return;
		}
		if (!selectedSourceId || !attached.some((a) => a.sourceId === selectedSourceId)) {
			setSelectedSourceId(attached[0].sourceId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [attached]);

	const attachedIds = new Set((attached ?? []).map((a) => a.sourceId));
	const unattached = (allSources ?? []).filter((s) => !attachedIds.has(s.id));

	const attach = async () => {
		if (attachPick === NONE) return;
		try {
			await attachMutation.mutateAsync(attachPick);
			setSelectedSourceId(attachPick);
			setAttachPick(NONE);
			toastSuccess("Source attached — field mappings synced automatically");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Attach failed");
		}
	};

	const detach = async (sourceId: string) => {
		try {
			await detachMutation.mutateAsync(sourceId);
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

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Attached sources</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{!attached?.length && (
						<p className="text-sm opacity-60">
							This agent isn't monitoring any sources yet — attach one below.
						</p>
					)}
					<div className="flex flex-wrap gap-2">
						{attached?.map((a) => (
							<div
								key={a.sourceId}
								className={`flex items-center gap-1.5 rounded-full border pl-2.5 pr-1 py-1 text-xs transition-colors ${
									selectedSourceId === a.sourceId
										? "border-primary bg-primary/10 text-primary"
										: "hover:bg-muted/50"
								}`}
							>
								<button type="button" onClick={() => setSelectedSourceId(a.sourceId)}>
									{a.source.name}
								</button>
								<button
									type="button"
									aria-label={`Detach ${a.source.name}`}
									onClick={() => void detach(a.sourceId)}
									className="opacity-50 hover:opacity-100"
								>
									<XIcon className="size-3" />
								</button>
							</div>
						))}
					</div>
					{unattached.length > 0 && (
						<div className="flex items-center gap-2">
							<Select value={attachPick} onValueChange={setAttachPick}>
								<SelectTrigger className="w-64">
									<SelectValue placeholder="Attach a source…" />
								</SelectTrigger>
								<SelectContent>
									{unattached.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								size="sm"
								variant="outline"
								disabled={attachPick === NONE}
								loading={attachMutation.isPending}
								onClick={attach}
							>
								<PlusIcon className="size-4" /> Attach
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{selectedSourceId && (
				<SourceMappingEditor
					key={selectedSourceId}
					agentId={agentId}
					sourceId={selectedSourceId}
					sourceName={attached?.find((a) => a.sourceId === selectedSourceId)?.source.name ?? ""}
					agentConfig={agentConfig}
				/>
			)}
		</div>
	);
}

function SourceMappingEditor({
	agentId,
	sourceId,
	sourceName,
	agentConfig,
}: {
	agentId: string;
	sourceId: string;
	sourceName: string;
	agentConfig: Record<string, unknown>;
}) {
	const { data: crmFields, isLoading: fieldsLoading } = useSourceCustomFieldsQuery(sourceId);
	const { data: crmTags } = useSourceTagsQuery(sourceId);
	const { data: crmPipelines } = useSourcePipelinesQuery(sourceId);
	const { data: crmCalendars } = useSourceCalendarsQuery(sourceId);
	const { data: attached, isLoading: mappingLoading } = useAgentSourcesQuery(agentId);
	const mapping = attached?.find((a) => a.sourceId === sourceId);
	const saveMutation = useSaveSourceMappingMutation(agentId);
	const createFieldMutation = useCreateSourceFieldMutation(sourceId);
	const autoMapMutation = useAutoMapSourceMutation(agentId);
	const { data: triggerUrl } = useSourceTriggerUrlQuery(agentId, sourceId);

	const extractFields = Object.keys(
		((agentConfig.postCall as { extract?: Record<string, string> } | undefined)?.extract ?? {}),
	);

	const [enabled, setEnabled] = useState(true);
	const [writeNote, setWriteNote] = useState(true);
	const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
	const [tagRules, setTagRules] = useState<TagRule[]>([]);
	const [stageRules, setStageRules] = useState<StageRule[]>([]);
	const [bookingCalendarId, setBookingCalendarId] = useState<string>(NONE);

	useEffect(() => {
		if (!mapping) return;
		setEnabled(mapping.enabled);
		setWriteNote(mapping.writeNote);
		setFieldMap(
			Object.fromEntries(
				(mapping.fieldMappings as { extractField: string; crmFieldId: string }[]).map((m) => [
					m.extractField,
					m.crmFieldId,
				]),
			),
		);
		setTagRules(mapping.tagRules as unknown as TagRule[]);
		setStageRules((mapping.stageRules ?? []) as unknown as StageRule[]);
		setBookingCalendarId(mapping.bookingCalendarId ?? NONE);
	}, [mapping]);

	if (mappingLoading || fieldsLoading) return <Skeleton className="h-64" />;

	if (extractFields.length === 0) {
		return (
			<Card>
				<CardContent className="py-10 text-center opacity-60 text-sm">
					This agent has no extracted fields yet. Add them in Configure → "After the call" —
					each one can then be mapped to a CRM contact field on {sourceName}.
				</CardContent>
			</Card>
		);
	}

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
			setFieldMap((prev) => ({ ...prev, [extractField]: created.id }));
			toastSuccess(`Created "${created.name}" in ${sourceName}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Field creation failed");
		}
	};

	const save = async () => {
		try {
			await saveMutation.mutateAsync({
				sourceId,
				enabled,
				writeNote,
				fieldMappings: Object.entries(fieldMap)
					.filter(([, crmFieldId]) => crmFieldId && crmFieldId !== NONE)
					.map(([extractField, crmFieldId]) => ({
						extractField,
						crmFieldId,
						crmFieldName: crmFields?.find((f) => f.id === crmFieldId)?.name,
					})),
				tagRules: tagRules.filter((r) => r.extractField && r.equals && r.tag),
				stageRules: stageRules
					.filter((r) => r.extractField && r.equals && r.pipelineId && r.stageId)
					.map((r) => ({
						...r,
						pipelineName: crmPipelines?.find((p) => p.id === r.pipelineId)?.name,
						stageName: crmPipelines
							?.find((p) => p.id === r.pipelineId)
							?.stages.find((st) => st.id === r.stageId)?.name,
					})),
				bookingCalendarId: bookingCalendarId === NONE ? null : bookingCalendarId,
				bookingCalendarName:
					bookingCalendarId === NONE
						? null
						: (crmCalendars?.find((c) => c.id === bookingCalendarId)?.name ?? null),
			});
			toastSuccess("Source mapping saved");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Save failed");
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Contact field updates — {sourceName}
						<Badge status={enabled ? "success" : "info"}>{enabled ? "on" : "off"}</Badge>
						<div className="ml-auto flex items-center gap-2 text-sm font-normal">
							<span className="opacity-60">Sync enabled</span>
							<Switch checked={enabled} onCheckedChange={setEnabled} />
						</div>
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-3 -mt-2">
						<p className="text-sm opacity-60">
							After every call from {sourceName}, each captured value below is written to the
							mapped CRM custom field on the contact ("unknown" values never overwrite existing
							data).
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
					{extractFields.map((ef) => (
						<div key={ef} className="flex items-center gap-3">
							<span className="font-mono text-xs w-52 shrink-0 truncate">{ef}</span>
							<span className="opacity-40">→</span>
							<Select
								value={fieldMap[ef] ?? NONE}
								onValueChange={(v) => setFieldMap((prev) => ({ ...prev, [ef]: v }))}
							>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder="Not synced" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>— not synced —</SelectItem>
									{crmFields?.map((f) => (
										<SelectItem key={f.id} value={f.id}>
											{f.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{(!fieldMap[ef] || fieldMap[ef] === NONE) && (
								<Button
									variant="outline"
									size="sm"
									loading={createFieldMutation.isPending}
									onClick={() => createAndBind(ef)}
									title={`Create "Voice: ${ef}" as a new custom field in ${sourceName}`}
								>
									<SparklesIcon className="size-4" /> Create in CRM
								</Button>
							)}
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Tag rules</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<p className="text-sm opacity-60">
						Add a tag to the contact when a captured value matches — e.g. when{" "}
						<code>appointment_booked</code> equals <code>true</code>, tag{" "}
						<code>voice-appt-booked</code>.
					</p>
					{tagRules.map((rule, i) => (
						<div key={`${i}-${rule.extractField}`} className="flex items-center gap-2">
							<Select
								value={rule.extractField || undefined}
								onValueChange={(v) =>
									setTagRules((prev) => prev.map((r, j) => (j === i ? { ...r, extractField: v } : r)))
								}
							>
								<SelectTrigger className="w-56">
									<SelectValue placeholder="captured field" />
								</SelectTrigger>
								<SelectContent>
									{extractFields.map((ef) => (
										<SelectItem key={ef} value={ef}>
											{ef}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-xs opacity-60">equals</span>
							<Input
								className="w-32"
								value={rule.equals}
								onChange={(e) =>
									setTagRules((prev) =>
										prev.map((r, j) => (j === i ? { ...r, equals: e.target.value } : r)),
									)
								}
								placeholder="true"
							/>
							<span className="text-xs opacity-60">→ tag</span>
							<Input
								value={rule.tag}
								list="source-tag-options"
								onChange={(e) =>
									setTagRules((prev) =>
										prev.map((r, j) => (j === i ? { ...r, tag: e.target.value } : r)),
									)
								}
								placeholder="voice-appt-booked"
							/>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setTagRules((prev) => prev.filter((_, j) => j !== i))}
							>
								<Trash2Icon className="size-4" />
							</Button>
						</div>
					))}
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() => setTagRules((prev) => [...prev, { extractField: "", equals: "", tag: "" }])}
					>
						<PlusIcon className="size-4" /> Add rule
					</Button>
				</CardContent>
			</Card>
			<datalist id="source-tag-options">
				{crmTags?.map((t) => (
					<option key={t} value={t} />
				))}
			</datalist>

			<Card>
				<CardHeader>
					<CardTitle>Pipeline stage rules</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<p className="text-sm opacity-60">
						Move the contact's opportunity to a pipeline stage when a captured value matches —
						e.g. when <code>lead_temperature</code> equals <code>hot</code>, move to{" "}
						<code>Hot Leads</code>. If the contact has no opportunity in that pipeline, one is
						created.
					</p>
					{!crmPipelines?.length && (
						<p className="text-sm opacity-50">No pipelines found in {sourceName}.</p>
					)}
					{stageRules.map((rule, i) => {
						const pipeline = crmPipelines?.find((p) => p.id === rule.pipelineId);
						return (
							<div key={`stage-${i}-${rule.extractField}`} className="flex items-center gap-2 flex-wrap">
								<Select
									value={rule.extractField || undefined}
									onValueChange={(v) =>
										setStageRules((prev) =>
											prev.map((r, j) => (j === i ? { ...r, extractField: v } : r)),
										)
									}
								>
									<SelectTrigger className="w-48">
										<SelectValue placeholder="captured field" />
									</SelectTrigger>
									<SelectContent>
										{extractFields.map((ef) => (
											<SelectItem key={ef} value={ef}>
												{ef}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<span className="text-xs opacity-60">equals</span>
								<Input
									className="w-28"
									value={rule.equals}
									onChange={(e) =>
										setStageRules((prev) =>
											prev.map((r, j) => (j === i ? { ...r, equals: e.target.value } : r)),
										)
									}
									placeholder="hot"
								/>
								<span className="text-xs opacity-60">→</span>
								<Select
									value={rule.pipelineId || undefined}
									onValueChange={(v) =>
										setStageRules((prev) =>
											prev.map((r, j) => (j === i ? { ...r, pipelineId: v, stageId: "" } : r)),
										)
									}
								>
									<SelectTrigger className="w-44">
										<SelectValue placeholder="pipeline" />
									</SelectTrigger>
									<SelectContent>
										{crmPipelines?.map((pl) => (
											<SelectItem key={pl.id} value={pl.id}>
												{pl.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={rule.stageId || undefined}
									onValueChange={(v) =>
										setStageRules((prev) => prev.map((r, j) => (j === i ? { ...r, stageId: v } : r)))
									}
								>
									<SelectTrigger className="w-44">
										<SelectValue placeholder="stage" />
									</SelectTrigger>
									<SelectContent>
										{pipeline?.stages.map((st) => (
											<SelectItem key={st.id} value={st.id}>
												{st.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setStageRules((prev) => prev.filter((_, j) => j !== i))}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						);
					})}
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						onClick={() =>
							setStageRules((prev) => [
								...prev,
								{ extractField: "", equals: "", pipelineId: "", stageId: "" },
							])
						}
					>
						<PlusIcon className="size-4" /> Add stage rule
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Booking calendar</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<p className="text-sm opacity-60">
						The calendar the agent checks and books into with <code>check_availability</code> /{" "}
						<code>book_appointment</code> for calls from {sourceName}. The agent can still name a
						different calendar explicitly.
					</p>
					{crmCalendars && crmCalendars.length === 0 ? (
						<p className="text-sm opacity-50">
							No calendars visible. Enable calendar scopes on your GHL marketplace app
							(calendars.readonly, calendars/events.readonly, calendars/events.write) and
							reconnect.
						</p>
					) : (
						<Select value={bookingCalendarId} onValueChange={setBookingCalendarId}>
							<SelectTrigger className="w-72">
								<SelectValue placeholder="— none —" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>— none —</SelectItem>
								{crmCalendars?.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Trigger calls from {sourceName}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<p className="text-sm opacity-60">
						Add a webhook action to any {sourceName} workflow and point it at this URL — the
						workflow's contact gets an outbound call from this agent, with their CRM details
						available as {"{{variables}}"}. Requires an outbound phone number on the engine.
					</p>
					<div className="flex items-center gap-2">
						<Input readOnly value={triggerUrl?.url ?? ""} className="font-mono text-xs" />
						<Button
							variant="outline"
							size="icon"
							aria-label="Copy trigger URL"
							className="shrink-0"
							onClick={copyTriggerUrl}
						>
							<CopyIcon className="size-4" />
						</Button>
					</div>
					<p className="text-xs opacity-50">
						Keep this URL secret — anyone who has it can place calls with this agent.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="flex items-center justify-between py-4">
					<div>
						<p className="font-medium text-sm">Write call note to contact</p>
						<p className="text-xs opacity-60">
							Summary + captured values appear on the contact's timeline after each call
						</p>
					</div>
					<Switch checked={writeNote} onCheckedChange={setWriteNote} />
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button loading={saveMutation.isPending} onClick={save}>
					Save source mapping
				</Button>
			</div>
		</div>
	);
}
