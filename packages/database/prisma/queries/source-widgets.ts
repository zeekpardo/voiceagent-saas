import { db } from "../client";
import type { Prisma } from "../generated/client";

// ---------------------------------------------------------------- source widgets (saved Website Widgets)

/** Every saved widget for a source, newest first — powers the Studio list. */
export async function listSourceWidgets(sourceId: string) {
	return db.sourceWidget.findMany({
		where: { sourceId },
		orderBy: { updatedAt: "desc" },
	});
}

/** Org-scoped single-widget lookup (via its owning source) for owner checks. */
export async function getSourceWidget(id: string) {
	return db.sourceWidget.findUnique({ where: { id }, include: { source: true } });
}

/**
 * Unscoped, enabled-only lookup for the PUBLIC config-by-ID endpoint. Returns
 * null for a missing OR disabled widget so the route can 404 either way without
 * leaking which case it hit.
 */
export async function getEnabledSourceWidget(id: string) {
	return db.sourceWidget.findFirst({ where: { id, enabled: true } });
}

export async function createSourceWidget(data: {
	sourceId: string;
	agentId: string;
	name: string;
	widgetToken: string;
	origins: string[];
	appearance: Prisma.InputJsonValue;
	targeting: Prisma.InputJsonValue;
	behavior: Prisma.InputJsonValue;
}) {
	return db.sourceWidget.create({ data });
}

export async function updateSourceWidget(
	id: string,
	data: {
		name?: string;
		agentId?: string;
		enabled?: boolean;
		widgetToken?: string;
		origins?: string[];
		appearance?: Prisma.InputJsonValue;
		targeting?: Prisma.InputJsonValue;
		behavior?: Prisma.InputJsonValue;
	},
) {
	return db.sourceWidget.update({ where: { id }, data });
}

export async function deleteSourceWidget(id: string) {
	return db.sourceWidget.delete({ where: { id } });
}
