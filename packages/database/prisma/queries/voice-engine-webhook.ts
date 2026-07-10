import { db } from "../client";

// ---------------------------------------------------------------- engine webhook registration

export async function getVoiceEngineWebhook(url: string) {
	return db.voiceEngineWebhook.findFirst({ where: { url } });
}

export async function saveVoiceEngineWebhook(data: {
	url: string;
	secret: string;
	gatewayId: string;
}) {
	await db.voiceEngineWebhook.deleteMany({ where: { url: data.url } });
	return db.voiceEngineWebhook.create({ data });
}
