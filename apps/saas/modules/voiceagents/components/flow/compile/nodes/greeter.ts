import type { GreeterNodeData } from "../../flow-types";

/**
 * The Greeter is a canvas-level fixture, not an engine flow node — its text
 * compiles into config.greeting (handled in compileCanvas) and its outgoing
 * edge target becomes the flow entry. There is therefore no engine node to
 * emit and nothing to decompile per-node; canvasFromFlow inserts the greeter
 * between Start and the entry node directly.
 */

/** Fresh Greeter data (the fixture is created empty and edited on the canvas). */
export function newGreeterNodeData(greeting = "", greetingGenerate = false): GreeterNodeData {
	return greetingGenerate
		? { title: "Greeter", greeting, greetingGenerate: true }
		: { title: "Greeter", greeting };
}
