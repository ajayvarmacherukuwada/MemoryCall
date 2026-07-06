import { ArchivePlayerScreen } from "@/components/letscall/archive-player-screen";

export default async function Page({
  params,
}: {
  params: Promise<{ archiveId: string }>;
}) {
  const { archiveId } = await params;
  return <ArchivePlayerScreen archiveId={archiveId} />;
}