"use client";

import { agentConfigInput } from "@repo/api/modules/voiceagents/lib/schema";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpcClient } from "@shared/lib/orpc-client";
import { useSourcesQuery } from "@sources/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCreateAgentMutation, voiceAgentsQueryKey } from "../lib/api";

/** Human labels for CRM provider ids (currently GHL-only; extend per new CRM). */
const PROVIDER_LABELS: Record<string, string> = { gohighlevel: "GoHighLevel" };
const providerLabel = (id: string) => PROVIDER_LABELS[id] ?? id;

/**
 * Lightweight "new workflow" popup — replaces the old full-form /new page.
 * Captures only the workflow name + the CRM account it works with, creates a
 * minimal agent (every other field defaults, edited later on the canvas),
 * attaches the chosen Source (so CRM-specific fields resolve in the builder),
 * then routes to the node-builder canvas. Selecting a CONNECTED CRM account is
 * required; if none is connected, we block and link to Sources.
 */
export function CreateAgentDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const createMutation = useCreateAgentMutation();
	const { data: sources, isLoading } = useSourcesQuery();

	const [name, setName] = useState("");
	const [sourceId, setSourceId] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const connected = (sources ?? []).filter((s) => s.status === "CONNECTED");
	const hasConnected = connected.length > 0;
	const canCreate = name.trim().length > 0 && sourceId.length > 0 && !submitting;

	const reset = () => {
		setName("");
		setSourceId("");
	};

	const handleOpenChange = (next: boolean) => {
		if (submitting) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleCreate = async () => {
		if (!canCreate) return;
		setSubmitting(true);
		try {
			// Minimal valid config — `name` is the only required field; the rest
			// default and are edited on the canvas.
			const created = await createMutation.mutateAsync(
				agentConfigInput.parse({ name: name.trim() }),
			);
			// Bind the chosen CRM account so the builder's CRM fields resolve.
			await orpcClient.voiceagents.sources.attach({ agentId: created.id, sourceId });
			await queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			toastSuccess("Workflow created");
			onOpenChange(false);
			reset();
			router.push(`/voice-agents/${created.id}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not create the workflow");
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New workflow</DialogTitle>
					<DialogDescription>
						Name your workflow and pick the CRM it works with — you'll build the rest on the canvas.
					</DialogDescription>
				</DialogHeader>

				<div className="gap-4 py-2 flex flex-col">
					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="workflow-name">Workflow name</Label>
						<Input
							id="workflow-name"
							value={name}
							maxLength={80}
							autoFocus
							placeholder="e.g. Seller Intake"
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && canCreate) void handleCreate();
							}}
						/>
					</div>

					<div className="gap-1.5 flex flex-col">
						<Label htmlFor="workflow-crm">CRM account</Label>
						{isLoading ? (
							<p className="text-sm opacity-60">Loading your CRM accounts…</p>
						) : hasConnected ? (
							<Select value={sourceId} onValueChange={setSourceId}>
								<SelectTrigger id="workflow-crm">
									<SelectValue placeholder="Select a connected CRM account" />
								</SelectTrigger>
								<SelectContent>
									{connected.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.accountName || s.name} · {providerLabel(s.providerType)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<div className="p-3 text-sm rounded-md border bg-muted/40">
								<p className="opacity-70">You need a connected CRM before creating a workflow.</p>
								<Button asChild variant="link" className="mt-1 p-0 h-auto">
									<Link href="/sources">Connect a CRM →</Link>
								</Button>
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleCreate} disabled={!canCreate || !hasConnected}>
						{submitting ? "Creating…" : "Create & open builder"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
