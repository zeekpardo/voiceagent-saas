"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import {
	CheckIcon,
	ChevronDownIcon,
	GlobeIcon,
	InfoIcon,
	ScrollTextIcon,
	SparklesIcon,
	TriangleAlertIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

/**
 * "AI logs" side panel: everything the AI sent/received to make decisions —
 * LLM calls (ai.turn), tool invocations (tool.*), CRM HTTP traffic
 * (http.request) and the engine's flow/lifecycle breadcrumbs — as a
 * newest-first, filterable log list (CloseBot parity, our design system).
 *
 * Engine-neutral: it renders any `{ type, payload, created_at }` event, so the
 * SAME component backs both the call drawer (call_events) and the omnichannel
 * conversation drawer (conversation_events). Unknown/legacy event types always
 * render as plain info rows: the drawer must never crash on old events.
 */

/** A single engine event — structurally shared by GatewayCallEvent and
 * GatewayConversationEvent, so both drawers reuse these renderers. */
export interface LogEvent {
	type: string;
	payload: Record<string, unknown>;
	created_at: string;
}

type LogKind = "ai" | "tool" | "http" | "info";

const KIND_FILTERS: { value: string; label: string }[] = [
	{ value: "all", label: "All types" },
	{ value: "ai", label: "AI" },
	{ value: "tool", label: "Tools" },
	{ value: "http", label: "HTTP" },
	{ value: "info", label: "Info" },
];

function classify(type: string): LogKind {
	if (type === "ai.turn" || type.startsWith("ai.")) {
		return "ai";
	}
	if (type.startsWith("tool.")) {
		return "tool";
	}
	if (type === "http.request") {
		return "http";
	}
	return "info";
}

export function LogsDrawer({
	events,
	isLoading,
	onClose,
	emptyLabel = "No logs recorded.",
}: {
	events: LogEvent[] | undefined;
	isLoading: boolean;
	onClose: () => void;
	emptyLabel?: string;
}) {
	const [kindFilter, setKindFilter] = useState("all");

	// Newest first, like CloseBot's panel.
	const rows = useMemo(() => {
		const list = [...(events ?? [])].reverse();
		if (kindFilter === "all") {
			return list;
		}
		return list.filter((e) => classify(e.type) === kindFilter);
	}, [events, kindFilter]);

	return (
		<div className="inset-y-0 right-0 absolute z-20 flex w-1/2 max-w-full min-w-[min(400px,100%)] flex-col border-l bg-card shadow-[inset_6px_0_12px_-8px_rgb(0_0_0/0.25)]">
			<div className="h-14 gap-2 px-3 flex shrink-0 items-center border-b bg-card">
				<ScrollTextIcon className="size-4 shrink-0 text-muted-foreground" />
				<h3 className="font-medium text-sm">AI logs</h3>
				<div className="gap-2 ml-auto flex items-center">
					<Select value={kindFilter} onValueChange={setKindFilter}>
						<SelectTrigger className="h-8 w-28 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{KIND_FILTERS.map((f) => (
								<SelectItem key={f.value} value={f.value} className="text-xs">
									{f.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<span className="text-xs whitespace-nowrap text-muted-foreground">
						{rows.length} result{rows.length === 1 ? "" : "s"}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={onClose}
						aria-label="Close AI logs"
					>
						<XIcon className="size-4" />
					</Button>
				</div>
			</div>

			<div className="gap-2 p-3 min-h-0 flex flex-1 flex-col overflow-y-auto">
				{isLoading ? (
					<p className="py-8 text-sm text-center text-muted-foreground">Loading logs…</p>
				) : rows.length === 0 ? (
					<p className="py-8 text-sm text-center text-muted-foreground">{emptyLabel}</p>
				) : (
					rows.map((event, index) => (
						// oxlint-disable-next-line no-array-index-key -- events are static per fetch
						<LogRow key={index} event={event} />
					))
				)}
			</div>
		</div>
	);
}

function LogRow({ event }: { event: LogEvent }) {
	switch (classify(event.type)) {
		case "ai":
			return <AiRow event={event} />;
		case "tool":
			return <ToolRow event={event} />;
		case "http":
			return <HttpRow event={event} />;
		default:
			return <InfoRow event={event} />;
	}
}

/* ---------------------------------- rows --------------------------------- */

function AiRow({ event }: { event: LogEvent }) {
	const [isOpen, setIsOpen] = useState(false);
	const p = event.payload;
	const title = str(p.title) ?? "AI call";
	const model = str(p.model);
	const promptTokens = num(p.prompt_tokens);
	const completionTokens = num(p.completion_tokens);
	const request = Array.isArray(p.request)
		? (p.request as { role?: string; content?: string }[])
		: null;
	const response = str(p.response);

	return (
		<div className="via-fuchsia-500/40 rounded-lg bg-gradient-to-r from-primary/50 to-primary/50 p-px">
			<div className="rounded-[7px] bg-card">
				<button
					type="button"
					onClick={() => setIsOpen((open) => !open)}
					aria-expanded={isOpen}
					className="gap-2 px-3 py-2 flex w-full items-center text-left"
				>
					<SparklesIcon className="size-4 shrink-0 text-primary" />
					<span className="font-medium text-sm truncate">{title}</span>
					<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
						{timeLabel(event.created_at)}
					</span>
					<Chevron isOpen={isOpen} />
				</button>
				{isOpen && (
					<div className="px-3 pb-3 gap-2 pt-2 flex flex-col border-t">
						<div className="gap-1.5 flex flex-wrap items-center">
							{str(p.provider) && <Pill>{str(p.provider)}</Pill>}
							{model && <Pill>{model}</Pill>}
							{(promptTokens != null || completionTokens != null) && (
								<Pill>
									{promptTokens ?? 0} prompt / {completionTokens ?? 0} completion tokens
								</Pill>
							)}
							{str(p.class) && <Pill>{str(p.class)}</Pill>}
						</div>
						{request && request.length > 0 && (
							<Disclosure label="Request">
								<div className="gap-2 flex flex-col">
									{request.map((message, index) => (
										// oxlint-disable-next-line no-array-index-key -- static per fetch
										<div key={index}>
											<p className="font-semibold tracking-wide mb-0.5 text-[10px] text-muted-foreground uppercase">
												{message.role ?? "message"}
											</p>
											<TextBlock text={message.content ?? ""} />
										</div>
									))}
								</div>
							</Disclosure>
						)}
						{response != null && (
							<Disclosure label="Response" defaultOpen>
								<TextBlock text={response} />
							</Disclosure>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function ToolRow({ event }: { event: LogEvent }) {
	const [isOpen, setIsOpen] = useState(false);
	const p = event.payload;
	const isFailure = event.type === "tool.failed" || p.ok === false;
	const label =
		event.type === "tool.invoked"
			? "Invoked"
			: event.type === "tool.result"
				? "Result"
				: event.type === "tool.failed"
					? "Failed"
					: event.type.replace(/^tool\./, "");
	const detail = p.arguments ?? p.result ?? p.error ?? null;

	return (
		<div className="rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="gap-2 px-3 py-2 flex w-full items-center text-left"
			>
				<WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
				<span className="px-2 py-0.5 font-medium text-xs rounded-full bg-muted">
					{str(p.tool) ?? "tool"}
				</span>
				<span className="text-xs text-muted-foreground">{label}</span>
				{isFailure ? (
					<TriangleAlertIcon className="size-3.5 text-rose-500 shrink-0" />
				) : (
					<CheckIcon className="size-3.5 text-emerald-500 shrink-0" />
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{timeLabel(event.created_at)}
				</span>
				<Chevron isOpen={isOpen} />
			</button>
			{isOpen && (
				<div className="px-3 pb-3 pt-2 border-t">
					{detail != null ? (
						<JsonBlock value={detail} />
					) : (
						<p className="text-xs text-muted-foreground">No payload.</p>
					)}
				</div>
			)}
		</div>
	);
}

function HttpRow({ event }: { event: LogEvent }) {
	const [isOpen, setIsOpen] = useState(false);
	const p = event.payload;
	const status = num(p.status);
	const isFailure = p.ok === false || (status != null && status >= 400);

	return (
		<div className="rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="gap-2 px-3 py-2 flex w-full items-center text-left"
			>
				<GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
				<span
					className={cn(
						"font-mono font-semibold text-xs shrink-0",
						isFailure ? "text-rose-500" : "text-emerald-500",
					)}
				>
					{status ?? "—"}
				</span>
				<span className="font-mono text-xs shrink-0">{str(p.method) ?? "GET"}</span>
				<span className="font-mono text-xs truncate text-muted-foreground">{str(p.url)}</span>
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{timeLabel(event.created_at)}
				</span>
				<Chevron isOpen={isOpen} />
			</button>
			{isOpen && (
				<div className="px-3 pb-3 gap-2 pt-2 flex flex-col border-t">
					<Disclosure label="Request">
						<JsonBlock value={p.request ?? null} />
					</Disclosure>
					<Disclosure label="Response" defaultOpen>
						<JsonBlock value={p.response ?? null} />
					</Disclosure>
				</div>
			)}
		</div>
	);
}

function InfoRow({ event }: { event: LogEvent }) {
	const isFailure = /fail|error/.test(event.type);
	return (
		<div className="gap-2 px-3 py-1.5 flex items-center">
			{isFailure ? (
				<TriangleAlertIcon className="size-3.5 text-rose-500 shrink-0" />
			) : (
				<InfoIcon className="size-3.5 shrink-0 text-muted-foreground" />
			)}
			<span className="text-xs min-w-0 flex-1 truncate" title={infoSummary(event)}>
				{infoSummary(event)}
			</span>
			{!isFailure && <CheckIcon className="size-3.5 text-emerald-500 shrink-0" />}
			<span className="shrink-0 text-[10px] text-muted-foreground">
				{timeLabel(event.created_at)}
			</span>
		</div>
	);
}

/* ------------------------------ sub-components ---------------------------- */

function Disclosure({
	label,
	defaultOpen = false,
	children,
}: {
	label: string;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	return (
		<div className="rounded-md border">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="gap-2 px-2 py-1.5 flex w-full items-center text-left"
			>
				<span className="font-medium text-xs">{label}</span>
				<Chevron isOpen={isOpen} />
			</button>
			{isOpen && <div className="px-2 pb-2">{children}</div>}
		</div>
	);
}

function Chevron({ isOpen }: { isOpen: boolean }) {
	return (
		<ChevronDownIcon
			className={cn(
				"size-4 ml-1 shrink-0 text-muted-foreground transition-transform",
				!isOpen && "-rotate-90",
			)}
		/>
	);
}

function Pill({ children }: { children: ReactNode }) {
	return (
		<span className="px-2 py-0.5 rounded-full border text-[10px] text-muted-foreground">
			{children}
		</span>
	);
}

function JsonBlock({ value }: { value: unknown }) {
	let text: string;
	try {
		text = JSON.stringify(value, null, 2) ?? "null";
	} catch {
		text = String(value);
	}
	return <TextBlock text={text} mono />;
}

function TextBlock({ text, mono = true }: { text: string; mono?: boolean }) {
	return (
		<pre
			className={cn(
				"px-2 py-1.5 text-xs max-h-64 rounded overflow-auto bg-muted/50 break-all whitespace-pre-wrap",
				mono ? "font-mono" : "font-sans",
			)}
		>
			{text}
		</pre>
	);
}

/* --------------------------------- helpers -------------------------------- */

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timeLabel(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

/** One-line summary for plain info rows ("Flow node — node: qualify, …"). */
function infoSummary(event: LogEvent): string {
	const name = event.type.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
	const detail = Object.entries(event.payload ?? {})
		.filter(([, v]) => v != null && (typeof v !== "string" || v.length > 0))
		.slice(0, 4)
		.map(([k, v]) => `${k}: ${typeof v === "string" ? v : (JSON.stringify(v) ?? "")}`)
		.join(", ");
	const line = detail ? `${name} — ${detail}` : name;
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
