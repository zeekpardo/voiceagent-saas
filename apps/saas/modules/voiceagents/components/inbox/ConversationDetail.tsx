"use client";

import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ChevronDownIcon, ExternalLinkIcon, MessageSquareIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { useTranscriptQuery } from "../../lib/api";
import { useContactMatchQuery } from "@sources/lib/api";
import {
	avatarClasses,
	type Call,
	callDisplayName,
	formatClockTime,
	formatDateTime,
	formatDuration,
	initials,
	prettifyKey,
	STATUS_BADGE,
	turnTimestamp,
	usableExtractedEntries,
} from "./helpers";

export function ConversationDetail({
	call,
	agentName,
}: {
	call: Call | null;
	agentName: string | null;
}) {
	if (!call) {
		return (
			<div className="gap-2 flex h-full flex-col items-center justify-center text-muted-foreground">
				<MessageSquareIcon className="size-8 opacity-50" />
				<p className="text-sm">Select a call</p>
			</div>
		);
	}

	return <ConversationDetailInner key={call.id} call={call} agentName={agentName} />;
}

function ConversationDetailInner({ call, agentName }: { call: Call; agentName: string | null }) {
	const { data: transcript, isLoading } = useTranscriptQuery(call.id);
	const { data: contactMatch } = useContactMatchQuery(call);
	const contact = contactMatch?.contact ?? null;
	// Prefer the real CRM name as the conversation title when we have one.
	const name = contact?.name || callDisplayName(call);
	const duration = formatDuration(call.duration_seconds);
	const summary = transcript?.summary ?? call.summary;
	const extracted = usableExtractedEntries(transcript?.extracted ?? call.extracted);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="h-14 gap-3 px-4 flex shrink-0 items-center border-b">
				<span
					className={cn(
						"size-8 font-medium text-xs flex shrink-0 items-center justify-center rounded-full",
						avatarClasses(name),
					)}
				>
					{initials(name)}
				</span>
				<h2 className="font-medium text-sm truncate">{name}</h2>
				{agentName && (
					<span className="px-2 py-0.5 text-xs shrink-0 rounded-full bg-muted text-muted-foreground">
						{agentName}
					</span>
				)}
				<div className="gap-2 flex shrink-0 items-center ml-auto">
					{duration && <span className="text-xs text-muted-foreground">{duration}</span>}
					<Badge status={STATUS_BADGE[call.status] ?? "info"}>{call.status}</Badge>
					{contact ? (
						<ContactChip name={contact.name} url={contact.url} />
					) : (
						call.metadata?.crm_contact_id && (
							<span className="px-2 py-0.5 text-xs rounded-full border text-muted-foreground">
								CRM linked
							</span>
						)
					)}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<SummaryCard call={call} summary={summary ?? null} extracted={extracted} />

				<div className="px-4 py-4 mx-auto w-full max-w-3xl">
					{isLoading ? (
						<TranscriptSkeleton />
					) : transcript?.turns.length ? (
						<TranscriptBubbles call={call} name={name} turns={transcript.turns} />
					) : (
						<p className="py-8 text-center text-sm text-muted-foreground">
							No transcript recorded.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

/** CRM contact pill — deep links to the contact in the CRM when possible. */
function ContactChip({ name, url }: { name: string | null; url: string | null }) {
	const label = name ?? "CRM contact";
	if (!url) {
		return (
			<span className="gap-1 px-2 py-0.5 text-xs flex shrink-0 items-center rounded-full bg-primary/10 text-primary">
				{label}
			</span>
		);
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			title="Open in GoHighLevel"
			className="gap-1 px-2 py-0.5 text-xs flex max-w-48 shrink-0 items-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
		>
			<span className="truncate">{label}</span>
			<ExternalLinkIcon className="size-3 shrink-0" />
		</a>
	);
}

function SummaryCard({
	call,
	summary,
	extracted,
}: {
	call: Call;
	summary: string | null;
	extracted: [string, string][];
}) {
	const [isOpen, setIsOpen] = useState(true);
	const duration = formatDuration(call.duration_seconds);
	const startedAt = call.started_at ?? call.created_at;

	return (
		<div className="top-0 px-4 pt-3 sticky z-10 bg-card">
			<div className="rounded-lg border bg-muted/30">
				<button
					type="button"
					onClick={() => setIsOpen((open) => !open)}
					aria-expanded={isOpen}
					className="gap-2 px-4 py-2.5 text-sm flex w-full items-center text-left"
				>
					<span className="font-medium">Call summary</span>
					<span className="text-xs text-muted-foreground">
						{duration ? `${duration} · ` : ""}
						{formatDateTime(startedAt)}
					</span>
					<ChevronDownIcon
						className={cn(
							"size-4 ml-auto shrink-0 text-muted-foreground transition-transform",
							!isOpen && "-rotate-90",
						)}
					/>
				</button>

				{isOpen && (
					<div className="px-4 pb-3 gap-3 flex flex-col border-t pt-3">
						{summary ? (
							<p className="text-sm leading-relaxed">{summary}</p>
						) : (
							<p className="text-sm text-muted-foreground">No summary for this call.</p>
						)}
						{extracted.length > 0 && (
							<dl className="gap-x-6 gap-y-1.5 grid grid-cols-1 sm:grid-cols-2">
								{extracted.map(([key, value]) => (
									<div key={key} className="gap-2 text-sm flex items-baseline justify-between">
										<dt className="shrink-0 text-muted-foreground">{prettifyKey(key)}</dt>
										<dd className="font-medium truncate text-right">{value}</dd>
									</div>
								))}
							</dl>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

interface TranscriptTurn {
	role: string;
	text: string;
	ts?: number;
}

const TIME_GAP_MS = 10 * 60 * 1000;

function TranscriptBubbles({
	call,
	name,
	turns,
}: {
	call: Call;
	name: string;
	turns: TranscriptTurn[];
}) {
	const hasTimestamps = turns.some((turn) => turn.ts != null);

	return (
		<div className="flex flex-col">
			{!hasTimestamps && (
				<TimeSeparator label={formatDateTime(call.started_at ?? call.created_at)} />
			)}
			{turns.map((turn, index) => {
				const isCaller = turn.role === "user";
				const previous = index > 0 ? turns[index - 1] : null;
				const isGrouped = previous?.role === turn.role;
				const next = index < turns.length - 1 ? turns[index + 1] : null;
				const isLastInGroup = next?.role !== turn.role;

				const currentTs = turnTimestamp(turn.ts, call.started_at);
				const previousTs = previous ? turnTimestamp(previous.ts, call.started_at) : null;
				const showSeparator =
					hasTimestamps &&
					currentTs != null &&
					(previous == null ||
						(previousTs != null && currentTs.getTime() - previousTs.getTime() > TIME_GAP_MS));

				return (
					// oxlint-disable-next-line no-array-index-key -- turns are static per fetch
					<Fragment key={index}>
						{showSeparator && <TimeSeparator label={formatClockTime(currentTs)} />}
						<div
							className={cn(
								"gap-2 flex items-end",
								isCaller ? "justify-start" : "justify-end",
								isGrouped && !showSeparator ? "mt-1" : "mt-4",
							)}
						>
							{isCaller && (
								<span
									className={cn(
										"size-7 font-medium text-[10px] flex shrink-0 items-center justify-center rounded-full",
										avatarClasses(name),
										!isLastInGroup && "invisible",
									)}
								>
									{initials(name)}
								</span>
							)}
							<div
								className={cn(
									"rounded-2xl px-4 py-3 text-sm max-w-lg whitespace-pre-wrap",
									isCaller ? "bg-muted" : "bg-primary/10",
									isLastInGroup && (isCaller ? "rounded-bl-md" : "rounded-br-md"),
								)}
							>
								{turn.text}
							</div>
						</div>
					</Fragment>
				);
			})}
		</div>
	);
}

function TimeSeparator({ label }: { label: string }) {
	return (
		<div className="py-3 text-xs flex items-center justify-center text-muted-foreground">
			{label}
		</div>
	);
}

function TranscriptSkeleton() {
	return (
		<div className="gap-4 flex flex-col">
			<Skeleton className="h-14 ml-9 w-3/5 rounded-2xl" />
			<Skeleton className="h-14 w-3/5 self-end rounded-2xl" />
			<Skeleton className="h-10 ml-9 w-2/5 rounded-2xl" />
			<Skeleton className="h-14 w-1/2 self-end rounded-2xl" />
		</div>
	);
}
