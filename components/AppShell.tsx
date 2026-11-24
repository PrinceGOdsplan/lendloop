"use client";

import { UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Logo } from "./Logo";
import { Loading, TrustedBadge } from "./ui";

const links = [
  { href: "/tools", label: "All tools" },
  { href: "/my-listings", label: "My listings" },
  { href: "/my-requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

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

function Nav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const all = me?.role === "admin" ? [...links, { href: "/admin", label: "Admin" }] : links;
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          {me?.trustedLender && <TrustedBadge />}
          {me?.role === "admin" && <span className="text-xs font-medium text-stone-500">admin</span>}
          <UserButton />
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 sm:px-4">
        {all.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                active ? "border-emerald-700 font-medium text-emerald-800" : "border-transparent text-stone-600 hover:text-stone-900"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function SyncedApp({ children }: { children: ReactNode }) {
  const ready = useStoreUser();
  if (!ready) return <Loading />;
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-sm text-stone-600">
          Your session could not be verified with the backend.{" "}
          <Link href="/" className="text-emerald-800 underline">
            Back to the home page
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        <SyncedApp>{children}</SyncedApp>
      </Authenticated>
    </>
  );
}
