import { passkey } from "@better-auth/passkey";
import {
	db,
	getInvitationById,
	getPurchasesByOrganizationId,
	getPurchasesByUserId,
	getUserByEmail,
	getUserById,
} from "@repo/database";
import { config as i18nConfig, type Locale } from "@repo/i18n";
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { createWelcomeNotification } from "@repo/notifications";
import { cancelSubscription } from "@repo/payments";
import { getBaseUrl } from "@repo/utils";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { admin, openAPI, organization, twoFactor } from "better-auth/plugins";
import { parse as parseCookies } from "cookie";

import { config } from "./config";
import { updateSeatsInOrganizationSubscription } from "./lib/organization";
import { getRedisSecondaryStorage } from "./lib/secondary-storage";
import { invitationOnlyPlugin } from "./plugins/invitation-only";

const getLocaleFromRequest = (request?: Request) => {
	const cookies = parseCookies(request?.headers.get("cookie") ?? "");
	return (cookies[i18nConfig.localeCookieName] as Locale) ?? i18nConfig.defaultLocale;
};

const appUrl = getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);

// Shared Redis for cross-instance auth-endpoint rate limiting — present ONLY when
// REDIS_URL is set (else undefined → Better Auth keeps its default in-memory
// rate limiting + Postgres sessions, preserving local dev / tests / CI). When
// present it is paired with `rateLimit.storage: "secondary-storage"` AND
// `session.storeSessionInDatabase: true` so ONLY rate limiting relies on Redis
// and sessions stay authoritative in Postgres. See lib/secondary-storage.ts.
const redisSecondaryStorage = getRedisSecondaryStorage();

export const auth = betterAuth({
	baseURL: appUrl,
	trustedOrigins: [appUrl],
	database: prismaAdapter(db, {
		provider: "postgresql",
	}),
	...(redisSecondaryStorage ? { secondaryStorage: redisSecondaryStorage } : {}),
	advanced: {
		database: {
			generateId: false,
		},
		// Railway (and most PaaS proxies) forward the client IP in x-forwarded-for.
		// Without this, rate-limit + audit IPs collapse to the proxy address.
		// NOTE: the left-most XFF hop is client-settable — this is best-effort attribution,
		// not a hard control. A trusted-proxy-depth resolver + shared store is plan item 7.
		ipAddress: {
			ipAddressHeaders: ["x-forwarded-for"],
		},
	},
	// Auth-endpoint rate limiting. Backed by shared Redis via `secondaryStorage`
	// when REDIS_URL is set (correct across instances); otherwise Better Auth's
	// default in-memory per-instance storage (preserves local dev / tests / CI).
	rateLimit: {
		enabled: true,
		...(redisSecondaryStorage ? { storage: "secondary-storage" as const } : {}),
		window: 60,
		max: 100,
		customRules: {
			// Credential + code guessing
			"/sign-in/email": { window: 60, max: 5 },
			"/two-factor/verify-totp": { window: 60, max: 5 },
			"/two-factor/verify-otp": { window: 60, max: 5 },
			"/two-factor/verify-backup-code": { window: 60, max: 5 },
			// Signup + email-dispatch (invite-gated, but throttle to prevent email-bombing)
			"/sign-up/email": { window: 300, max: 5 },
			// The reset-request endpoint that DISPATCHES emails. better-auth's
			// authClient.requestPasswordReset() posts to /request-password-reset;
			// /forget-password is only the legacy alias. Both are keyed so the
			// email-send is throttled regardless of which the client calls.
			"/request-password-reset": { window: 300, max: 3 },
			"/forget-password": { window: 300, max: 3 },
			"/reset-password": { window: 300, max: 5 },
			"/send-verification-email": { window: 300, max: 3 },
		},
	},
	session: {
		expiresIn: config.sessionCookieMaxAge,
		freshAge: 0,
		// CRITICAL: when `secondaryStorage` is provided, better-auth 1.6.22 would
		// otherwise move sessions into Redis (Redis-only). This keeps Postgres as
		// the session source of truth so ONLY rate limiting uses Redis; sessions
		// are unaffected. Harmless no-op when no secondaryStorage is configured
		// (sessions already live in the DB). See lib/secondary-storage.ts.
		storeSessionInDatabase: true,
	},
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const user = await getUserById(session.userId);
					return {
						data: {
							...session,
							activeOrganizationId: user?.lastActiveOrganizationId ?? null,
						},
					};
				},
			},
		},
		user: {
			create: {
				after: async (createdUser) => {
					if (!createdUser?.id) {
						return;
					}
					try {
						await createWelcomeNotification(createdUser.id);
					} catch (error) {
						logger.error(error, {
							ctx: "createWelcomeNotification",
							userId: createdUser.id,
						});
					}
				},
			},
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/organization/accept-invitation")) {
				const { invitationId } = ctx.body;

				if (!invitationId) {
					return;
				}

				const invitation = await getInvitationById(invitationId);

				if (!invitation) {
					return;
				}

				await updateSeatsInOrganizationSubscription(invitation.organizationId);
			} else if (ctx.path.startsWith("/organization/remove-member")) {
				const { organizationId } = ctx.body;

				if (!organizationId) {
					return;
				}

				await updateSeatsInOrganizationSubscription(organizationId);
			}
		}),
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/delete-user") || ctx.path.startsWith("/organization/delete")) {
				const userId = ctx.context.session?.session.userId;
				const { organizationId } = ctx.body;

				if (userId || organizationId) {
					const purchases = organizationId
						? await getPurchasesByOrganizationId(organizationId)
						: // oxlint-disable-next-line typescript/no-non-null-assertion -- This is a valid case
							await getPurchasesByUserId(userId!);
					const subscriptions = purchases.filter(
						(purchase) => purchase.type === "SUBSCRIPTION" && purchase.subscriptionId !== null,
					);

					if (subscriptions.length > 0) {
						for (const subscription of subscriptions) {
							await cancelSubscription(
								// oxlint-disable-next-line typescript/no-non-null-assertion -- This is a valid case
								subscription.subscriptionId!,
							);
						}
					}
				}
			}
		}),
	},
	user: {
		additionalFields: {
			onboardingComplete: {
				type: "boolean",
				required: false,
			},
			locale: {
				type: "string",
				required: false,
			},
			lastActiveOrganizationId: {
				type: "string",
				required: false,
			},
		},
		deleteUser: {
			enabled: true,
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user: { email, name }, url }, request) => {
				const locale = getLocaleFromRequest(request);
				await sendEmail({
					to: email,
					templateId: "emailVerification",
					context: {
						url,
						name,
					},
					locale,
				});
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		// If signup is disabled, the only way to sign up is via an invitation. So in this case we can auto sign in the user, as the email is already verified by the invitation.
		// If signup is enabled, we can't auto sign in the user, as the email is not verified yet.
		autoSignIn: !config.enableSignup,
		requireEmailVerification: config.enableSignup,
		sendResetPassword: async ({ user, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: user.email,
				templateId: "forgotPassword",
				context: {
					url,
					name: user.name,
				},
				locale,
			});
		},
		minPasswordLength: 8,
	},
	emailVerification: {
		sendOnSignUp: config.enableSignup,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user: { email, name }, url }, request) => {
			const locale = getLocaleFromRequest(request);
			await sendEmail({
				to: email,
				templateId: "emailVerification",
				context: {
					url,
					name,
				},
				locale,
			});
		},
	},
	// Social providers are registered ONLY when config.enableSocialLogin is true.
	// The /sign-in/social + /callback/:provider endpoints self-create users in the
	// OAuth callback, which invitationOnlyPlugin (it only guards /sign-up/email)
	// does NOT cover — so leaving them registered on an invite-only instance is a
	// self-signup bypass the moment GOOGLE_/GITHUB_CLIENT_ID is set. Gating the
	// whole block off the config flag keeps the server in sync with the UI (which
	// already hides the buttons when the flag is false). If you re-enable this,
	// pair it with invite-gating (e.g. an OAuth-callback membership/invite check)
	// the same way magic-link would need disableSignUp.
	...(config.enableSocialLogin
		? {
				socialProviders: {
					google: {
						clientId: process.env.GOOGLE_CLIENT_ID as string,
						clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
						scope: ["email", "profile"],
					},
					github: {
						clientId: process.env.GITHUB_CLIENT_ID as string,
						clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
						scope: ["user:email"],
					},
				},
			}
		: {}),
	plugins: [
		admin(),
		passkey(),
		// Magic-link login is intentionally NOT registered. The better-auth magicLink plugin
		// exposes /sign-in/magic-link, which self-signs-up new users and bypasses
		// invitationOnlyPlugin (that only guards /sign-up/email) — an open-signup backdoor.
		// To re-enable as a LOGIN-ONLY method: re-add magicLink({ disableSignUp: true, ... })
		// here AND set config.enableMagicLink = true (the login UI keys off that flag).
		organization({
			sendInvitationEmail: async ({ email, id, organization }, request) => {
				const locale = getLocaleFromRequest(request);
				const existingUser = await getUserByEmail(email);

				const url = new URL(
					existingUser ? "/login" : "/signup",
					getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000),
				);

				url.searchParams.set("invitationId", id);
				url.searchParams.set("email", email);

				await sendEmail({
					to: email,
					templateId: "organizationInvitation",
					locale,
					context: {
						organizationName: organization.name,
						url: url.toString(),
					},
				});
			},
		}),
		openAPI(),
		invitationOnlyPlugin(),
		twoFactor(),
	],
	onAPIError: {
		onError(error, ctx) {
			logger.error(error, { ctx });
		},
	},
});

export * from "./lib/organization";

export type Session = typeof auth.$Infer.Session;

export type ActiveOrganization = NonNullable<
	Awaited<ReturnType<typeof auth.api.getFullOrganization>>
>;

export type Organization = typeof auth.$Infer.Organization;

export type OrganizationMemberRole = ActiveOrganization["members"][number]["role"];

export type OrganizationInvitationStatus = typeof auth.$Infer.Invitation.status;

export type OrganizationMetadata = Record<string, unknown> | undefined;
