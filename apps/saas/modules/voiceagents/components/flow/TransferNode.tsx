"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { PhoneCallIcon, PhoneForwardedIcon, PhoneOutgoingIcon } from "lucide-react";

import type { TransferNodeData } from "./flow-types";
import { TRANSFER_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type TransferRFNode = Node<TransferNodeData, "transfer">;

const SOURCE_HANDLES = [{ id: TRANSFER_NEXT_HANDLE_ID, name: "Connects to" }];

/** Small corner glyph per mode — "simulated" is the original look (no badge). */
const MODE_BADGE = {
	warm: { icon: PhoneCallIcon, label: "Warm transfer" },
	cold: { icon: PhoneOutgoingIcon, label: "Cold transfer" },
} as const;

/**
 * A Transfer node. "simulated" (default) is the in-session hand-off: optional
 * announcement in the current voice, hold music for a few seconds, then the
 * flow continues at the connected node with a new voice that persists for the
 * rest of the call. "warm" and "cold" place a real transfer over SIP — shown
 * with a small corner badge so the mode is visible on the canvas.
 */
export function TransferNode({ id, data, selected }: NodeProps<TransferRFNode>) {
	const mode = data.mode ?? "simulated";
	const modeBadge = mode === "simulated" ? undefined : MODE_BADGE[mode];
	const BadgeIcon = modeBadge?.icon;
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Transfer"
			icon={PhoneForwardedIcon}
			borderClassName="bg-gradient-to-br from-teal-500/70 to-cyan-500/70"
			tileClassName="bg-gradient-to-br from-teal-500 to-cyan-500"
			handleClassName="!bg-cyan-500"
			targetHandleClassName="!bg-teal-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
			badge={
				BadgeIcon ? (
					<span
						title={modeBadge.label}
						className="-right-1 -bottom-1 size-4 absolute flex items-center justify-center rounded-full border bg-background text-muted-foreground"
					>
						<BadgeIcon className="size-3" />
					</span>
				) : undefined
			}
		/>
	);
}
