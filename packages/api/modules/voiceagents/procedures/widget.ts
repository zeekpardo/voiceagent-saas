import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import { createWidgetToken } from "../lib/widget-token";

/**
 * Mints an embeddable widget token for an agent plus a ready-to-paste <script>
 * snippet. The caller must own the agent; the token pins the agent, the owning
 * organization, and the website origins allowed to start sessions with it.
 *
 * The snippet references `${NEXT_PUBLIC_SAAS_URL}/widget.js` — the loader that
 * a later wave (W2a) will ship at that path. Here we only compose the string.
 */
export const createToken = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents/{agentId}/widget-token",
		tags: ["Voice Agents"],
		summary: "Mint an embeddable widget token + <script> snippet for an agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			/** Website origins allowed to use this token. "*" allows any (dev). */
			origins: z.array(z.string()).min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const organizationId = await requireOwnedAgent(context.session, input.agentId);
		const token = createWidgetToken(input.agentId, organizationId, input.origins);
		const base = (process.env.NEXT_PUBLIC_SAAS_URL ?? "http://localhost:3000").replace(/\/$/, "");
		const snippet = `<script src="${base}/widget.js" data-widget-token="${token}" async></script>`;
		return { token, snippet };
	});
