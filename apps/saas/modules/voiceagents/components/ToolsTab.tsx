"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { CopyIcon, PlusIcon, Trash2Icon, WrenchIcon } from "lucide-react";
import { useState } from "react";

import {
	useCreateToolMutation,
	useDeleteToolMutation,
	useSetAgentToolsMutation,
	useToolsQuery,
} from "../lib/api";

interface ToolParam {
	name: string;
	type: "string" | "number" | "boolean";
	description: string;
	required: boolean;
}

/**
 * Tools-as-webhooks: register endpoints in YOUR app that the agent can call
 * mid-conversation, and choose which of them this agent may use. The engine
 * signs every invocation with the tool's secret.
 */
export function ToolsTab({
	agentId,
	agentConfig,
}: {
	agentId: string;
	agentConfig: Record<string, unknown>;
}) {
	const { data: tools, isLoading } = useToolsQuery();
	const setToolsMutation = useSetAgentToolsMutation(agentId);
	const createMutation = useCreateToolMutation();
	const deleteMutation = useDeleteToolMutation();

	const attached = new Set((agentConfig.toolIds as string[] | undefined) ?? []);

	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [endpointUrl, setEndpointUrl] = useState("");
	const [timeoutMs, setTimeoutMs] = useState(4000);
	const [params, setParams] = useState<ToolParam[]>([]);
	const [newSecret, setNewSecret] = useState<string | null>(null);

	if (isLoading) return <Skeleton className="h-64" />;

	const toggle = async (toolId: string, on: boolean) => {
		const next = new Set(attached);
		if (on) next.add(toolId);
		else next.delete(toolId);
		try {
			const res = await setToolsMutation.mutateAsync([...next]);
			toastSuccess(`Saved — agent is now v${res.version}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not update agent tools");
		}
	};

	const create = async () => {
		try {
			const created = await createMutation.mutateAsync({
				name,
				description,
				endpointUrl,
				timeoutMs,
				parameters: params,
			});
			setNewSecret(created.secret);
			setName("");
			setDescription("");
			setEndpointUrl("");
			setParams([]);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Tool creation failed");
		}
	};

	return (
		<div className="gap-4 flex flex-col">
			<Card>
				<CardHeader>
					<CardTitle className="gap-2 flex items-center">
						<WrenchIcon className="size-5" /> Tools this agent can call
						<Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
							<PlusIcon className="size-4" /> Register tool
						</Button>
					</CardTitle>
				</CardHeader>
				<CardContent className="gap-3 flex flex-col">
					<p className="text-sm -mt-2 opacity-60">
						A tool is an HTTP endpoint in your own app (booking, lookups, CRM writes…). The agent
						calls it mid-conversation; your endpoint returns JSON the agent speaks from. Invocations
						are HMAC-signed with the tool's secret.
					</p>
					{!tools?.length ? (
						<p className="text-sm py-6 text-center opacity-50">
							No tools registered yet — create one to give your agents live abilities.
						</p>
					) : (
						tools.map((tool) => (
							<div key={tool.id} className="gap-3 p-3 flex items-center rounded-lg border">
								<Switch
									checked={attached.has(tool.id)}
									disabled={setToolsMutation.isPending}
									onCheckedChange={(on) => void toggle(tool.id, on)}
								/>
								<div className="min-w-0 flex-1">
									<p className="font-mono text-sm">{tool.name}</p>
									<p className="text-xs truncate opacity-60">{tool.description}</p>
									<p className="text-xs truncate opacity-40">
										→ {tool.endpoint_url} · {tool.timeout_ms}ms timeout
									</p>
								</div>
								{attached.has(tool.id) && <Badge status="success">attached</Badge>}
								<Button
									variant="ghost"
									size="icon"
									onClick={() => {
										if (confirm(`Delete tool "${tool.name}"? Agents using it must detach first.`)) {
											deleteMutation.mutate(tool.id, {
												onError: (err) =>
													toastError(err instanceof Error ? err.message : "Delete failed"),
											});
										}
									}}
								>
									<Trash2Icon className="size-4 text-destructive" />
								</Button>
							</div>
						))
					)}
				</CardContent>
			</Card>

			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) setNewSecret(null);
				}}
			>
				<DialogContent className="max-w-xl">
					{newSecret ? (
						<>
							<DialogHeader>
								<DialogTitle>Tool created — save the signing secret</DialogTitle>
								<DialogDescription>
									This is shown once. Your endpoint verifies each invocation's X-Voice-Signature
									header with it.
								</DialogDescription>
							</DialogHeader>
							<div className="gap-2 flex items-center">
								<Input readOnly value={newSecret} className="font-mono text-xs" />
								<Button
									variant="outline"
									size="icon"
									onClick={() => {
										void navigator.clipboard.writeText(newSecret);
										toastSuccess("Copied");
									}}
								>
									<CopyIcon className="size-4" />
								</Button>
							</div>
							<Button
								onClick={() => {
									setNewSecret(null);
									setCreateOpen(false);
								}}
							>
								Done
							</Button>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Register a tool</DialogTitle>
								<DialogDescription>
									The name and description tell the AI when to use it; parameters define what it
									must collect from the caller first.
								</DialogDescription>
							</DialogHeader>
							<div className="gap-3 flex flex-col">
								<div className="gap-3 grid grid-cols-2">
									<div>
										<Label>Name (function name)</Label>
										<Input
											value={name}
											onChange={(e) => setName(e.target.value)}
											placeholder="check_calendar_availability"
											className="font-mono text-sm"
										/>
									</div>
									<div>
										<Label>Timeout (ms)</Label>
										<Input
											type="number"
											value={timeoutMs}
											onChange={(e) => setTimeoutMs(Number(e.target.value))}
										/>
									</div>
								</div>
								<div>
									<Label>Description (the AI reads this)</Label>
									<Input
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										placeholder="Check open appointment slots for a given date"
									/>
								</div>
								<div>
									<Label>Endpoint URL (your app)</Label>
									<Input
										value={endpointUrl}
										onChange={(e) => setEndpointUrl(e.target.value)}
										placeholder="https://your-app.com/api/voice-tools/calendar"
									/>
								</div>
								<div>
									<Label>Parameters</Label>
									<div className="gap-2 mt-1 flex flex-col">
										{params.map((p, i) => (
											<div key={`param-${i}-${p.name}`} className="gap-2 flex items-center">
												<Input
													className="w-36 font-mono text-xs"
													placeholder="date"
													value={p.name}
													onChange={(e) =>
														setParams((prev) =>
															prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
														)
													}
												/>
												<Select
													value={p.type}
													onValueChange={(v) =>
														setParams((prev) =>
															prev.map((x, j) =>
																j === i ? { ...x, type: v as ToolParam["type"] } : x,
															),
														)
													}
												>
													<SelectTrigger className="w-28">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="string">string</SelectItem>
														<SelectItem value="number">number</SelectItem>
														<SelectItem value="boolean">boolean</SelectItem>
													</SelectContent>
												</Select>
												<Input
													placeholder="what the AI should put here"
													value={p.description}
													onChange={(e) =>
														setParams((prev) =>
															prev.map((x, j) =>
																j === i ? { ...x, description: e.target.value } : x,
															),
														)
													}
												/>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => setParams((prev) => prev.filter((_, j) => j !== i))}
												>
													<Trash2Icon className="size-4" />
												</Button>
											</div>
										))}
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="self-start"
											onClick={() =>
												setParams((prev) => [
													...prev,
													{ name: "", type: "string", description: "", required: true },
												])
											}
										>
											<PlusIcon className="size-4" /> Add parameter
										</Button>
									</div>
								</div>
								<Button
									loading={createMutation.isPending}
									disabled={!name || !description || !endpointUrl}
									onClick={create}
								>
									Create tool
								</Button>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
