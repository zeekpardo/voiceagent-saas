---
name: add-node-kind
description: Step-by-step guide for adding a new node kind to the voice-agent flow builder. Use when the user says "add a node kind", "new flow node", "add a <X> node to the flow builder", or "create a node type".
---

# Add a flow node kind

All paths are relative to `apps/saas/modules/voiceagents/components/flow/`.
Study an existing kind end-to-end first — `statement` (linear, one output) or `true-false` (branching) are the cleanest templates.

## 1. Types and schema — `flow-types.ts`

- Add the kind to the `FlowNodeKind` union.
- Define `<Kind>NodeData` and its Zod schema `<kind>NodeDataSchema` (this is what the registry validates against).
- Add a `<Kind>CanvasNodeDoc` narrowing and any handle-id constants (e.g. `STATEMENT_NEXT_HANDLE_ID`) the kind's source handles need.
- If the compiled output needs a new engine node shape, extend the `EngineFlowNode` union — see the cross-repo note below first.

## 2. Compile/decompile — `compile/nodes/<kind>.ts`

Create `compile<Kind>Node`, `decompile<Kind>Node`, and `new<Kind>NodeData()` (fresh default data). Mirror `compile/nodes/statement.ts`. Re-export from `compile/index.ts` alongside the others.

## 3. Canvas renderer — `<Kind>Node.tsx` at flow/ root

React Flow node component (wrap with `FlowNodeShell.tsx` like the existing nodes) rendering the node's summary and its source/target handles.

## 4. Editor — `editors/<kind>.tsx`

The panel shown in `NodeEditorPanel`. Use primitives from `editors/shared.tsx`. It receives the `FlowNodeEditorProps` contract from `kinds/types.ts` (`nodeId`, `data`, `onChange`, plus `isEntry`/`agentId`/`mentionExtension` if needed).

## 5. Registry entry — `kinds/<kind>.tsx` (the important one)

Call `defineKind<YourNodeData>` (from `kinds/types.ts`) bundling everything:

- `kind`, `schema` (the Zod schema from step 1)
- `canvasNode` (step 3), `editor` (step 4), `sheetMeta` (title/description for the edit sheet)
- `newData` (step 2 factory), `sourceHandles()` (Set of handle ids), `edgeLabel(handleId)`
- `compile(node, { entry, targetOf })` returning `{ node }` (or `{ scenario }` for scenario-like kinds), `decompile`
- `validate(node)` returning human-readable error strings (name the node in each message)

Then register it wherever the other kinds are aggregated — check `kinds/index.ts` (the registry aggregation is being consolidated right now; if `index.ts` exists, add your kind there; if the canvas still reads `kind-meta.ts`, add the matching `FLOW_KIND_META` entry too so the canvas can render it). Also make the node appear in the add-node UI (`ActionsPanel.tsx`) if it lists kinds explicitly.

## 6. Tests

Add compile/validate cases to `compile.test.ts`. Baseline before your change: 2 known failures ("rejects a branch node as the entry", "flags an empty say and rejects a statement as the entry"), 36 pass. Your kind must not change that set except by adding passing tests.

## 7. Cross-repo: does the kind affect runtime?

The engine (`~/Projects/voice-agent-engine`) is a **generic LiveKit runtime** executing the compiled flow spec — it carries no business/CRM logic.

- If your kind compiles into **existing** engine primitives (say text, branch, transfer, tool call): SaaS-only change, done.
- If it needs a **new runtime behavior**: the engine must gain a new *generic* node primitive (never a business-specific one). Coordinate: land the engine's flow-spec support first, then compile to it here. Flag this explicitly to the user before proceeding.

## 8. Verify

Run the `verify-saas` skill (type-check + vitest vs baseline + oxlint).
