"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useSetLimitMutation } from "@sources/lib/api";
import { useState } from "react";

/**
 * Inline "current value + edit" control for a single concurrency-limit row.
 * An empty input clears the limit (unlimited). Platform-admin only —
 * callers gate visibility; the oRPC procedure re-checks server-side.
 */
export function LimitEditor({
	scope,
	targetRef,
	currentValue,
}: {
	scope: "project" | "agent" | "group";
	/** Required for "agent"/"group" scope — omitted for "project". */
	targetRef?: string;
	currentValue: number | null;
}) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(currentValue !== null ? String(currentValue) : "");
	const setLimitMutation = useSetLimitMutation();

	const startEditing = () => {
		setValue(currentValue !== null ? String(currentValue) : "");
		setEditing(true);
	};

	const save = async () => {
		const trimmed = value.trim();
		const maxConcurrent = trimmed === "" ? null : Number(trimmed);
		if (maxConcurrent !== null && (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0)) {
			toastError("Enter a positive whole number, or leave blank for unlimited");
			return;
		}
		try {
			await setLimitMutation.mutateAsync({ scope, ref: targetRef, maxConcurrent });
			toastSuccess("Concurrency limit updated");
			setEditing(false);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not update limit");
		}
	};

	if (!editing) {
		return (
			<div className="gap-2 flex items-center">
				<span className="text-sm">
					{currentValue !== null ? `${currentValue} concurrent` : "Unlimited"}
				</span>
				<Button type="button" size="sm" variant="ghost" onClick={startEditing}>
					Edit
				</Button>
			</div>
		);
	}

	return (
		<div className="gap-2 flex items-center">
			<Input
				type="number"
				min={1}
				step={1}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Unlimited"
				className="h-8 w-28"
				autoFocus
			/>
			<Button type="button" size="sm" onClick={save} disabled={setLimitMutation.isPending}>
				Save
			</Button>
			<Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
				Cancel
			</Button>
		</div>
	);
}
