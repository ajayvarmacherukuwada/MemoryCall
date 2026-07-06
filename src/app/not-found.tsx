export default function NotFoundPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(120,197,173,0.16),_transparent_24%),linear-gradient(180deg,#07090d_0%,#05070b_60%,#030406_100%)] px-4 py-4 text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] items-center justify-center">
        <div className="w-full rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,25,0.98),rgba(7,9,13,0.98))] p-5 shadow-[0_28px_110px_rgba(0,0,0,0.58)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">LetsCall</p>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-white">Page not found.</h1>
          <p className="mt-3 text-[15px] leading-6 text-white/62">The screen you are looking for does not exist.</p>
        </div>
      </div>
    </main>
  );
}

