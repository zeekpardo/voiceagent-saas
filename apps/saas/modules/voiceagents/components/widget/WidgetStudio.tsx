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
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
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
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { toastError } from "@repo/ui/components/toast";
import {
	type SourceWidgetDto,
	useCreateWidgetMutation,
	useRemoveWidgetMutation,
	useSourceWidgetsQuery,
	useUpdateWidgetMutation,
} from "@sources/lib/api";
import { useAgentsQuery } from "@voiceagents/lib/api";
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";

import { WidgetEditor } from "./WidgetEditor";

/**
 * The Website Widget Studio: a list of saved widgets for a source with a
 * per-widget editor (CloseBot Chat-Widgets parity). Selecting a widget swaps
 * the list for the two-column editor; "New widget" spins up a named widget on
 * a chosen agent with sane defaults.
 */
export function WidgetStudio({ sourceId }: { sourceId: string }) {
	const { data: widgets, isLoading } = useSourceWidgetsQuery(sourceId);
	const [editingId, setEditingId] = useState<string | null>(null);

	if (isLoading) {
		return (
			<div className="gap-3 flex flex-col">
				<Skeleton className="h-9 max-w-40 w-full self-end" />
				<Skeleton className="h-16" />
				<Skeleton className="h-16" />
			</div>
		);
	}

	const editing = (widgets ?? []).find((w) => w.id === editingId) ?? null;
	if (editing) {
		return (
			<div className="gap-4 flex flex-col">
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 w-fit"
					onClick={() => setEditingId(null)}
				>
					<ArrowLeftIcon className="size-4" /> All widgets
				</Button>
				<WidgetEditor sourceId={sourceId} widget={editing} onClose={() => setEditingId(null)} />
			</div>
		);
	}

	return (
		<WidgetList sourceId={sourceId} widgets={widgets ?? []} onEdit={(id) => setEditingId(id)} />
	);
}

// ---------------------------------------------------------------- list

function WidgetList({
	sourceId,
	widgets,
	onEdit,
}: {
	sourceId: string;
	widgets: SourceWidgetDto[];
	onEdit: (id: string) => void;
}) {
	const { data: agents } = useAgentsQuery();
	const update = useUpdateWidgetMutation(sourceId);
	const remove = useRemoveWidgetMutation(sourceId);
	const [creating, setCreating] = useState(false);
	const [toDelete, setToDelete] = useState<SourceWidgetDto | null>(null);

	const agentName = (agentId: string) =>
		(agents ?? []).find((a) => a.id === agentId)?.name ?? "Unknown agent";

	return (
		<div className="gap-4 flex flex-col">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					Saved widgets for this source. Each can use a different agent, look and targeting.
				</p>
				<Button size="sm" onClick={() => setCreating(true)}>
					<PlusIcon className="size-4" /> New widget
				</Button>
			</div>

			{widgets.length === 0 ? (
				<div className="p-8 text-sm rounded-lg border border-dashed text-center text-muted-foreground">
					No widgets yet. Create one to embed a voice or chat assistant on this source's website.
				</div>
			) : (
				<div className="divide-y rounded-lg border">
					{widgets.map((widget) => (
						<div key={widget.id} className="gap-3 p-3 flex items-center">
							<button
								type="button"
								className="gap-1 min-w-0 flex flex-1 flex-col text-left"
								onClick={() => onEdit(widget.id)}
							>
								<span className="gap-2 flex items-center">
									<span className="font-medium text-sm truncate">{widget.name}</span>
									<Badge status="info" className="text-[10px] capitalize">
										{widget.appearance.style}
									</Badge>
									{!widget.enabled && (
										<Badge status="warning" className="text-[10px]">
											Disabled
										</Badge>
									)}
								</span>
								<span className="text-xs truncate text-muted-foreground">
									{agentName(widget.agentId)} · updated{" "}
									{new Date(widget.updatedAt).toLocaleDateString()}
								</span>
							</button>
							<Switch
								checked={widget.enabled}
								aria-label={widget.enabled ? "Disable widget" : "Enable widget"}
								onCheckedChange={(enabled) =>
									update.mutate(
										{ id: widget.id, enabled },
										{
											onError: (err) =>
												toastError(
													err instanceof Error ? err.message : "Could not update the widget",
												),
										},
									)
								}
							/>
							<Button
								variant="ghost"
								size="icon"
								className={cn("size-8 text-muted-foreground hover:text-destructive")}
								aria-label="Delete widget"
								onClick={() => setToDelete(widget)}
							>
								<TrashIcon className="size-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{creating && (
				<NewWidgetDialog
					sourceId={sourceId}
					onClose={() => setCreating(false)}
					onCreated={(id) => {
						setCreating(false);
						onEdit(id);
					}}
				/>
			)}

			<AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							The embed snippet for this widget will stop working. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (toDelete) remove.mutate(toDelete.id);
								setToDelete(null);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ---------------------------------------------------------------- new widget dialog

function NewWidgetDialog({
	sourceId,
	onClose,
	onCreated,
}: {
	sourceId: string;
	onClose: () => void;
	onCreated: (id: string) => void;
}) {
	const { data: agents } = useAgentsQuery();
	const create = useCreateWidgetMutation(sourceId);
	const [name, setName] = useState("");
	const [agentId, setAgentId] = useState("");

	const submit = () => {
		if (!name.trim() || !agentId) return;
		create.mutate(
			{ name: name.trim(), agentId },
			{
				onSuccess: (widget) => onCreated(widget.id),
				onError: (err) =>
					toastError(err instanceof Error ? err.message : "Could not create the widget"),
			},
		);
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New widget</DialogTitle>
				</DialogHeader>
				<div className="gap-4 flex flex-col">
					<div className="gap-1.5 flex flex-col">
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Pricing page assistant"
							maxLength={80}
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
						/>
					</div>
					<div className="gap-1.5 flex flex-col">
						<Label>Agent workflow</Label>
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
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={create.isPending}>
						Cancel
					</Button>
					<Button onClick={submit} disabled={!name.trim() || !agentId || create.isPending}>
						{create.isPending ? "Creating…" : "Create widget"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
