import { describe, expect, it } from "vitest";

import {
	parseWidgetAppearance,
	parseWidgetBehavior,
	parseWidgetTargeting,
	sanitizeWidgetConfig,
	WIDGET_APPEARANCE_DEFAULTS,
	widgetPatternMatches,
	widgetTargetingMatches,
} from "./widget-config";

describe("parseWidgetAppearance", () => {
	it("fills every default from an empty/undefined blob", () => {
		expect(parseWidgetAppearance(undefined)).toEqual(WIDGET_APPEARANCE_DEFAULTS);
		expect(parseWidgetAppearance({})).toEqual(WIDGET_APPEARANCE_DEFAULTS);
	});

	it("keeps valid fields and defaults invalid ones", () => {
		const parsed = parseWidgetAppearance({
			style: "panel",
			position: "banana",
			visualizer: "pulse",
			voice: false,
			theme: "dark",
		});
		expect(parsed.style).toBe("panel");
		expect(parsed.position).toBe("right"); // invalid → default
		expect(parsed.visualizer).toBe("pulse");
		expect(parsed.voice).toBe(false);
		expect(parsed.theme).toBe("dark");
		expect(parsed.chat).toBe(true);
	});
});

describe("parseWidgetTargeting", () => {
	it("defaults to empty include/exclude", () => {
		expect(parseWidgetTargeting(undefined)).toEqual({ include: [], exclude: [] });
	});

	it("preserves given rules", () => {
		const parsed = parseWidgetTargeting({
			include: [{ pattern: "/pricing" }],
			exclude: [{ pattern: "/admin/*" }],
		});
		expect(parsed.include).toEqual([{ pattern: "/pricing" }]);
		expect(parsed.exclude).toEqual([{ pattern: "/admin/*" }]);
	});
});

describe("parseWidgetBehavior", () => {
	it("defaults every trigger to disabled", () => {
		const parsed = parseWidgetBehavior(undefined);
		expect(parsed.exitIntent.enabled).toBe(false);
		expect(parsed.timeOnPage).toEqual({ enabled: false, seconds: 20, action: "open" });
		expect(parsed.scrollPercent).toEqual({ enabled: false, percent: 50, action: "open" });
	});

	it("clamps and keeps valid trigger fields", () => {
		const parsed = parseWidgetBehavior({
			timeOnPage: { enabled: true, seconds: 45 },
			scrollPercent: { enabled: true, percent: 80 },
		});
		expect(parsed.timeOnPage).toEqual({ enabled: true, seconds: 45, action: "open" });
		expect(parsed.scrollPercent).toEqual({ enabled: true, percent: 80, action: "open" });
	});
});

describe("widgetPatternMatches", () => {
	it("does a case-insensitive substring test for plain patterns", () => {
		expect(widgetPatternMatches("/pricing", "https://acme.com/Pricing/plans")).toBe(true);
		expect(widgetPatternMatches("blog", "https://acme.com/pricing")).toBe(false);
	});

	it("treats * as a wildcard", () => {
		expect(
			widgetPatternMatches("https://acme.com/*/checkout", "https://acme.com/us/checkout"),
		).toBe(true);
		expect(widgetPatternMatches("*/admin/*", "https://acme.com/admin/users")).toBe(true);
		expect(widgetPatternMatches("*/admin/*", "https://acme.com/account")).toBe(false);
	});

	it("never matches on a blank pattern", () => {
		expect(widgetPatternMatches("", "https://acme.com")).toBe(false);
		expect(widgetPatternMatches("   ", "https://acme.com")).toBe(false);
	});
});

describe("widgetTargetingMatches", () => {
	const url = "https://acme.com/pricing";

	it("shows on every page when include is empty", () => {
		expect(widgetTargetingMatches(url, { include: [], exclude: [] })).toBe(true);
	});

	it("requires a matching include when include is non-empty", () => {
		expect(widgetTargetingMatches(url, { include: [{ pattern: "/pricing" }], exclude: [] })).toBe(
			true,
		);
		expect(widgetTargetingMatches(url, { include: [{ pattern: "/blog" }], exclude: [] })).toBe(
			false,
		);
	});

	it("lets exclude win even when include matches", () => {
		expect(
			widgetTargetingMatches(url, {
				include: [{ pattern: "/pricing" }],
				exclude: [{ pattern: "/pricing" }],
			}),
		).toBe(false);
	});

	it("excludes against an empty include (all-but pattern)", () => {
		expect(
			widgetTargetingMatches("https://acme.com/admin/users", {
				include: [],
				exclude: [{ pattern: "/admin/*" }],
			}),
		).toBe(false);
		expect(
			widgetTargetingMatches("https://acme.com/home", {
				include: [],
				exclude: [{ pattern: "/admin/*" }],
			}),
		).toBe(true);
	});

	it("ignores blank patterns on both sides", () => {
		expect(
			widgetTargetingMatches(url, { include: [{ pattern: "  " }], exclude: [{ pattern: "" }] }),
		).toBe(true);
	});
});

describe("sanitizeWidgetConfig", () => {
	it("exposes only render-relevant fields, defaulting stale blobs", () => {
		const result = sanitizeWidgetConfig({
			name: "Support",
			appearance: { style: "panel" },
			targeting: null,
			behavior: undefined,
		});
		expect(result).toEqual({
			name: "Support",
			appearance: parseWidgetAppearance({ style: "panel" }),
			targeting: { include: [], exclude: [] },
			behavior: parseWidgetBehavior(undefined),
		});
		// No leakage of server-only fields — crucially NOT the session token, which
		// must not travel through the public wildcard-CORS config endpoint.
		expect(Object.keys(result).sort()).toEqual(
			["appearance", "behavior", "name", "targeting"].sort(),
		);
		expect(result).not.toHaveProperty("token");
	});
});
