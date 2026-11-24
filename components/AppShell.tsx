"use client";

import { UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { todayUtc } from "@/convex/lib/rules";
import { Logo } from "./Logo";
import { Toaster } from "./Toaster";
import { Loading, Pill, Skeleton, TrustedBadge } from "./ui";

const icon = {
  tools: "M4 7h16M4 12h16M4 17h10",
  listings: "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z",
  requests: "M7 17 17 7M9 7h8v8",
  incoming: "M17 7 7 17M15 17H7V9",
  admin: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z",
};

type NavLink = { href: string; label: string; short?: string; icon: string };

const links: NavLink[] = [
  { href: "/tools", label: "Tools", icon: icon.tools },
  { href: "/my-listings", label: "My listings", short: "Listings", icon: icon.listings },
  { href: "/my-requests", label: "My requests", short: "Requests", icon: icon.requests },
  { href: "/incoming", label: "Incoming", icon: icon.incoming },
];
const adminLink: NavLink = { href: "/admin", label: "Admin", icon: icon.admin };

/** Upserts the Convex `users` row for the signed-in Clerk user before rendering the app. */
function useStoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store({})
      .then(() => !cancelled && setReady(true))
      .catch((err) => console.error("Could not sync user", err));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);
  return ready;
}

function HeaderFrame({ right, nav }: { right?: ReactNode; nav?: ReactNode }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3 text-sm">{right}</div>
      </div>
      <div className="mx-auto hidden max-w-5xl px-2 sm:px-4 md:block">{nav ?? <div className="h-10" />}</div>
    </header>
  );
}

function SkeletonHeader() {
  return (
    <HeaderFrame
      right={<Skeleton className="h-7 w-7 rounded-full" />}
      nav={
        <div className="flex h-10 items-center gap-6 px-3" aria-hidden>
          {[56, 80, 84, 64].map((w) => (
            <div key={w} style={{ width: w }}>
              <Skeleton className="h-3" />
            </div>
          ))}
        </div>
      }
    />
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function Nav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const incoming = useQuery(api.requests.incoming);
  const today = todayUtc();
  const waiting = incoming?.filter((r) => r.status === "pending" && r.endDate >= today).length ?? 0;
  const all = me?.role === "admin" ? [...links, adminLink] : links;
  const badge = (href: string) =>
    href === "/incoming" && waiting > 0 ? (
      <span
        aria-label={`${waiting} waiting`}
        className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-overdue px-1 text-[11px] font-semibold text-white"
      >
        {waiting}
      </span>
    ) : null;
  return (
    <>
      <HeaderFrame
        right={
          <>
            {me?.trustedLender && <TrustedBadge />}
            {me?.role === "admin" && <Pill tone="stone">Admin</Pill>}
            <UserButton />
          </>
        }
        nav={
          <nav aria-label="Main" className="flex gap-1">
            {all.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
                    active
                      ? "border-brand font-semibold text-brand-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                  {badge(l.href)}
                </Link>
              );
            })}
          </nav>
        }
      />
      <nav
        aria-label="Main"
        className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden ${
          all.length === 5 ? "grid-cols-5" : "grid-cols-4"
        }`}
      >
        {all.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-[68px] flex-col items-center justify-center gap-1 text-[11.5px] ${
                active ? "font-semibold text-brand-ink" : "text-muted"
              }`}
            >
              <Icon d={l.icon} />
              {l.short ?? l.label}
              {waiting > 0 && l.href === "/incoming" && (
                <span
                  aria-label={`${waiting} waiting`}
                  className="absolute left-1/2 top-2 ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-overdue px-1 text-[11px] font-semibold text-white"
                >
                  {waiting}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Main({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 md:pb-10">
      {children}
    </main>
  );
}

function SyncedApp({ children }: { children: ReactNode }) {
  const ready = useStoreUser();
  if (!ready) {
    return (
      <>
        <SkeletonHeader />
        <Main>
          <Loading />
        </Main>
      </>
    );
  }
  return (
    <>
      <Nav />
      <Main>{children}</Main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Toaster>
      <a
        href="#main"
        className="sr-only rounded bg-white px-3 py-2 focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50"
      >
        Skip to content
      </a>
      <AuthLoading>
        <SkeletonHeader />
        <Main>
          <Loading />
        </Main>
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-[15px] text-muted">
          <p>We couldn’t confirm your session. Sign in again.</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center rounded-control bg-brand px-4 font-semibold text-white"
          >
            Back to the home page
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <SyncedApp>{children}</SyncedApp>
      </Authenticated>
    </Toaster>
  );
}
