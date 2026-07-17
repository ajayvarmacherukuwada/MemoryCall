import { Suspense } from "react";
import { IncomingCallScreen } from "@/components/letscall/incoming-call-screen";

export default async function Page({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05070b]" />}>
      <IncomingCallScreen invitationId={invitationId} />
    </Suspense>
  );
}
