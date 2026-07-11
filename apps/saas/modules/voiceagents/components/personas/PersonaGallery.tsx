"use client";

import { Button } from "@repo/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	EllipsisVerticalIcon,
	PlusIcon,
	SearchIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useAgentsQuery } from "../../lib/api";
import {
	agentPersonaId,
	type Persona,
	useDeletePersonaMutation,
	usePersonasQuery,
} from "../../lib/personas-api";
import { PersonaAvatar } from "./PersonaAvatar";
import { PersonaEditorDialog } from "./PersonaEditorDialog";

/**
 * Persona management strip shown above the agents table: a horizontally
 * scrollable carousel of compact persona cards, a search box, and an
 * "Add persona" button. Each card shows the avatar on its theme color, the
 * name, and how many agents use it (derived from the agents list).
 */
export function PersonaGallery() {
	const { data: personas, isLoading } = usePersonasQuery();
	const { data: agents } = useAgentsQuery();
	const deleteMutation = useDeletePersonaMutation();
	const { confirm } = useConfirmationAlert();

	const [search, setSearch] = useState("");
	const [editorOpen, setEditorOpen] = useState(false);
	const [editing, setEditing] = useState<Persona | undefined>(undefined);
	const scrollerRef = useRef<HTMLDivElement>(null);

	// agentId count per persona, derived cheaply from the already-loaded agents.
	const agentCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const agent of agents ?? []) {
			const pid = agentPersonaId(agent);
			if (pid) {
				counts.set(pid, (counts.get(pid) ?? 0) + 1);
			}
		}
		return counts;
	}, [agents]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return personas ?? [];
		}
		return (personas ?? []).filter(
			(p) =>
				p.name.toLowerCase().includes(query) ||
				(p.internalDescription ?? "").toLowerCase().includes(query) ||
				p.styles.some((s) => s.toLowerCase().includes(query)),
		);
	}, [personas, search]);

	const openCreate = () => {
		setEditing(undefined);
		setEditorOpen(true);
	};
	const openEdit = (persona: Persona) => {
		setEditing(persona);
		setEditorOpen(true);
	};

	const handleDelete = (persona: Persona) => {
		const count = agentCounts.get(persona.id) ?? 0;
		confirm({
			title: `Delete "${persona.name}"?`,
			message:
				count > 0
					? `This persona is attached to ${count} ${count === 1 ? "agent" : "agents"}. Deleting it removes it from ${count === 1 ? "that agent" : "those agents"}.`
					: "This persona will be permanently deleted.",
			destructive: true,
			confirmLabel: "Delete",
			onConfirm: async () => {
				try {
					await deleteMutation.mutateAsync(persona.id);
					toastSuccess("Persona deleted");
				} catch (err) {
					toastError(err instanceof Error ? err.message : "Could not delete the persona");
				}
			},
		});
	};

	const scrollBy = (delta: number) =>
		scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });

	return (
		<section className="gap-3 mb-4 flex flex-col">
			<div className="gap-3 flex flex-wrap items-center justify-between">
				<div className="gap-2 flex items-center">
					<SparklesIcon className="size-4 text-muted-foreground" />
					<h2 className="font-medium text-sm">Personas</h2>
					{personas && personas.length > 0 && (
						<span className="text-xs text-muted-foreground">{personas.length}</span>
					)}
				</div>
				<div className="gap-2 flex items-center">
					<div className="relative">
						<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search personas..."
							className="h-9 w-44 pl-8"
						/>
					</div>
					<Button variant="primary" size="sm" onClick={openCreate}>
						<PlusIcon className="size-4" /> Add persona
					</Button>
				</div>
			</div>

			{isLoading ? (
				<div className="gap-3 flex">
					{Array.from({ length: 5 }, (_, i) => (
						<Skeleton key={i} className="w-28 h-[132px] rounded-xl" />
					))}
				</div>
			) : (personas?.length ?? 0) === 0 ? (
				<EmptyState onCreate={openCreate} />
			) : filtered.length === 0 ? (
				<p className="py-6 text-sm text-center text-muted-foreground">
					No personas match "{search}".
				</p>
			) : (
				<div className="group/carousel relative">
					<button
						type="button"
						aria-label="Scroll personas left"
						onClick={() => scrollBy(-320)}
						className="-left-3 size-7 shadow-sm absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full border bg-card opacity-0 transition-opacity group-hover/carousel:opacity-100 hover:bg-accent"
					>
						<ChevronLeftIcon className="size-4" />
					</button>
					<div
						ref={scrollerRef}
						className="gap-3 pb-1 flex [scrollbar-width:none] overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
					>
						{filtered.map((persona) => (
							<PersonaCard
								key={persona.id}
								persona={persona}
								agentCount={agentCounts.get(persona.id) ?? 0}
								onEdit={() => openEdit(persona)}
								onDelete={() => handleDelete(persona)}
							/>
						))}
					</div>
					<button
						type="button"
						aria-label="Scroll personas right"
						onClick={() => scrollBy(320)}
						className="-right-3 size-7 shadow-sm absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center rounded-full border bg-card opacity-0 transition-opacity group-hover/carousel:opacity-100 hover:bg-accent"
					>
						<ChevronRightIcon className="size-4" />
					</button>
				</div>
			)}

			<PersonaEditorDialog open={editorOpen} onOpenChange={setEditorOpen} persona={editing} />
		</section>
	);
}

function PersonaCard({
	persona,
	agentCount,
	onEdit,
	onDelete,
}: {
	persona: Persona;
	agentCount: number;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<TooltipProvider delayDuration={200}>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="group/card w-28 relative shrink-0">
						<button
							type="button"
							onClick={onEdit}
							className="gap-2 px-2 py-3 flex h-full w-full flex-col items-center rounded-xl border bg-card text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
						>
							<span
								className="p-1 flex items-center justify-center rounded-full"
								style={{ backgroundColor: `${persona.themeColor}22` }}
							>
								<PersonaAvatar
									name={persona.name}
									avatarUrl={persona.avatarUrl}
									themeColor={persona.themeColor}
									sizeClass="size-12"
									textClass="text-base"
								/>
							</span>
							<span className="text-sm font-medium w-full truncate">{persona.name}</span>
							{agentCount > 0 && (
								<span className="text-xs text-muted-foreground">
									{agentCount} {agentCount === 1 ? "agent" : "agents"}
								</span>
							)}
						</button>
						<div className="top-1 right-1 absolute opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Actions for ${persona.name}`}
										className="size-6 bg-card/80"
									>
										<EllipsisVerticalIcon className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={onDelete}
									>
										<Trash2Icon className="mr-2 size-4" /> Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="max-w-56">
					<p className="font-medium">{persona.name}</p>
					{persona.internalDescription && (
						<p className="mt-0.5 text-muted-foreground">{persona.internalDescription}</p>
					)}
					{persona.styles.length > 0 && (
						<p className="mt-1 capitalize">{persona.styles.join(" · ")}</p>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
	return (
		<div className="gap-3 px-4 py-8 flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 text-center">
			<span className="size-10 flex items-center justify-center rounded-full bg-primary/10">
				<SparklesIcon className="size-5 text-primary" />
			</span>
			<div>
				<p className="font-medium text-sm">No personas yet</p>
				<p className="text-xs text-muted-foreground">
					Create a reusable identity — name, look, and tone — to attach to your agents.
				</p>
			</div>
			<Button variant="primary" size="sm" onClick={onCreate}>
				<PlusIcon className="size-4" /> Create your first persona
			</Button>
		</div>
	);
}
