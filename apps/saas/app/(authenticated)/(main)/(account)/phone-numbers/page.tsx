import { PageHeader } from "@shared/components/PageHeader";
import { NumbersTable } from "@voiceagents/components/NumbersTable";
import Link from "next/link";

export default async function PhoneNumbersPage() {
	return (
		<div>
			<PageHeader
				title="Phone Numbers"
				subtitle="An org-wide overview of every number and the agent it routes to"
			/>
			<p className="mb-4 text-sm text-muted-foreground">
				To buy or release numbers, open a source from the{" "}
				<Link href="/sources" className="font-medium underline hover:text-foreground">
					Sources
				</Link>{" "}
				page — numbers are managed per source.
			</p>
			<NumbersTable />
		</div>
	);
}
