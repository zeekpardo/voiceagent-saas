import { ORPCError } from "@orpc/client";
import { getOrganizationById, getOrganizationMembership } from "@repo/database";
import { logger } from "@repo/logs";
import {
	createCheckoutLink as createCheckoutLinkFn,
	findPriceByPlanId,
	getCustomerIdFromEntity,
	getProviderPriceIdByPlanId,
	type PlanId,
} from "@repo/payments";
import { z } from "zod";

import { localeMiddleware } from "../../../orpc/middleware/locale-middleware";
import { protectedProcedure } from "../../../orpc/procedures";
import { assertRole } from "../../sources/lib/org";

export const createCheckoutLink = protectedProcedure
	.use(localeMiddleware)
	.route({
		method: "POST",
		path: "/payments/create-checkout-link",
		tags: ["Payments"],
		summary: "Create checkout link",
		description: "Creates a checkout link for a one-time or subscription product",
	})
	.input(
		z.object({
			planId: z.string(),
			type: z.enum(["one-time", "subscription"]),
			interval: z.enum(["month", "year"]).optional(),
			redirectUrl: z.string().optional(),
			organizationId: z.string().optional(),
		}),
	)
	.handler(
		async ({
			input: { planId, redirectUrl, type, interval, organizationId },
			context: { user },
		}) => {
			// Billing is owner-only. When purchasing for an organization, verify the
			// caller is an owner of THAT org (input-supplied, so it must be checked
			// here rather than via the active-org keystone).
			if (organizationId) {
				const membership = await getOrganizationMembership(organizationId, user.id);
				assertRole(membership?.role, ["owner"]);
			}

			const customerId = await getCustomerIdFromEntity(
				organizationId
					? {
							organizationId,
						}
					: {
							userId: user.id,
						},
			);

			const normalizedType = type === "subscription" ? "subscription" : "one-time";
			const price = findPriceByPlanId(planId as PlanId, {
				type: normalizedType,
				interval,
			});
			const priceId = getProviderPriceIdByPlanId(planId as PlanId, {
				type: normalizedType,
				interval,
			});

			if (!price || !priceId) {
				throw new ORPCError("NOT_FOUND");
			}

			const trialPeriodDays =
				price && "trialPeriodDays" in price ? price.trialPeriodDays : undefined;

			const organization = organizationId ? await getOrganizationById(organizationId) : undefined;

			if (organization === null) {
				throw new ORPCError("NOT_FOUND");
			}

			const seats =
				organization && price && "seatBased" in price && price.seatBased
					? organization.members.length
					: undefined;

			try {
				const checkoutLink = await createCheckoutLinkFn({
					type,
					priceId,
					email: user.email,
					name: user.name ?? "",
					redirectUrl,
					...(organizationId ? { organizationId } : { userId: user.id }),
					trialPeriodDays,
					seats,
					customerId: customerId ?? undefined,
				});

				if (!checkoutLink) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return { checkoutLink };
			} catch (e) {
				logger.error(e);
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
		},
	);
