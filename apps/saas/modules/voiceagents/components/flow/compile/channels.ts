import type { EngineFlow, EngineFlowNode, EngineFlowScenario, FlowChannel } from "../flow-types";
import { channelAllows } from "../flow-types";

/**
 * The primary exit target a pruned node splices onto: the first exit that has a
 * target, falling back to the first exit's (possibly undefined) target. This is
 * the "Next"-style single exit for statement/agent/transfer nodes and the first
 * branch for multi-exit nodes.
 */
function primaryTarget(node: EngineFlowNode | undefined): string | undefined {
	if (!node || node.exits.length === 0) {
		return undefined;
	}
	const withTarget = node.exits.find((exit) => exit.target);
	return (withTarget ?? node.exits[0]).target;
}

/**
 * Prune every node that does not run on `channel` and splice the graph back
 * together so it stays connected:
 *
 *  - A node whose `channels` excludes `channel` is removed.
 *  - Any edge (exit target, entry, scenario target) that pointed at a pruned
 *    node is re-pointed to that node's PRIMARY exit target — transitively, so a
 *    chain of pruned nodes collapses to the first surviving node past it.
 *  - A pruned chain that dead-ends (or forms a cycle among pruned nodes) resolves
 *    to `undefined` — the edge simply ends there (the call ends / exit is a leaf).
 *  - If the flow ENTRY resolves to `undefined`, the pruned entry is `""` — an
 *    orphaned graph that `channelPruneWarnings` surfaces (validation catches it).
 *
 * Nodes marked for BOTH channels (the default — `channels` absent) always
 * survive, so a flow with no channel marks is returned unchanged.
 */
export function pruneFlowForChannel(flow: EngineFlow, channel: FlowChannel): EngineFlow {
	const prunedIds = new Set(
		flow.nodes.filter((node) => !channelAllows(node.channels, channel)).map((node) => node.id),
	);
	if (prunedIds.size === 0) {
		return flow;
	}

	const byId = new Map(flow.nodes.map((node) => [node.id, node]));

	/** Resolve an id past any pruned nodes to the first surviving node (or undefined). */
	function resolve(id: string | undefined, seen: Set<string> = new Set()): string | undefined {
		if (!id || !prunedIds.has(id)) {
			return id;
		}
		if (seen.has(id)) {
			// Cycle among pruned nodes → no surviving destination.
			return undefined;
		}
		seen.add(id);
		return resolve(primaryTarget(byId.get(id)), seen);
	}

	const nodes = flow.nodes
		.filter((node) => !prunedIds.has(node.id))
		.map((node) => ({
			...node,
			exits: node.exits.map((exit) => ({ ...exit, target: resolve(exit.target) })),
		}));

	const scenarios = flow.scenarios
		? (flow.scenarios
				.map((scenario) => ({ ...scenario, target: resolve(scenario.target) }))
				.filter((scenario) => scenario.target !== undefined) as EngineFlowScenario[])
		: undefined;

	return { entry: resolve(flow.entry) ?? "", nodes, scenarios };
}

/**
 * Human-readable warnings when pruning `flow` for `channel` would leave an
 * unsound graph: an orphaned entry (the node the call begins on is unavailable
 * on this channel and nothing splices in behind it) or a dangling target. These
 * are non-blocking — surfaced in the builder so the author can add a
 * channel-appropriate entry, but a flow can still ship (voice keeps working).
 */
export function channelPruneWarnings(flow: EngineFlow, channel: FlowChannel): string[] {
	if (flow.nodes.length === 0) {
		return [];
	}
	const pruned = pruneFlowForChannel(flow, channel);
	// No node was pruned → nothing channel-specific to warn about.
	if (pruned === flow) {
		return [];
	}

	const label = channel === "text" ? "Text" : "Voice";
	const otherLabel = channel === "text" ? "voice" : "text";
	const warnings: string[] = [];

	if (!pruned.entry) {
		warnings.push(
			`${label} callers have no starting node — the node the call begins on is ${otherLabel}-only. Add a ${channel} node at the start of the flow.`,
		);
		return warnings;
	}

	const survivingIds = new Set(pruned.nodes.map((node) => node.id));
	if (!survivingIds.has(pruned.entry)) {
		warnings.push(`${label} flow entry points at a node that isn't available on ${channel}.`);
	}
	// Defensive: `resolve` only ever yields a surviving id or undefined, so a
	// dangling target should be impossible — but flag it rather than ship a
	// silently broken graph if that invariant ever changes.
	for (const node of pruned.nodes) {
		for (const exit of node.exits) {
			if (exit.target && !survivingIds.has(exit.target)) {
				warnings.push(
					`On ${channel}, "${node.name ?? node.id}" points at a node that was removed.`,
				);
			}
		}
	}
	return warnings;
}
