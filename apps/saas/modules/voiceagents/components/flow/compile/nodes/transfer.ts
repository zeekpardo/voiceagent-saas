import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowExit,
	EngineFlowNode,
	TransferCanvasNodeDoc,
	TransferNodeData,
} from "../../flow-types";
import { TRANSFER_FAILED_HANDLE_ID, TRANSFER_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

const DEFAULT_WAIT_SECONDS = 30;
const DEFAULT_HOLD_SECONDS = 4;

/**
 * The warm-transfer failure exit name. MUST match the engine string exactly
 * (case-sensitive) — the engine routes an unanswered/declined warm transfer to
 * the exit named this, so it is a cross-repo join key. Do NOT rename.
 */
export const TRANSFER_FAILED_EXIT_NAME = "Not Connected";

/**
 * Normalize a warm/cold transfer target. Anything already shaped like
 * `tel:` or `sip:` passes through untouched; a bare phone number (digits,
 * spaces, dashes, parens, optional leading `+`) is collapsed into `tel:+E164`.
 * Anything else (empty, or text we can't confidently turn into E.164) is
 * passed through as typed so the user can see and fix it.
 */
export function normalizeTransferTarget(raw: string | undefined): string | undefined {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return undefined;
	}
	if (/^(tel|sip):/i.test(trimmed)) {
		return trimmed;
	}
	const digits = trimmed.replace(/[^\d+]/g, "");
	if (!digits || !/^\+?\d+$/.test(digits)) {
		// Not something we can confidently normalize — leave as-is.
		return trimmed;
	}
	const e164 = digits.startsWith("+") ? digits : `+${digits}`;
	return `tel:${e164}`;
}

export function compileTransferNode(
	node: TransferCanvasNodeDoc & { data: TransferNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const say = node.data.say.trim();
	const mode = node.data.mode ?? "simulated";
	const nextTarget = targetOf(node.id, TRANSFER_NEXT_HANDLE_ID);

	const transfer: NonNullable<EngineFlowNode["transfer"]> = { mode };
	if (say) {
		transfer.say = say;
	}
	if (mode === "simulated") {
		transfer.holdSeconds = node.data.holdSeconds;
		if (node.data.voiceId && node.data.voiceProvider) {
			transfer.voice = { provider: node.data.voiceProvider, voice: node.data.voiceId };
		}
	} else {
		const normalizedTarget = normalizeTransferTarget(node.data.target);
		if (normalizedTarget) {
			transfer.target = normalizedTarget;
		}
		transfer.waitSeconds = node.data.waitSeconds ?? DEFAULT_WAIT_SECONDS;
	}

	const exits: EngineFlowExit[] = [];
	if (nextTarget) {
		exits.push({ name: "Next", description: "Continue after the transfer", target: nextTarget });
	}
	// Warm transfers can fail (no answer / declined). When the "Not connected"
	// handle is wired, emit the engine's failure exit so the call continues;
	// leave it unwired and the engine ends the call.
	if (mode === "warm") {
		const failedTarget = targetOf(node.id, TRANSFER_FAILED_HANDLE_ID);
		if (failedTarget) {
			exits.push({
				name: TRANSFER_FAILED_EXIT_NAME,
				description: "The person didn't answer or declined the transfer",
				target: failedTarget,
			});
		}
	}

	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "transfer",
		transfer,
		// The engine requires instructions min 1 on every node.
		instructions: say || "Transferring the caller.",
		toolIds: [],
		exits,
	};
}

export function decompileTransferNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	for (const exit of flowNode.exits) {
		if (!exit.target) {
			continue;
		}
		const isFailed =
			exit.name.trim().toLowerCase() === TRANSFER_FAILED_EXIT_NAME.toLowerCase();
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: isFailed ? TRANSFER_FAILED_HANDLE_ID : TRANSFER_NEXT_HANDLE_ID,
			target: exit.target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "transfer",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				say: flowNode.transfer?.say ?? "",
				mode: flowNode.transfer?.mode ?? "simulated",
				holdSeconds: flowNode.transfer?.holdSeconds ?? DEFAULT_HOLD_SECONDS,
				voiceId: flowNode.transfer?.voice?.voice,
				voiceProvider: flowNode.transfer?.voice?.provider,
				target: flowNode.transfer?.target,
				waitSeconds: flowNode.transfer?.waitSeconds,
			},
		},
		edges,
	};
}

/** Fresh Transfer node data (used by the Actions palette). */
export function newTransferNodeData(): TransferNodeData {
	return {
		title: "Transfer",
		say: "One moment please — let me transfer you to the right person.",
		mode: "simulated",
		holdSeconds: DEFAULT_HOLD_SECONDS,
	};
}

/**
 * "Forward to a Person" preset — a Transfer node pre-configured for a warm
 * human transfer, so users don't have to know the node defaults to
 * "simulated". `target` is left blank for the user to fill in.
 */
export function newHumanTransferNodeData(): TransferNodeData {
	return {
		title: "Forward to a Person",
		say: "One moment — I'll connect you with someone now.",
		mode: "warm",
		holdSeconds: DEFAULT_HOLD_SECONDS,
		waitSeconds: DEFAULT_WAIT_SECONDS,
	};
}
