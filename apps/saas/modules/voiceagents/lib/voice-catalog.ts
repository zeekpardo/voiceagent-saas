/** Which TTS providers accept a speaking-speed option through LiveKit Inference. */
export const PROVIDER_SUPPORTS_SPEED: Record<string, boolean> = {
	xai: false,
	deepgram: false,
	cartesia: true,
	elevenlabs: true,
	rime: true,
	inworld: true,
};

export const TTS_PROVIDERS = [
	{ id: "xai", label: "xAI" },
	{ id: "cartesia", label: "Cartesia" },
	{ id: "elevenlabs", label: "ElevenLabs" },
	{ id: "deepgram", label: "Deepgram" },
	{ id: "rime", label: "Rime" },
	{ id: "inworld", label: "Inworld" },
];

export interface VoiceOption {
	id: string;
	label: string;
	provider: string;
}

export const CUSTOM_VOICE = "__custom__";

export const VOICE_GROUPS: { provider: string; label: string; voices: VoiceOption[] }[] = [
	{
		provider: "xai",
		label: "xAI",
		voices: [
			{ id: "ara", label: "Ara — warm, friendly (f)", provider: "xai" },
			{ id: "eve", label: "Eve — energetic, upbeat (f)", provider: "xai" },
			{ id: "leo", label: "Leo — authoritative, strong (m)", provider: "xai" },
			{ id: "rex", label: "Rex — confident, clear (m)", provider: "xai" },
			{ id: "sal", label: "Sal — neutral (m)", provider: "xai" },
		],
	},
	{
		provider: "cartesia",
		label: "Cartesia (Sonic 3)",
		voices: [
			{
				id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
				label: "Nova — natural (f)",
				provider: "cartesia",
			},
		],
	},
	{
		provider: "elevenlabs",
		label: "ElevenLabs",
		voices: [
			{ id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — calm, clear (f)", provider: "elevenlabs" },
			{ id: "pNInz6obpgDQGcFmaJgB", label: "Adam — deep, confident (m)", provider: "elevenlabs" },
			{ id: "ErXwobaYiN019PkySvjV", label: "Antoni — warm (m)", provider: "elevenlabs" },
			{ id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — soft, friendly (f)", provider: "elevenlabs" },
		],
	},
	{
		provider: "deepgram",
		label: "Deepgram (Aura 2)",
		voices: [
			{ id: "aura-2-thalia-en", label: "Thalia — clear, confident (f)", provider: "deepgram" },
			{ id: "aura-2-apollo-en", label: "Apollo — casual, comfortable (m)", provider: "deepgram" },
		],
	},
];

export const ALL_VOICES: VoiceOption[] = VOICE_GROUPS.flatMap((g) => g.voices);

export const LANGUAGES = [
	{ id: "en", label: "English" },
	{ id: "es", label: "Español" },
	{ id: "fr", label: "Français" },
	{ id: "de", label: "Deutsch" },
	{ id: "pt", label: "Português" },
	{ id: "hi", label: "हिन्दी" },
	{ id: "ja", label: "日本語" },
	{ id: "zh", label: "中文" },
];

export const MODEL_GROUPS: { label: string; models: { id: string; label: string }[] }[] = [
	{
		label: "xAI",
		models: [
			{ id: "grok-4-fast", label: "Grok 4 Fast (recommended for voice)" },
			{ id: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast — reasoning (slower)" },
		],
	},
	{
		label: "OpenAI",
		models: [
			{ id: "openai/gpt-4o-mini", label: "GPT-4o mini — fast, cheap workhorse" },
			{ id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
			{ id: "openai/gpt-4o", label: "GPT-4o" },
			{ id: "openai/gpt-4.1", label: "GPT-4.1" },
			{ id: "openai/gpt-5-mini", label: "GPT-5 mini" },
			{ id: "openai/gpt-5", label: "GPT-5 — smartest, slower" },
		],
	},
	{
		label: "Google",
		models: [
			{ id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — fastest" },
			{ id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
			{ id: "google/gemini-3-flash", label: "Gemini 3 Flash" },
			{ id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
			{ id: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
		],
	},
	{
		label: "Others",
		models: [
			{ id: "deepseek-ai/deepseek-v3.2", label: "DeepSeek V3.2 — cost play" },
			{ id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
			{ id: "zai/glm-5.1", label: "GLM 5.1" },
		],
	},
];

export const STT_GROUPS: { label: string; models: { id: string; label: string }[] }[] = [
	{
		label: "xAI",
		models: [{ id: "default", label: "xAI STT (engine default)" }],
	},
	{
		label: "Deepgram",
		models: [
			{ id: "deepgram/nova-3", label: "Nova 3 — community standard, multilingual" },
			{ id: "deepgram/nova-3-medical", label: "Nova 3 Medical" },
			{ id: "deepgram/nova-2-phonecall", label: "Nova 2 Phonecall — tuned for telephony" },
		],
	},
	{
		label: "AssemblyAI",
		models: [
			{ id: "assemblyai/universal-streaming", label: "Universal Streaming" },
			{
				id: "assemblyai/universal-streaming-multilingual",
				label: "Universal Streaming — multilingual",
			},
		],
	},
	{
		label: "Others",
		models: [
			{ id: "cartesia/ink-whisper", label: "Cartesia Ink Whisper" },
			{ id: "elevenlabs/scribe_v2_realtime", label: "ElevenLabs Scribe v2" },
		],
	},
];
