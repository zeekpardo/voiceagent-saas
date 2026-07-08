import type { RouterClient } from "@orpc/server";

import { adminRouter } from "../modules/admin/router";
import { aiRouter } from "../modules/ai/router";
import { notificationsRouter } from "../modules/notifications/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paymentsRouter } from "../modules/payments/router";
import { sourcesRouter } from "../modules/sources/router";
import { usersRouter } from "../modules/users/router";
import { voiceagentsRouter } from "../modules/voiceagents/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	admin: adminRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	payments: paymentsRouter,
	ai: aiRouter,
	notifications: notificationsRouter,
	voiceagents: voiceagentsRouter,
	sources: sourcesRouter,
});

export type ApiRouterClient = RouterClient<typeof router>;
