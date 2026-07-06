import { Suspense } from "react";
import { CallScreen } from "@/components/letscall/call-screen";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05070b]" />}>
      <CallScreen />
    </Suspense>
  );
}