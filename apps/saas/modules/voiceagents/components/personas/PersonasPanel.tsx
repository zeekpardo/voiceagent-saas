"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
	agentPersonaId,
	type Persona,
	useAttachPersonaMutation,
	usePersonasQuery,
} from "../../lib/personas-api";
import { PersonaAvatar } from "./PersonaAvatar";
import { PersonaEditorDialog } from "./PersonaEditorDialog";

/**
 * Right-rail aside for attaching a persona to the agent. The attached persona
 * is pinned to the top as a selected card (with an Edit link and a detach
 * control); the rest are a searchable list. Clicking a row attaches it via the
 * agent update path — which publishes a new agent version immediately, so no
 * separate publish step is needed.
 */
export function PersonasPanel({ agent }: { agent: GatewayAgent }) {
	const { data: personas, isLoading } = usePersonasQuery();
	const attachMutation = useAttachPersonaMutation();

	const [search, setSearch] = useState("");
	const [editorOpen, setEditorOpen] = useState(false);
	const [editing, setEditing] = useState<Persona | undefined>(undefined);

	const attachedId = agentPersonaId(agent);
	const attached = useMemo(
		() => (personas ?? []).find((p) => p.id === attachedId),
		[personas, attachedId],
	);

	const others = useMemo(() => {
		const query = search.trim().toLowerCase();
		return (personas ?? [])
			.filter((p) => p.id !== attachedId)
			.filter(
				(p) =>
					!query ||
					p.name.toLowerCase().includes(query) ||
					p.styles.some((s) => s.toLowerCase().includes(query)),
			);
	}, [personas, attachedId, search]);

	const attach = async (persona: Persona | null) => {
		try {
			await attachMutation.mutateAsync({ agent, personaId: persona?.id ?? null });
			toastSuccess(persona ? `${persona.name} attached` : "Persona detached");
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not update the persona");
		}
	};

	const openCreate = () => {
		setEditing(undefined);
		setEditorOpen(true);
	};

	if (isLoading) {
		return (
			<div className="gap-2 flex flex-col">
				<Skeleton className="h-16" />
				<Skeleton className="h-12" />
				<Skeleton className="h-12" />
			</div>
		);
	}

	return (
		<div className="gap-4 flex flex-col">
			{attached ? (
				<div className="gap-3 p-3 flex items-center rounded-lg border border-primary/40 bg-primary/5">
					<PersonaAvatar
						name={attached.name}
						avatarUrl={attached.avatarUrl}
						themeColor={attached.themeColor}
						sizeClass="size-10"
					/>
					<div className="min-w-0 flex-1">
						<div className="gap-2 flex items-center">
							<span className="font-medium text-sm truncate">{attached.name}</span>
							<span className="gap-1 px-1.5 py-0.5 font-medium inline-flex items-center rounded-full bg-primary/10 text-[10px] text-primary uppercase">
								<CheckIcon className="size-3" /> Attached
							</span>
						</div>
						{attached.styles.length > 0 && (
							<p className="text-xs truncate text-muted-foreground capitalize">
								{attached.styles.join(" · ")}
							</p>
						)}
					</div>
					<div className="gap-1 flex shrink-0">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setEditing(attached);
								setEditorOpen(true);
							}}
						>
							Edit
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Detach persona"
							className="size-8"
							disabled={attachMutation.isPending}
							onClick={() => void attach(null)}
						>
							<XIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					No persona attached. Pick one below to give this agent a name, look, and tone.
				</p>
			)}

			<div className="gap-2 flex items-center">
				<div className="relative flex-1">
					<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search personas..."
						className="h-9 pl-8"
					/>
				</div>
				<Button variant="outline" size="sm" onClick={openCreate}>
					<PlusIcon className="size-4" /> New
				</Button>
			</div>

			{others.length === 0 ? (
				<p className="py-4 text-sm text-center text-muted-foreground">
					{(personas?.length ?? 0) === 0
						? "No personas yet — create your first."
						: "No other personas match."}
				</p>
			) : (
				<ul className="gap-1.5 flex flex-col">
					{others.map((persona) => (
						<li key={persona.id}>
							<button
								type="button"
								disabled={attachMutation.isPending}
								onClick={() => void attach(persona)}
								className={cn(
									"gap-3 px-3 py-2.5 flex w-full items-center rounded-lg border text-left transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-60",
								)}
							>
								<PersonaAvatar
									name={persona.name}
									avatarUrl={persona.avatarUrl}
									themeColor={persona.themeColor}
									sizeClass="size-9"
								/>
								<div className="min-w-0 flex-1">
									<span className="font-medium text-sm block truncate">{persona.name}</span>
									{persona.styles.length > 0 && (
										<span className="text-xs block truncate text-muted-foreground capitalize">
											{persona.styles.join(" · ")}
										</span>
									)}
								</div>
							</button>
						</li>
					))}
				</ul>
			)}

			<PersonaEditorDialog
				open={editorOpen}
				onOpenChange={setEditorOpen}
				persona={editing}
				onSaved={(saved) => {
					// Auto-attach a freshly created persona for a one-step flow.
					if (!editing) {
						void attach(saved);
					}
				}}
			/>
		</div>
	);
}
