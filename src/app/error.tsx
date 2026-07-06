"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(120,197,173,0.16),_transparent_24%),linear-gradient(180deg,#07090d_0%,#05070b_60%,#030406_100%)] px-4 py-4 text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] items-center justify-center">
        <div className="w-full rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,25,0.98),rgba(7,9,13,0.98))] p-5 shadow-[0_28px_110px_rgba(0,0,0,0.58)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">LetsCall</p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-white">Something went wrong.</h1>
          <p className="mt-3 text-[15px] leading-6 text-white/62">We could not load this screen. Try again to recover the mobile view.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 flex min-h-[56px] w-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] px-5 text-[16px] font-semibold text-[#07110f] shadow-[0_18px_42px_rgba(87,209,171,0.3)] transition active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}

