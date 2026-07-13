import { expect, test } from "@playwright/test";

test.describe("login page", () => {
	test("should load and show all relevant login form components", async ({ page }) => {
		await page.goto("/login");

		// Main heading and subtitle
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
		await expect(page.getByText("Please enter your credentials to sign in.")).toBeVisible();

		// Password login is the only credential mode (magic-link removed) — the mode
		// switch is gone and the email + password fields render directly.
		await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();

		// Password field and forgot password link
		const passwordInput = page.locator('input[autocomplete="current-password"]');
		await expect(passwordInput).toBeVisible();
		await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();

		// Submit button (password mode)
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

		// "Or continue with" divider
		await expect(page.getByText("Or continue with")).toBeVisible();

		// Passkey button
		await expect(page.getByRole("button", { name: "Login with passkey" })).toBeVisible();

		// Sign up is disabled (invite-only) — the create-account link is hidden.
		await expect(page.getByRole("link", { name: /Create an account/ })).toHaveCount(0);
		await expect(page.getByText("Don't have an account yet?")).toHaveCount(0);
	});

	test("magic-link login is not offered (backdoor removed)", async ({ page }) => {
		await page.goto("/login");

		// The magic-link auth mode was removed (its /sign-in/magic-link endpoint
		// self-signed-up users, bypassing invite-only gating). Assert no trace of it
		// in the UI so it can't silently regress.
		await expect(page.getByRole("tab", { name: "Magic link" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Send magic link" })).toHaveCount(0);

		// Password login remains fully functional.
		await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
		await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
	});
});
