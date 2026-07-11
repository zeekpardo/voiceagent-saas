"use client";

import {
	type WidgetAppearance,
	type WidgetIcon,
	type WidgetStyle,
	type WidgetVisualizer,
	widgetTargetingMatches,
} from "@repo/api/modules/voiceagents/lib/widget-config";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import {
	type SourceWidgetDto,
	type UpdateWidgetInput,
	useUpdateWidgetMutation,
} from "@sources/lib/api";
import { useAgentsQuery } from "@voiceagents/lib/api";
import {
	AudioLinesIcon,
	CheckIcon,
	CopyIcon,
	CreditCardIcon,
	HeadphonesIcon,
	HelpCircleIcon,
	type LucideIcon,
	MessageCircleIcon,
	MessageSquareIcon,
	MicIcon,
	PanelRightIcon,
	PlusIcon,
	RectangleHorizontalIcon,
	SmileIcon,
	SparklesIcon,
	WavesIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { composeWidgetIdSnippet, normalizeWidgetOrigin } from "../../lib/widget-snippet";
import { InfoHint } from "../shared/InfoHint";
import { WidgetPreview } from "./WidgetPreview";

const STYLE_OPTIONS: { value: WidgetStyle; label: string; icon: LucideIcon }[] = [
	{ value: "bubble", label: "Bubble", icon: MessageCircleIcon },
	{ value: "card", label: "Card", icon: CreditCardIcon },
	{ value: "panel", label: "Panel", icon: PanelRightIcon },
	{ value: "bar", label: "Bar", icon: RectangleHorizontalIcon },
];

const ICON_OPTIONS: { value: WidgetIcon; icon: LucideIcon }[] = [
	{ value: "chat", icon: MessageSquareIcon },
	{ value: "help", icon: HelpCircleIcon },
	{ value: "smile", icon: SmileIcon },
	{ value: "headset", icon: HeadphonesIcon },
	{ value: "mic", icon: MicIcon },
];

const VISUALIZER_OPTIONS: { value: WidgetVisualizer; label: string; icon: LucideIcon }[] = [
	{ value: "bars", label: "Bars", icon: AudioLinesIcon },
	{ value: "pulse", label: "Pulse", icon: SparklesIcon },
	{ value: "waveform", label: "Waveform", icon: WavesIcon },
	{ value: "dots", label: "Dots", icon: MessageCircleIcon },
];

/**
 * Per-widget editor: two-column layout with the config tabs on the left
 * (Appearance / Target / Behavior) and a live static WidgetPreview on the
 * right, plus a sticky Save footer and the ID-based install snippet. Local
 * state mirrors the row and only persists on Save (via the update mutation),
 * so tweaking appearance updates the preview instantly with no round-trips.
 */
export function WidgetEditor({
	sourceId,
	widget,
	onClose,
}: {
	sourceId: string;
	widget: SourceWidgetDto;
	onClose: () => void;
}) {
	const { data: agents } = useAgentsQuery();
	const update = useUpdateWidgetMutation(sourceId);

	const [name, setName] = useState(widget.name);
	const [agentId, setAgentId] = useState(widget.agentId);
	const [origins, setOrigins] = useState<string[]>(widget.origins);
	const [appearance, setAppearance] = useState<WidgetAppearance>(widget.appearance);
	const [targeting, setTargeting] = useState(widget.targeting);
	const [behavior, setBehavior] = useState(widget.behavior);

	const patch = (p: Partial<WidgetAppearance>) => setAppearance((a) => ({ ...a, ...p }));

	// Everything above is local state that only persists on Save — losing an
	// origins allowlist or targeting rules to a stray refresh is a real footgun,
	// so track dirtiness against the stored row and guard unload/cancel.
	const isDirty =
		name !== widget.name ||
		agentId !== widget.agentId ||
		JSON.stringify(origins) !== JSON.stringify(widget.origins) ||
		JSON.stringify(appearance) !== JSON.stringify(widget.appearance) ||
		JSON.stringify(targeting) !== JSON.stringify(widget.targeting) ||
		JSON.stringify(behavior) !== JSON.stringify(widget.behavior);

	useEffect(() => {
		if (!isDirty) return;
		const warn = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [isDirty]);

	const cancel = () => {
		if (isDirty && !window.confirm("You have unsaved changes — discard them?")) {
			return;
		}
		onClose();
	};

	const save = () => {
		if (!appearance.voice && !appearance.chat) {
			toastError("Turn on at least one of voice or chat.");
			return;
		}
		const input: UpdateWidgetInput = {
			id: widget.id,
			name: name.trim() || "Widget",
			agentId,
			origins,
			appearance,
			targeting,
			behavior,
		};
		update.mutate(input, {
			onSuccess: () => {
				toastSuccess("Widget saved.");
				onClose();
			},
			onError: (err) =>
				toastError(err instanceof Error ? err.message : "Could not save the widget"),
		});
	};

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-6 lg:flex-row flex flex-col">
				{/* LEFT — config tabs */}
				<div className="lg:w-[480px] shrink-0">
					<Tabs defaultValue="appearance">
						<TabsList className="mb-4">
							<TabsTrigger value="appearance">Appearance</TabsTrigger>
							<TabsTrigger value="target">Target</TabsTrigger>
							<TabsTrigger value="behavior">Behavior</TabsTrigger>
						</TabsList>

						<TabsContent
							value="appearance"
							className="gap-5 pr-1 flex max-h-[560px] flex-col overflow-y-auto"
						>
							<Field label="Name">
								<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
							</Field>

							<Field label="Agent workflow">
								<Select value={agentId} onValueChange={setAgentId}>
									<SelectTrigger>
										<SelectValue placeholder="Select an agent…" />
									</SelectTrigger>
									<SelectContent>
										{(agents ?? []).map((agent) => (
											<SelectItem key={agent.id} value={agent.id}>
												{agent.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field label="Style">
								<div className="gap-2 grid grid-cols-4">
									{STYLE_OPTIONS.map(({ value, label, icon: Icon }) => (
										<Tile
											key={value}
											active={appearance.style === value}
											onClick={() => patch({ style: value })}
										>
											<Icon className="size-4" />
											<span className="text-xs">{label}</span>
										</Tile>
									))}
								</div>
							</Field>

							{appearance.style !== "card" && appearance.style !== "bar" && (
								<Field label="Position">
									<Segmented
										value={appearance.position}
										options={[
											{ value: "left", label: "Left" },
											{ value: "right", label: "Right" },
										]}
										onChange={(v) => patch({ position: v })}
									/>
								</Field>
							)}

							<Field label="Accent color">
								<div className="gap-2 flex items-center">
									<input
										type="color"
										aria-label="Accent color"
										value={
											/^#[0-9a-fA-F]{6}$/.test(appearance.accent) ? appearance.accent : "#6366f1"
										}
										onChange={(e) => patch({ accent: e.target.value })}
										className="size-8 rounded p-0.5 cursor-pointer border bg-transparent"
									/>
									<Input
										className="h-8 w-28 font-mono text-xs"
										value={appearance.accent}
										onChange={(e) => patch({ accent: e.target.value })}
									/>
								</div>
							</Field>

							<Field label="Theme">
								<Select
									value={appearance.theme}
									onValueChange={(v) => patch({ theme: v as WidgetAppearance["theme"] })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="system">System</SelectItem>
										<SelectItem value="light">Light</SelectItem>
										<SelectItem value="dark">Dark</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field label="Icon">
								<div className="gap-2 flex">
									{ICON_OPTIONS.map(({ value, icon: Icon }) => (
										<Tile
											key={value}
											active={appearance.icon === value}
											onClick={() => patch({ icon: value })}
											className="flex-1"
										>
											<Icon className="size-4" />
										</Tile>
									))}
								</div>
							</Field>

							<Field label="Header title">
								<Input
									value={appearance.headerTitle}
									onChange={(e) => patch({ headerTitle: e.target.value })}
									maxLength={80}
								/>
							</Field>

							<Field label="Welcome message">
								<Textarea
									value={appearance.welcomeMessage}
									onChange={(e) => patch({ welcomeMessage: e.target.value })}
									placeholder="Shown as the first message before a visitor starts."
									rows={2}
									maxLength={500}
								/>
							</Field>

							<Field label="Text input placeholder">
								<Input
									value={appearance.placeholder}
									onChange={(e) => patch({ placeholder: e.target.value })}
									maxLength={120}
								/>
							</Field>

							<Field label="Voice visualizer">
								<div className="gap-2 grid grid-cols-4">
									{VISUALIZER_OPTIONS.map(({ value, label, icon: Icon }) => (
										<Tile
											key={value}
											active={appearance.visualizer === value}
											onClick={() => patch({ visualizer: value })}
										>
											<Icon className="size-4" />
											<span className="text-xs">{label}</span>
										</Tile>
									))}
								</div>
							</Field>

							<div className="gap-3 flex flex-col">
								<SwitchRow
									label="Visitor can talk"
									checked={appearance.voice}
									onChange={(v) => patch({ voice: v })}
								/>
								<SwitchRow
									label="Visitor can chat"
									checked={appearance.chat}
									onChange={(v) => patch({ chat: v })}
								/>
								<SwitchRow
									label="Show online dot"
									checked={appearance.showOnlineDot}
									onChange={(v) => patch({ showOnlineDot: v })}
								/>
							</div>

							<OriginsEditor origins={origins} onChange={setOrigins} />
						</TabsContent>

						<TabsContent value="target" className="pr-1 max-h-[560px] overflow-y-auto">
							<TargetTab targeting={targeting} onChange={setTargeting} />
						</TabsContent>

						<TabsContent value="behavior" className="pr-1 max-h-[560px] overflow-y-auto">
							<BehaviorTab behavior={behavior} onChange={setBehavior} />
						</TabsContent>
					</Tabs>
				</div>

				{/* RIGHT — live preview */}
				<div className="flex-1">
					<div className="lg:sticky lg:top-4">
						<WidgetPreview appearance={appearance} />
						<InstallSnippet widgetId={widget.id} />
					</div>
				</div>
			</div>

			{/* Sticky save footer */}
			<div className="py-3 -mx-6 px-6 gap-2 bottom-0 sticky flex items-center justify-end border-t bg-background">
				{isDirty && (
					<span className="text-xs text-amber-600 dark:text-amber-400 mr-auto">
						Unsaved changes
					</span>
				)}
				<Button variant="ghost" onClick={cancel} disabled={update.isPending}>
					Cancel
				</Button>
				<Button onClick={save} disabled={update.isPending}>
					{update.isPending ? "Saving…" : "Save widget"}
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- target tab

function TargetTab({
	targeting,
	onChange,
}: {
	targeting: SourceWidgetDto["targeting"];
	onChange: (t: SourceWidgetDto["targeting"]) => void;
}) {
	const [testUrl, setTestUrl] = useState("");
	const result = useMemo(() => {
		if (!testUrl.trim()) return null;
		return widgetTargetingMatches(testUrl, targeting);
	}, [testUrl, targeting]);

	const setRules = (key: "include" | "exclude", rules: { pattern: string }[]) =>
		onChange({ ...targeting, [key]: rules });

	return (
		<div className="gap-5 flex flex-col">
			<p className="text-xs text-muted-foreground">
				Control which pages show the widget. Leave <strong>Show on</strong> empty to show on every
				page. Use <code>*</code> as a wildcard (e.g. <code>/blog/*</code>). Hide rules always win.
			</p>

			<RuleList
				label="Show on these pages"
				emptyHint="Empty = every page"
				rules={targeting.include}
				onChange={(rules) => setRules("include", rules)}
			/>
			<RuleList
				label="Hide on these pages"
				emptyHint="No pages hidden"
				rules={targeting.exclude}
				onChange={(rules) => setRules("exclude", rules)}
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Test a URL</Label>
				<Input
					value={testUrl}
					onChange={(e) => setTestUrl(e.target.value)}
					placeholder="https://your-site.com/pricing"
				/>
				{result !== null && (
					<span
						className={cn(
							"text-xs font-medium",
							result ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
						)}
					>
						{result ? "✓ Widget would show on this URL" : "✕ Widget would be hidden on this URL"}
					</span>
				)}
			</div>
		</div>
	);
}

function RuleList({
	label,
	emptyHint,
	rules,
	onChange,
}: {
	label: string;
	emptyHint: string;
	rules: { pattern: string }[];
	onChange: (rules: { pattern: string }[]) => void;
}) {
	return (
		<div className="gap-2 flex flex-col">
			<Label>{label}</Label>
			{rules.length === 0 && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
			{rules.map((rule, i) => (
				<div key={i} className="gap-2 flex items-center">
					<Input
						className="h-8 font-mono text-xs"
						value={rule.pattern}
						placeholder="/pricing or *checkout*"
						onChange={(e) => {
							const next = rules.slice();
							next[i] = { pattern: e.target.value };
							onChange(next);
						}}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						aria-label="Remove rule"
						onClick={() => onChange(rules.filter((_, j) => j !== i))}
					>
						<XIcon className="size-4" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-fit"
				onClick={() => onChange([...rules, { pattern: "" }])}
			>
				<PlusIcon className="size-4" /> Add rule
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------- behavior tab

function BehaviorTab({
	behavior,
	onChange,
}: {
	behavior: SourceWidgetDto["behavior"];
	onChange: (b: SourceWidgetDto["behavior"]) => void;
}) {
	return (
		<div className="gap-4 flex flex-col">
			<p className="text-xs text-muted-foreground">
				Automatically open the widget to nudge visitors. Each trigger fires at most once per visitor
				session.
			</p>

			<TriggerCard
				title="Exit intent"
				description="Open when the visitor moves to leave the page."
				enabled={behavior.exitIntent.enabled}
				onToggle={(v) =>
					onChange({ ...behavior, exitIntent: { ...behavior.exitIntent, enabled: v } })
				}
			/>

			<TriggerCard
				title="Time on page"
				description="Open after the visitor has been on the page a while."
				enabled={behavior.timeOnPage.enabled}
				onToggle={(v) =>
					onChange({ ...behavior, timeOnPage: { ...behavior.timeOnPage, enabled: v } })
				}
			>
				<div className="gap-2 flex items-center">
					<Input
						type="number"
						min={1}
						max={3600}
						className="h-8 w-24"
						value={behavior.timeOnPage.seconds}
						onChange={(e) =>
							onChange({
								...behavior,
								timeOnPage: {
									...behavior.timeOnPage,
									seconds: clamp(Number(e.target.value), 1, 3600),
								},
							})
						}
					/>
					<span className="text-xs text-muted-foreground">seconds</span>
				</div>
			</TriggerCard>

			<TriggerCard
				title="Scroll depth"
				description="Open once the visitor scrolls far enough down the page."
				enabled={behavior.scrollPercent.enabled}
				onToggle={(v) =>
					onChange({ ...behavior, scrollPercent: { ...behavior.scrollPercent, enabled: v } })
				}
			>
				<div className="gap-2 flex items-center">
					<Input
						type="number"
						min={1}
						max={100}
						className="h-8 w-24"
						value={behavior.scrollPercent.percent}
						onChange={(e) =>
							onChange({
								...behavior,
								scrollPercent: {
									...behavior.scrollPercent,
									percent: clamp(Number(e.target.value), 1, 100),
								},
							})
						}
					/>
					<span className="text-xs text-muted-foreground">% scrolled</span>
				</div>
			</TriggerCard>
		</div>
	);
}

function TriggerCard({
	title,
	description,
	enabled,
	onToggle,
	children,
}: {
	title: string;
	description: string;
	enabled: boolean;
	onToggle: (v: boolean) => void;
	children?: React.ReactNode;
}) {
	return (
		<div className="gap-3 p-3 flex flex-col rounded-lg border">
			<div className="gap-3 flex items-start justify-between">
				<div className="gap-0.5 flex flex-col">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-xs text-muted-foreground">{description}</span>
				</div>
				<Switch checked={enabled} onCheckedChange={onToggle} />
			</div>
			{enabled && children}
		</div>
	);
}

// ---------------------------------------------------------------- origins

function OriginsEditor({
	origins,
	onChange,
}: {
	origins: string[];
	onChange: (o: string[]) => void;
}) {
	const [draft, setDraft] = useState("");
	const add = () => {
		const value = normalizeWidgetOrigin(draft);
		if (!value) {
			toastError('Enter a website like example.com — or "*" for any site (dev only)');
			return;
		}
		if (!origins.includes(value)) onChange([...origins, value]);
		setDraft("");
	};
	return (
		<Field label="Allowed websites">
			<InfoHint>
				Only these origins can start conversations with this widget. Use <code>*</code> to allow any
				site — handy while developing, but don't ship it.
			</InfoHint>
			{origins.length > 0 && (
				<div className="gap-1.5 flex flex-wrap">
					{origins.map((origin) => (
						<span
							key={origin}
							className={cn(
								"gap-1 py-0.5 pl-2 pr-1 text-xs font-mono inline-flex items-center rounded-full border",
								origin === "*" && "border-amber-500/50 text-amber-600 dark:text-amber-400",
							)}
						>
							{origin === "*" ? "* (any site — dev only)" : origin}
							<button
								type="button"
								aria-label={`Remove ${origin}`}
								onClick={() => onChange(origins.filter((o) => o !== origin))}
								className="p-0.5 rounded-full hover:bg-accent"
							>
								<XIcon className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
			<form
				className="gap-2 flex items-center"
				onSubmit={(e) => {
					e.preventDefault();
					add();
				}}
			>
				<Input
					className="h-8 text-sm flex-1"
					placeholder="https://your-website.com"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
				/>
				<Button
					type="submit"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					aria-label="Add website"
					disabled={draft.trim() === ""}
				>
					<PlusIcon className="size-4" />
				</Button>
			</form>
		</Field>
	);
}

// ---------------------------------------------------------------- install snippet

function InstallSnippet({ widgetId }: { widgetId: string }) {
	const [copied, setCopied] = useState(false);
	const snippet =
		typeof window !== "undefined"
			? composeWidgetIdSnippet({ baseUrl: window.location.origin, widgetId })
			: "";
	const copy = async () => {
		await navigator.clipboard.writeText(snippet);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	return (
		<div className="mt-4 gap-2 flex flex-col">
			<h4 className="font-medium text-sm">Install</h4>
			<div className="relative">
				<pre className="p-3 pr-10 text-xs overflow-x-auto rounded-lg border bg-muted/50 break-all whitespace-pre-wrap">
					{snippet}
				</pre>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="top-1.5 right-1.5 size-7 absolute"
					aria-label="Copy embed code"
					onClick={() => void copy()}
				>
					{copied ? (
						<CheckIcon className="size-4 text-emerald-500" />
					) : (
						<CopyIcon className="size-4" />
					)}
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Paste this once before <code>&lt;/body&gt;</code>. Edits here apply automatically — no need
				to reinstall.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------- small shared bits

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="gap-1.5 flex flex-col">
			<Label>{label}</Label>
			{children}
		</div>
	);
}

function Tile({
	active,
	onClick,
	className,
	children,
}: {
	active: boolean;
	onClick: () => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"gap-1 p-2 flex flex-col items-center rounded-lg border transition-colors",
				active
					? "border-primary bg-primary/5 text-primary"
					: "text-muted-foreground hover:border-muted-foreground/40",
				className,
			)}
		>
			{children}
		</button>
	);
}

function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="gap-0.5 p-0.5 flex w-fit rounded-lg bg-muted">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={value === o.value}
					onClick={() => onChange(o.value)}
					className={cn(
						"px-3 py-1 text-xs rounded-md transition-colors",
						value === o.value
							? "shadow-sm bg-background text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function SwitchRow({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}

function clamp(n: number, min: number, max: number): number {
	if (Number.isNaN(n)) return min;
	return Math.min(max, Math.max(min, Math.round(n)));
}
