import { ORPCError } from "@orpc/server";
import { getSourceWidget } from "@repo/database";

import { requireActiveOrganizationId } from "./org";

/**
 * Verifies the caller's active organization owns the widget (via its source),
 * returning the widget row (with its source). Throws NOT_FOUND otherwise so we
 * never reveal whether the id exists in another org.
 */
export async function requireOwnedWidget(
	session: { activeOrganizationId?: string | null },
	widgetId: string,
) {
	const organizationId = requireActiveOrganizationId(session);
	const widget = await getSourceWidget(widgetId);
	if (!widget || widget.source.organizationId !== organizationId) {
		throw new ORPCError("NOT_FOUND", { message: "Widget not found" });
	}
	return { widget, organizationId };
}
