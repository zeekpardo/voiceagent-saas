import { AiChat } from "@ai/components/AiChat";
import { PageHeader } from "@shared/components/PageHeader";

export default async function AiDemoPage() {
	return (
		<div data-fullbleed>
			<PageHeader
				title="AI Chatbot"
				subtitle="This is an example chatbot built with the OpenAI API"
				className="max-w-3xl mx-auto"
			/>

			<AiChat />
		</div>
	);
}
