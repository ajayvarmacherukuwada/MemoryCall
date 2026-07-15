import { Suspense } from "react";
import { CallScreen } from "@/components/letscall/call-screen";

export default function Page() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#05070b]" />}>
      <CallScreen />
    </Suspense>
  );
}
