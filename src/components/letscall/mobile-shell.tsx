"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { AppTab, CollectionTone } from "@/lib/letscall-data";
import { fetchIncomingInvitation } from "@/lib/contacts-client";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const tabs: Array<{
  id: AppTab;
  href: string;
  label: string;
  icon: ReactNode;
}> = [
  { id: "home", href: "/", label: "Home", icon: <path d="M4.5 11.2 12 5.1l7.5 6.1" strokeLinecap="round" strokeLinejoin="round" /> },
  {
    id: "library",
    href: "/library",
    label: "Library",
    icon: (
      <>
        <path d="M5.5 7.6h13" strokeLinecap="round" />
        <path d="M5.5 12h13" strokeLinecap="round" />
        <path d="M5.5 16.4h13" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "memory",
    href: "/memory",
    label: "+",
    icon: (
      <>
        <path d="M12 5v14" strokeLinecap="round" />
        <path d="M5 12h14" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "search",
    href: "/search",
    label: "Search",
    icon: (
      <>
        <circle cx="11" cy="11" r="5.3" />
        <path d="m15.2 15.2 3 3" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "profile",
    href: "/profile",
    label: "People",
    icon: (
      <>
        <circle cx="12" cy="9" r="3.4" />
        <path d="M6.5 18.2c1.3-2.5 3.6-3.8 5.5-3.8s4.2 1.3 5.5 3.8" strokeLinecap="round" />
      </>
    ),
  },
];

export function AppShell({
  activeTab,
  title,
  subtitle,
  headerBadge,
  mainClassName,
  showHeader = true,
  showNav = true,
  children,
}: {
  activeTab: AppTab;
  title: string;
  subtitle?: string;
  headerBadge?: string | null;
  mainClassName?: string;
  showHeader?: boolean;
  showNav?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname.startsWith("/call") || pathname.startsWith("/incoming")) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const checkIncomingInvitation = async () => {
      try {
        const response = await fetchIncomingInvitation();
        if (!cancelled && response.invitation) {
          router.replace(`/incoming/${encodeURIComponent(response.invitation.id)}`);
        }
      } catch {
        // No active session or no incoming invitation yet.
      }
    };

    void checkIncomingInvitation();
    intervalId = window.setInterval(() => {
      void checkIncomingInvitation();
    }, 5000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [pathname, router]);

  return (
    <div className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(120,197,173,0.16),_transparent_22%),radial-gradient(circle_at_bottom,_rgba(68,121,255,0.12),_transparent_26%),linear-gradient(180deg,#07090d_0%,#05070b_40%,#030406_100%)] text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1280px] items-center justify-center px-3 py-3 sm:px-6 sm:py-6">
        <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,25,0.98),rgba(7,9,13,0.98))] shadow-[0_28px_110px_rgba(0,0,0,0.58)] ring-1 ring-white/5 sm:h-[calc(100dvh-3rem)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(142,241,209,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(111,138,255,0.12),transparent_20%)]" />
          <div className="relative flex h-full flex-col letscall-screen">
            {showHeader ? (
              <header className="border-b border-white/8 px-5 pb-4 pt-[calc(14px+env(safe-area-inset-top))]">
                <div className="flex items-center justify-between text-[12px] font-medium tracking-[0.22em] text-white/58">
                  <span>09:41</span>
                  <span className="flex items-center gap-2 text-white/52">
                    <span className="size-2 rounded-full bg-emerald-300/80" />
                    <span className="h-2.5 w-4 rounded-full border border-white/35" />
                    <span className="h-2.5 w-5 rounded-[6px] border border-white/35" />
                  </span>
                </div>

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">LetsCall</p>
                    <h1 className="mt-2 text-[27px] font-semibold tracking-[-0.04em] text-white">{title}</h1>
                    {subtitle ? <p className="mt-3 max-w-[320px] text-[15px] leading-6 text-white/60">{subtitle}</p> : null}
                  </div>
                  {headerBadge === null ? null : (
                    <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-[12px] font-medium text-white/72 backdrop-blur-xl">
                      {headerBadge ?? (pathname === "/profile" ? "People" : "Ready")}
                    </div>
                  )}
                </div>
              </header>
            ) : null}

            <main
              className={mainClassName ? mainClassName : "letscall-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4"}
            >
              {children}
            </main>

            {showNav ? (
              <nav className="border-t border-white/8 bg-[rgba(8,11,16,0.88)] px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
                <div className="grid grid-cols-5 items-end gap-1">
                  {tabs.map((tab) => {
                    const isActive = tab.id === activeTab;
                    const isMemory = tab.id === "memory";

                    if (isMemory) {
                      return (
                        <Link
                          key={tab.id}
                          href={tab.href}
                          aria-label={tab.label}
                          className={cx(
                            "group relative -mt-8 flex flex-col items-center justify-center gap-2 rounded-[24px] px-1 pb-1 pt-0 text-center transition duration-200 active:scale-[0.98]",
                            isActive ? "text-white" : "text-white/62",
                          )}
                        >
                          <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-[linear-gradient(180deg,#93f4d5_0%,#65c9ad_100%)] text-[0px] text-[#08110f] shadow-[0_18px_40px_rgba(87,209,171,0.28)] ring-1 ring-white/25 transition duration-200 group-active:scale-[0.98]">
                            <svg viewBox="0 0 24 24" className="size-[20px]" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14" strokeLinecap="round" />
                              <path d="M5 12h14" strokeLinecap="round" />
                            </svg>
                          </span>
                          <span className="text-[10px] font-semibold tracking-[0.06em]">+</span>
                        </Link>
                      );
                    }

                    return (
                      <Link
                        key={tab.id}
                        href={tab.href}
                        className={cx(
                          "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[18px] px-1 py-2 text-center transition duration-200 active:scale-[0.98]",
                          isActive ? "bg-white/8 text-white" : "text-white/48 hover:bg-white/5 hover:text-white/72",
                        )}
                      >
                        <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth="1.9">
                          {tab.icon}
                        </svg>
                        <span className="text-[10px] font-semibold tracking-[0.04em]">{tab.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-[28px] border border-white/10 bg-white/6 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">{eyebrow}</p>
        <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex min-h-[36px] items-center rounded-full border border-white/10 bg-white/6 px-3 text-[12px] font-medium text-white/72">{children}</span>;
}

export function Avatar({
  name,
  imageUrl,
  size = 56,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(146,241,211,0.24),rgba(255,255,255,0.1))] text-white shadow-[0_16px_36px_rgba(0,0,0,0.24)]"
      style={{ width: size, height: size }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[15px] font-semibold tracking-[0.12em] text-white">{initials || "LC"}</span>
      )}
    </div>
  );
}

const collectionStyles: Record<CollectionTone, string> = {
  rose: "bg-[linear-gradient(135deg,rgba(251,113,133,0.2),rgba(255,255,255,0.05))]",
  cyan: "bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(255,255,255,0.05))]",
  emerald: "bg-[linear-gradient(135deg,rgba(52,211,153,0.18),rgba(255,255,255,0.05))]",
  violet: "bg-[linear-gradient(135deg,rgba(167,139,250,0.18),rgba(255,255,255,0.05))]",
  amber: "bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(255,255,255,0.05))]",
  indigo: "bg-[linear-gradient(135deg,rgba(99,102,241,0.18),rgba(255,255,255,0.05))]",
  neutral: "bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))]",
};

export function MemoryCard({
  title,
  participants,
  time,
  duration,
  summary,
  tag,
}: {
  title: string;
  participants: string;
  time: string;
  duration: string;
  summary: string;
  tag: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/36">{tag}</p>
          <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-white">{title}</h3>
          <p className="mt-1 text-[13px] text-white/52">{participants}</p>
        </div>
        <Badge>{duration}</Badge>
      </div>
      <p className="mt-3 text-[14px] leading-6 text-white/68">{summary}</p>
      <div className="mt-4 text-[12px] font-medium tracking-[0.04em] text-white/40">{time}</div>
    </GlassCard>
  );
}

export function CollectionCard({ name, count, tone }: { name: string; count: string; tone: CollectionTone }) {
  return (
    <GlassCard className={cx("p-4", collectionStyles[tone])}>
      <div className="flex min-h-[92px] flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-semibold tracking-[-0.02em] text-white">{name}</p>
            <p className="mt-1 text-[13px] text-white/55">{count}</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/10 bg-white/8 text-[18px] text-white/82">
            {name.slice(0, 1)}
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/8">
          <div className="h-full w-[62%] rounded-full bg-white/34" />
        </div>
      </div>
    </GlassCard>
  );
}

export function SearchPill({ children }: { children: ReactNode }) {
  return (
    <button type="button" className="inline-flex min-h-12 items-center rounded-full border border-white/10 bg-white/6 px-4 text-[13px] font-medium text-white/76 transition active:scale-[0.98]">
      {children}
    </button>
  );
}


