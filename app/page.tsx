import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/Logo";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { PublicToolList } from "@/components/PublicToolList";

async function preloadPublicTools() {
  try {
    return await preloadQuery(api.tools.listPublic);
  } catch (err) {
    console.error("Could not preload public tools; falling back to client fetch", err);
    return null;
  }
}

export default async function HomePage() {
  const preloaded = await preloadPublicTools();
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <Link href="/tools" className="text-sm font-medium text-emerald-800 hover:underline">
              Open the board →
            </Link>
            <UserButton />
          </div>
        </Show>
      </header>

      <section className="py-14 text-center sm:py-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">LendLoop</h1>
        <p className="mt-4 text-lg text-stone-600">Borrow what you need. Lend what you don’t.</p>
        <div className="mt-8 flex justify-center">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/tools">
              <button className="rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/tools"
              className="rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              Go to the tool board
            </Link>
          </Show>
        </div>
      </section>

      <section className="pb-20">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Available now</h2>
        <PublicToolList preloaded={preloaded} />
      </section>

      <footer className="border-t border-stone-200 py-6 text-xs text-stone-500">
        LendLoop is a demo take-home project. Owner details are only visible to signed-in neighbours.
      </footer>
    </div>
  );
}
