import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	createConversation,
	findConversationByExternalRef,
	findOrCreateConversation,
	postConversationMessage,
} from "./conversations-client";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
	return vi.fn().mockResolvedValue({
		ok,
		status,
		json: async () => body,
	});
}

describe("conversations-client", () => {
	beforeEach(() => {
		process.env.VOICE_GATEWAY_API_KEY = "vk_test";
		process.env.VOICE_GATEWAY_URL = "http://gateway.test";
	});
	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.VOICE_GATEWAY_API_KEY;
		delete process.env.VOICE_GATEWAY_URL;
	});

	it("creates a conversation and only sends provided optional fields", async () => {
		const fetchMock = mockFetchOnce({ id: "conv_1", reply: "Hi!" });
		vi.stubGlobal("fetch", fetchMock);

		const result = await createConversation({
			agentId: "agt_1",
			externalRef: "ghl_conv_1",
			groupRef: "src_1",
			variables: { contact_first_name: "Sam" },
		});

		expect(result.id).toBe("conv_1");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://gateway.test/v1/conversations");
		const sent = JSON.parse(init.body);
		expect(sent).toMatchObject({
			agent_id: "agt_1",
			external_ref: "ghl_conv_1",
			group_ref: "src_1",
			variables: { contact_first_name: "Sam" },
		});
		expect(sent).not.toHaveProperty("contactState");
		expect(sent).not.toHaveProperty("metadata");
	});

	it("resolves an existing conversation by external ref (list shape)", async () => {
		const fetchMock = mockFetchOnce({ conversations: [{ id: "conv_9" }] });
		vi.stubGlobal("fetch", fetchMock);

		const found = await findConversationByExternalRef("ghl_conv_9");
		expect(found?.id).toBe("conv_9");
		expect(fetchMock.mock.calls[0][0]).toContain("external_ref=ghl_conv_9");
	});

	it("returns null when no conversation matches", async () => {
		vi.stubGlobal("fetch", mockFetchOnce({ conversations: [] }));
		expect(await findConversationByExternalRef("nope")).toBeNull();
	});

	it("find-or-create prefers the existing conversation (no create call)", async () => {
		const fetchMock = mockFetchOnce({ conversations: [{ id: "conv_existing" }] });
		vi.stubGlobal("fetch", fetchMock);

		const { conversation, created } = await findOrCreateConversation({
			agentId: "agt_1",
			externalRef: "ghl_conv_1",
		});
		expect(created).toBe(false);
		expect(conversation.id).toBe("conv_existing");
		expect(fetchMock).toHaveBeenCalledTimes(1); // only the lookup
	});

	it("find-or-create creates when none exists", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ conversations: [] }) })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "conv_new" }) });
		vi.stubGlobal("fetch", fetchMock);

		const { conversation, created } = await findOrCreateConversation({
			agentId: "agt_1",
			externalRef: "ghl_conv_1",
		});
		expect(created).toBe(true);
		expect(conversation.id).toBe("conv_new");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("posts a turn and returns the reply", async () => {
		const fetchMock = mockFetchOnce({ reply: "On my way", ended: false });
		vi.stubGlobal("fetch", fetchMock);

		const turn = await postConversationMessage("conv_1", "hello");
		expect(turn.reply).toBe("On my way");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://gateway.test/v1/conversations/conv_1/messages");
		expect(JSON.parse(init.body)).toEqual({ text: "hello" });
	});
});
