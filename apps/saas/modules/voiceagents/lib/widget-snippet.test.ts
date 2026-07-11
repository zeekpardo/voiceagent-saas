import { describe, expect, it } from "vitest";

import {
	composeWidgetIdSnippet,
	composeWidgetSnippet,
	isValidWidgetOrigin,
	normalizeWidgetOrigin,
	resolveWidgetChannels,
} from "./widget-snippet";

describe("composeWidgetSnippet", () => {
	it("emits the minimal snippet when everything is default", () => {
		const snippet = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok123",
		});
		expect(snippet).toBe(
			'<script src="https://app.example.com/widget.js" data-widget-token="tok123" async></script>',
		);
	});

	it("strips a trailing slash from the base url", () => {
		const snippet = composeWidgetSnippet({ baseUrl: "http://localhost:3000/", token: "t" });
		expect(snippet).toContain('src="http://localhost:3000/widget.js"');
	});

	it("includes non-default style, position and accent attributes", () => {
		const snippet = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok",
			style: "panel",
			position: "left",
			accent: "#ff0000",
		});
		expect(snippet).toContain('data-style="panel"');
		expect(snippet).toContain('data-position="left"');
		expect(snippet).toContain('data-accent="#ff0000"');
	});

	it("omits attributes that match the defaults", () => {
		const snippet = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok",
			style: "bubble",
			position: "right",
			accent: "#6366f1",
		});
		expect(snippet).not.toContain("data-style");
		expect(snippet).not.toContain("data-position");
		expect(snippet).not.toContain("data-accent");
	});

	it("always includes a data-target for the card style, defaulting the selector", () => {
		const withTarget = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok",
			style: "card",
			target: "#embed-here",
		});
		expect(withTarget).toContain('data-target="#embed-here"');

		const withoutTarget = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok",
			style: "card",
		});
		expect(withoutTarget).toContain('data-target="#voice-widget"');
	});

	it("does not include data-target for non-card styles", () => {
		const snippet = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: "tok",
			style: "bar",
			target: "#ignored",
		});
		expect(snippet).not.toContain("data-target");
	});

	it("escapes attribute-breaking characters", () => {
		const snippet = composeWidgetSnippet({
			baseUrl: "https://app.example.com",
			token: 'tok"><script>alert(1)</script>',
		});
		expect(snippet).not.toContain('"><script>alert');
		expect(snippet).toContain("&quot;>&lt;script>alert");
	});
});

describe("composeWidgetIdSnippet", () => {
	it("emits a data-widget-id loader tag", () => {
		expect(
			composeWidgetIdSnippet({ baseUrl: "https://app.example.com/", widgetId: "wgt_123" }),
		).toBe(
			'<script src="https://app.example.com/widget.js" data-widget-id="wgt_123" async></script>',
		);
	});

	it("escapes attribute-breaking characters in the id", () => {
		const snippet = composeWidgetIdSnippet({
			baseUrl: "https://app.example.com",
			widgetId: 'x"><script>',
		});
		expect(snippet).not.toContain('"><script>');
		expect(snippet).toContain("&quot;>&lt;script>");
	});
});

describe("resolveWidgetChannels", () => {
	it("trusts the widget's own config until server modes are known", () => {
		expect(resolveWidgetChannels({ voice: true, chat: true }, null)).toEqual(["voice", "text"]);
		expect(resolveWidgetChannels({ voice: false, chat: true }, null)).toEqual(["text"]);
	});

	it("intersects with server-allowed modes once known", () => {
		expect(resolveWidgetChannels({ voice: true, chat: true }, ["voice"])).toEqual(["voice"]);
		expect(resolveWidgetChannels({ voice: true, chat: true }, ["text"])).toEqual(["text"]);
		expect(resolveWidgetChannels({ voice: true, chat: false }, ["text"])).toEqual([]);
	});
});

describe("isValidWidgetOrigin", () => {
	it("accepts the wildcard", () => {
		expect(isValidWidgetOrigin("*")).toBe(true);
	});

	it("accepts bare http(s) origins", () => {
		expect(isValidWidgetOrigin("https://example.com")).toBe(true);
		expect(isValidWidgetOrigin("http://localhost:3000")).toBe(true);
		expect(isValidWidgetOrigin("https://sub.example.com:8443")).toBe(true);
	});

	it("rejects paths, missing schemes and other protocols", () => {
		expect(isValidWidgetOrigin("https://example.com/page")).toBe(false);
		expect(isValidWidgetOrigin("example.com")).toBe(false);
		expect(isValidWidgetOrigin("ftp://example.com")).toBe(false);
		expect(isValidWidgetOrigin("")).toBe(false);
	});
});

describe("normalizeWidgetOrigin", () => {
	it("collapses full page URLs to their origin", () => {
		expect(normalizeWidgetOrigin("https://link.minflow.co/preview/eZIeK31dLc8nA4KxExgs")).toBe(
			"https://link.minflow.co",
		);
		expect(normalizeWidgetOrigin("https://example.com/a/b?c=d#e")).toBe("https://example.com");
	});

	it("prepends https:// to bare domains", () => {
		expect(normalizeWidgetOrigin("example.com")).toBe("https://example.com");
		expect(normalizeWidgetOrigin("sub.example.com/some/path")).toBe("https://sub.example.com");
	});

	it("preserves explicit http and ports, passes the wildcard, trims whitespace", () => {
		expect(normalizeWidgetOrigin("http://localhost:3000/page")).toBe("http://localhost:3000");
		expect(normalizeWidgetOrigin("  https://example.com/  ")).toBe("https://example.com");
		expect(normalizeWidgetOrigin("*")).toBe("*");
	});

	it("rejects unusable input", () => {
		expect(normalizeWidgetOrigin("")).toBeNull();
		expect(normalizeWidgetOrigin("   ")).toBeNull();
		expect(normalizeWidgetOrigin("ftp://example.com")).toBeNull();
		expect(normalizeWidgetOrigin("not a url at all !!")).toBeNull();
	});
});
