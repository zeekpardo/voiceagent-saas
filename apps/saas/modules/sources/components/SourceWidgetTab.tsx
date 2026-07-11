"use client";

import { WidgetStudio } from "@voiceagents/components/widget/WidgetStudio";

/**
 * "Website Widget" tab on the Source detail page. The widget is installed on
 * the source's website, so it lives here — each saved widget picks its own
 * agent to answer conversations. Delegates to the Studio (list + editor).
 */
export function SourceWidgetTab({ sourceId }: { sourceId: string }) {
	return <WidgetStudio sourceId={sourceId} />;
}
