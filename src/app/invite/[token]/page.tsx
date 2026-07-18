import { InviteScreen } from "@/components/letscall/invite-screen";

export default function InvitePage({ params }: { params: { token: string } }) {
  return <InviteScreen token={params.token} />;
}