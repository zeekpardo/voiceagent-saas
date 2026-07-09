import { PageHeader } from "@shared/components/PageHeader";
import { NumbersTable } from "@voiceagents/components/NumbersTable";

export default async function PhoneNumbersPage() {
	return (
		<div>
			<PageHeader
				title="Phone Numbers"
				subtitle="Route each inbound number to the agent that should answer it"
			/>
			<NumbersTable />
		</div>
	);
}
