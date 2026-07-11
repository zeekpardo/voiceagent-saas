"use client";

import { useSession } from "@auth/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useLimitsQuery } from "../lib/api";
import { LimitEditor } from "./LimitEditor";

/**
 * Platform-admin-only mini-card for the project-wide default concurrency
 * limit (scope "project" — applies across the whole engine project when no
 * more specific agent/group limit is set). Distinct from org-admin: this
 * gates on the Better Auth platform role, not org membership, since the
 * limit spans every organization on this instance. Renders nothing for
 * non-platform-admins; the oRPC procedure also enforces this server-side.
 */
export function ProjectLimitCard() {
	const { user } = useSession();
	const isPlatformAdmin = user?.role === "admin";
	const { data, isLoading } = useLimitsQuery(isPlatformAdmin);

	if (!isPlatformAdmin) {
		return null;
	}

	const projectLimit = data?.rows.find((row) => row.scope === "project") ?? null;

	return (
		<Card className="mb-4">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Project concurrency limit</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-8 w-40" />
				) : (
					<LimitEditor scope="project" currentValue={projectLimit?.maxConcurrent ?? null} />
				)}
			</CardContent>
		</Card>
	);
}
