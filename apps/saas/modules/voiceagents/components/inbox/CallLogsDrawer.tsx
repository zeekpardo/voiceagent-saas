"use client";

/**
 * The call AI-logs drawer is the generic {@link LogsDrawer} — call events and
 * omnichannel conversation events share one implementation (renderers, type
 * filter, JSON pretty-print). Kept as a named alias so existing call-inbox
 * imports stay stable.
 */
export { LogsDrawer as CallLogsDrawer } from "./LogsDrawer";
