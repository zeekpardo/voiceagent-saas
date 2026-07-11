"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError } from "@repo/ui/components/toast";
import { orpcClient } from "@shared/lib/orpc-client";
import { useMutation } from "@tanstack/react-query";
import {
	CheckIcon,
	CopyIcon,
	CreditCardIcon,
	type LucideIcon,
	MessageCircleIcon,
	PanelRightIcon,
	PlusIcon,
	RectangleHorizontalIcon,
	XIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import {
	composeWidgetSnippet,
	isValidWidgetOrigin,
	WIDGET_DEFAULTS,
	type WidgetPosition,
	type WidgetStyle,
} from "../../lib/widget-snippet";
import { InfoHint } from "../shared/InfoHint";

const STYLE_OPTIONS: { style: WidgetStyle; label: string; hint: string; icon: LucideIcon }[] = [
	{
		style: "bubble",
		label: "Bubble",
		hint: "Floating launcher in a corner",
		icon: MessageCircleIcon,
	},
	{ style: "card", label: "Card", hint: "Inline inside your page", icon: CreditCardIcon },
	{ style: "panel", label: "Panel", hint: "Full-height side drawer", icon: PanelRightIcon },
	{ style: "bar", label: "Bar", hint: "Bottom bar, expands up", icon: RectangleHorizontalIcon },
];

/**
 * "Website Widget" workspace aside: pick how the embed should look, choose
 * which website origins may use it, mint the signed widget token, and copy the
 * ready-to-paste <script> snippet. The snippet is recomposed client-side
 * (composeWidgetSnippet) so appearance tweaks after minting update it without
 * another server round-trip — only the origins live inside the signed token.
 */
export function WidgetPanel({ agentId }: { agentId: string }) {
	const [style, setStyle] = useState<WidgetStyle>(WIDGET_DEFAULTS.style);
	const [position, setPosition] = useState<WidgetPosition>(WIDGET_DEFAULTS.position);
	const [accent, setAccent] = useState(WIDGET_DEFAULTS.accent);
	const [target, setTarget] = useState("#voice-widget");
	const [origins, setOrigins] = useState<string[]>([]);
	const [originDraft, setOriginDraft] = useState("");
	const [token, setToken] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const mintMutation = useMutation({
		mutationFn: () => orpcClient.voiceagents.widget.createToken({ agentId, origins }),
		onSuccess: (result) => setToken(result.token),
		onError: (err) =>
			toastError(err instanceof Error ? err.message : "Could not create the widget token"),
	});

	const addOrigin = () => {
		const value = originDraft.trim().replace(/\/$/, "");
		if (!value) return;
		if (!isValidWidgetOrigin(value)) {
			toastError('Enter an origin like https://example.com — or "*" for any site (dev only)');
			return;
		}
		if (!origins.includes(value)) {
			setOrigins((prev) => [...prev, value]);
			// Origins are baked into the signed token, so edits invalidate the snippet.
			setToken(null);
		}
		setOriginDraft("");
	};

	const removeOrigin = (value: string) => {
		setOrigins((prev) => prev.filter((o) => o !== value));
		setToken(null);
	};

	const snippet = token
		? composeWidgetSnippet({
				baseUrl: window.location.origin,
				token,
				style,
				position,
				accent,
				target,
			})
		: null;

	const copySnippet = async () => {
		if (!snippet) return;
		await navigator.clipboard.writeText(snippet);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="gap-6 flex flex-col">
			<section className="gap-2 flex flex-col">
				<h3 className="font-medium text-sm">Style</h3>
				<div className="gap-2 grid grid-cols-2">
					{STYLE_OPTIONS.map(({ style: option, label, hint, icon: Icon }) => (
						<button
							key={option}
							type="button"
							aria-pressed={style === option}
							onClick={() => setStyle(option)}
							className={cn(
								"gap-1 p-3 flex flex-col items-start rounded-lg border text-left transition-colors",
								style === option
									? "border-primary bg-primary/5"
									: "hover:border-muted-foreground/40",
							)}
						>
							<Icon
								className={cn(
									"size-4",
									style === option ? "text-primary" : "text-muted-foreground",
								)}
							/>
							<span className="font-medium text-sm">{label}</span>
							<span className="text-xs text-muted-foreground">{hint}</span>
						</button>
					))}
				</div>
				{style === "card" && (
					<div className="mt-1 gap-2 flex items-center">
						<span className="text-xs shrink-0 text-muted-foreground">
							Target selector
							<InfoHint className="ml-1 align-middle">
								The card renders inline inside this element on your page — add e.g.{" "}
								<code>&lt;div id="voice-widget"&gt;&lt;/div&gt;</code> where you want it.
							</InfoHint>
						</span>
						<Input
							className="h-8 font-mono text-xs flex-1"
							value={target}
							onChange={(e) => setTarget(e.target.value)}
							placeholder="#voice-widget"
						/>
					</div>
				)}
			</section>

			{style !== "card" && style !== "bar" && (
				<section className="gap-2 flex flex-col">
					<h3 className="font-medium text-sm">Position</h3>
					<div className="gap-0.5 p-0.5 flex w-fit rounded-lg bg-muted">
						{(["left", "right"] as const).map((side) => (
							<button
								key={side}
								type="button"
								aria-pressed={position === side}
								onClick={() => setPosition(side)}
								className={cn(
									"px-3 py-1 text-xs rounded-md capitalize transition-colors",
									position === side
										? "shadow-sm bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{side}
							</button>
						))}
					</div>
				</section>
			)}

			<section className="gap-2 flex flex-col">
				<h3 className="font-medium text-sm">Accent color</h3>
				<div className="gap-2 flex items-center">
					<input
						type="color"
						aria-label="Accent color"
						value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : WIDGET_DEFAULTS.accent}
						onChange={(e) => setAccent(e.target.value)}
						className="size-8 rounded p-0.5 cursor-pointer border bg-transparent"
					/>
					<Input
						className="h-8 w-28 font-mono text-xs"
						value={accent}
						onChange={(e) => setAccent(e.target.value)}
					/>
				</div>
			</section>

			<section className="gap-2 flex flex-col">
				<h3 className="gap-1.5 font-medium text-sm flex items-center">
					Allowed websites
					<InfoHint>
						Only these origins can start conversations with your widget token. Use <code>*</code> to
						allow any site — handy while developing, but don't ship it.
					</InfoHint>
				</h3>
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
									onClick={() => removeOrigin(origin)}
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
					onSubmit={(e: FormEvent) => {
						e.preventDefault();
						addOrigin();
					}}
				>
					<Input
						className="h-8 text-sm flex-1"
						placeholder="https://your-website.com"
						value={originDraft}
						onChange={(e) => setOriginDraft(e.target.value)}
					/>
					<Button
						type="submit"
						variant="outline"
						size="icon"
						className="size-8 shrink-0"
						aria-label="Add website"
						disabled={originDraft.trim() === ""}
					>
						<PlusIcon className="size-4" />
					</Button>
				</form>
			</section>

			<section className="gap-2 flex flex-col">
				<Button
					type="button"
					disabled={origins.length === 0 || mintMutation.isPending}
					onClick={() => mintMutation.mutate()}
				>
					{token ? "Regenerate embed code" : "Generate embed code"}
				</Button>
				{origins.length === 0 && (
					<p className="text-xs text-muted-foreground">
						Add at least one allowed website to generate the embed code.
					</p>
				)}
				{snippet && (
					<>
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
								onClick={() => void copySnippet()}
							>
								{copied ? (
									<CheckIcon className="size-4 text-emerald-500" />
								) : (
									<CopyIcon className="size-4" />
								)}
							</Button>
						</div>
						<p className="gap-1.5 text-xs flex items-start text-muted-foreground">
							Paste this tag just before <code>&lt;/body&gt;</code> on your website.
							{style === "card" &&
								' Also add the target element (e.g. <div id="voice-widget"></div>) where the card should appear.'}{" "}
							Style, position and accent are plain attributes — you can tweak them in the pasted tag
							anytime. Changing allowed websites requires regenerating.
						</p>
					</>
				)}
			</section>
		</div>
	);
}
