import type { AuthConfig } from "./types";

export const config = {
	enableSignup: false,
	// Magic-link login is DISABLED: the better-auth magicLink plugin carries its own
	// signup path that bypasses invitationOnlyPlugin (which only matches /sign-up/email),
	// so leaving it on is an open-signup backdoor. Keep false unless the plugin is
	// re-registered login-only (disableSignUp: true) in auth.ts. See SECURITY-REMEDIATION-PLAN.md.
	enableMagicLink: false,
	enableSocialLogin: false,
	enablePasskeys: true,
	enablePasswordLogin: true,
	enableTwoFactor: true,
	sessionCookieMaxAge: 60 * 60 * 24 * 30,
	users: {
		enableOnboarding: true,
	},
	organizations: {
		enable: true,
		hideOrganization: false,
		enableUsersToCreateOrganizations: false,
		requireOrganization: true,
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"ai-demo",
			"organization-invitation",
			"chatbot",
		],
	},
} as const satisfies AuthConfig;
