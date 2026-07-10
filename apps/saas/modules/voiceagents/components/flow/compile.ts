// Re-export shim — the implementation now lives in ./compile/ (split by
// concern: text assembly, validation, per-kind node compile/decompile).
// Kept so existing `from "./compile"` / `from "../compile"` imports keep working.
export * from "./compile/index";
