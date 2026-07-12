import { describe, expect, it } from "vitest";

import { extractInboundContent } from "./inbound-content";

describe("extractInboundContent", () => {
	it("returns the trimmed body for a plain text message", () => {
		expect(extractInboundContent({ body: "  hello there  " })).toEqual({
			text: "hello there",
			hadMedia: false,
			mediaCount: 0,
		});
	});

	it("uses a placeholder for a media-only (MMS) message", () => {
		const out = extractInboundContent({ body: "", attachments: ["https://x/img.jpg"] });
		expect(out.text).toBe("[the contact sent an image/attachment]");
		expect(out.hadMedia).toBe(true);
		expect(out.mediaCount).toBe(1);
	});

	it("keeps the caption alongside the placeholder", () => {
		const out = extractInboundContent({
			body: "is this the one?",
			attachments: ["https://x/a.png", { url: "https://x/b.png" }],
		});
		expect(out.text).toBe("[the contact sent an image/attachment] is this the one?");
		expect(out.mediaCount).toBe(2);
	});

	it("ignores empty/malformed attachment entries", () => {
		expect(extractInboundContent({ body: "hi", attachments: ["", {}, null] })).toEqual({
			text: "hi",
			hadMedia: false,
			mediaCount: 0,
		});
	});

	it("yields empty text for a truly empty message (route then skips)", () => {
		expect(extractInboundContent({ body: "", attachments: [] }).text).toBe("");
		expect(extractInboundContent({}).text).toBe("");
	});
});
