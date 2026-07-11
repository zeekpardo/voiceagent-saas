import { SourceDetail } from "@sources/components/SourceDetail";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <SourceDetail sourceId={id} />;
}
