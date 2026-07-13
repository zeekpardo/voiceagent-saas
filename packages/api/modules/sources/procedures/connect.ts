import { ORPCError } from "@orpc/server";
import { createSource } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { ensureCrmLiveTools } from "../../crm/lib/live-tools";
import { getCrmRegistration } from "../../crm/lib/resolve";
import { ensureVoiceWebhook } from "../../crm/lib/webhook-registration";
import { sealSourceConfig } from "../lib/config-crypto";
import { requireActiveOrganizationId } from "../lib/org";

export const connectSource = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/connect",
		tags: ["Sources"],
		summary: "Connect a new source (CRM sub-account) to the active organization",
	})
	.input(
		z.object({
			name: z.string().min(1).optional(),
			providerType: z.string().min(1),
			config: z.record(z.string(), z.string()),
		}),
	)
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);

		const registration = getCrmRegistration(input.providerType);
		if (!registration) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Unknown source provider "${input.providerType}"`,
			});
		}
		for (const field of registration.connectFields) {
			if (!input.config[field.name]?.trim()) {
				throw new ORPCError("BAD_REQUEST", { message: `Missing ${field.label}` });
			}
		}

		const provider = registration.create(input.config);
		let accountName: string | undefined;
		try {
			accountName = (await provider.validateConnection()).accountName;
		} catch (err) {
			throw new ORPCError("BAD_REQUEST", {
				message: `${registration.label} rejected the connection: ${err instanceof Error ? err.message : "check your credentials"}`,
			});
		}

		const source = await createSource({
			organizationId,
			name: input.name?.trim() || accountName || registration.label,
			providerType: input.providerType,
			accountName,
			// Encrypt token secrets at rest (leaves locationId etc. readable).
			config: sealSourceConfig(input.config),
		});

		// Make sure call.completed events reach this app.
		await ensureVoiceWebhook();

		// Register the live in-call CRM tools (best-effort — the connection works without them).
		await ensureCrmLiveTools(context.user.id).catch((err) => {
			console.warn("[sources-connect] live tool registration failed:", err);
		});

		return { id: source.id, name: source.name, providerType: source.providerType, accountName };
	});
