"use client";

import { readCustomVariableDefs } from "@repo/api/modules/voiceagents/lib/custom-variables";
import type { CustomVariableDef, GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { checkVariableName } from "@voiceagents/lib/custom-variables";
import { CheckIcon, PencilIcon, SearchIcon, TrashIcon, VariableIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useSaveCustomVariablesMutation } from "../lib/api";

/**
 * Job Flow Variables panel (CloseBot-style): define agent-level custom variables
 * usable as {{name}} / @-mentions in the flow. Definitions live on the agent
 * config (`customVariables`); per-source VALUE overrides are set in the Sources
 * panel. Names are normalized to lowercase snake_case and can't collide with the
 * built-in runtime variables (contact_*, location_*, caller_*).
 */
export function VariablesPanel({ agent }: { agent: GatewayAgent }) {
	const defs = useMemo(() => readCustomVariableDefs(agent.config), [agent.config]);
	const saveMutation = useSaveCustomVariablesMutation(agent.id);

	const [search, setSearch] = useState("");
	const [editingName, setEditingName] = useState<string | null>(null);

	const persist = async (next: CustomVariableDef[], message: string) => {
		try {
			await saveMutation.mutateAsync({ agent, customVariables: next });
			toastSuccess(message);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not save variables");
		}
	};

	const addVariable = (def: CustomVariableDef) => persist([...defs, def], "Variable added");

	const updateVariable = (originalName: string, def: CustomVariableDef) =>
		persist(
			defs.map((d) => (d.name === originalName ? def : d)),
			"Variable updated",
		);

	const removeVariable = (name: string) =>
		persist(
			defs.filter((d) => d.name !== name),
			"Variable removed",
		);

	const query = search.trim().toLowerCase();
	const filtered = query
		? defs.filter(
				(d) =>
					d.name.toLowerCase().includes(query) ||
					(d.description ?? "").toLowerCase().includes(query),
			)
		: defs;

	// Names other than the row being edited — collision check excludes self.
	const otherNames = (excludeName?: string) =>
		defs.filter((d) => d.name !== excludeName).map((d) => d.name);

	return (
		<div className="gap-4 flex flex-col">
			<div className="relative">
				<SearchIcon className="left-2.5 size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search variables..."
					className="h-9 pl-8"
				/>
			</div>

			<VariableForm
				key={defs.length}
				existingNames={otherNames()}
				pending={saveMutation.isPending}
				onSubmit={addVariable}
			/>

			{defs.length === 0 ? (
				<div className="gap-2 py-8 flex flex-col items-center text-center text-muted-foreground">
					<VariableIcon className="size-8 opacity-40" />
					<p className="text-sm">No variables yet</p>
				</div>
			) : filtered.length === 0 ? (
				<p className="py-4 text-sm text-center text-muted-foreground">
					No variables match "{search}"
				</p>
			) : (
				<ul className="gap-1.5 flex flex-col">
					{filtered.map((def) =>
						editingName === def.name ? (
							<li key={def.name}>
								<VariableForm
									existingNames={otherNames(def.name)}
									pending={saveMutation.isPending}
									initial={def}
									onSubmit={(next) => {
										void updateVariable(def.name, next);
										setEditingName(null);
									}}
									onCancel={() => setEditingName(null)}
								/>
							</li>
						) : (
							<li
								key={def.name}
								className="gap-3 p-3 flex items-start rounded-lg border transition-colors hover:bg-accent/40"
							>
								<div className="min-w-0 flex-1">
									<code className="font-mono text-sm text-blue-600 dark:text-blue-400 break-all">
										{`{{${def.name}}}`}
									</code>
									{def.description && (
										<p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
									)}
									{def.default && (
										<p className="mt-0.5 text-xs text-muted-foreground">
											Default: <span className="font-mono">{def.default}</span>
										</p>
									)}
								</div>
								<div className="gap-0.5 flex shrink-0">
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Edit ${def.name}`}
										className="size-8"
										disabled={saveMutation.isPending}
										onClick={() => setEditingName(def.name)}
									>
										<PencilIcon className="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Delete ${def.name}`}
										className="size-8 text-muted-foreground hover:text-destructive"
										disabled={saveMutation.isPending}
										onClick={() => void removeVariable(def.name)}
									>
										<TrashIcon className="size-4" />
									</Button>
								</div>
							</li>
						),
					)}
				</ul>
			)}
		</div>
	);
}

function VariableForm({
	existingNames,
	pending,
	initial,
	onSubmit,
	onCancel,
}: {
	existingNames: string[];
	pending: boolean;
	initial?: CustomVariableDef;
	onSubmit: (def: CustomVariableDef) => void;
	onCancel?: () => void;
}) {
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [defaultValue, setDefaultValue] = useState(initial?.default ?? "");

	const check = checkVariableName(name, existingNames);
	const showError = name.trim().length > 0 && !check.valid;

	const submit = () => {
		if (!check.valid) {
			return;
		}
		onSubmit({
			name: check.normalized,
			...(description.trim() ? { description: description.trim() } : {}),
			...(defaultValue.trim() ? { default: defaultValue.trim() } : {}),
		});
		if (!initial) {
			setName("");
			setDescription("");
			setDefaultValue("");
		}
	};

	return (
		<div className="gap-2 p-3 flex flex-col rounded-lg border bg-card">
			<div className="gap-1 flex flex-col">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Name (e.g. appointment_type)"
					className="h-9 font-mono"
					aria-invalid={showError}
				/>
				{showError && <p className="text-xs text-destructive">{check.error}</p>}
				{check.valid && check.normalized !== name && (
					<p className="text-xs text-muted-foreground">
						Saved as <span className="font-mono">{check.normalized}</span>
					</p>
				)}
			</div>
			<Input
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				placeholder="Description (optional)"
				className="h-9"
			/>
			<Input
				value={defaultValue}
				onChange={(e) => setDefaultValue(e.target.value)}
				placeholder="Default value (optional)"
				className="h-9"
			/>
			<div className="gap-2 flex justify-end">
				{onCancel && (
					<Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
						<XIcon className="size-4" /> Cancel
					</Button>
				)}
				<Button size="sm" onClick={submit} disabled={!check.valid || pending}>
					{initial ? <CheckIcon className="size-4" /> : null}
					{initial ? "Save" : "Add Variable"}
				</Button>
			</div>
		</div>
	);
}
