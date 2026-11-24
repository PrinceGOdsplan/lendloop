import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/Logo";
import { connection } from "next/server";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { PublicToolList } from "@/components/PublicToolList";
import { DemoAccess } from "@/components/DemoAccess";
import { Card, Pill } from "@/components/ui";

async function preloadPublicTools() {
  await connection();
  try {
    return await preloadQuery(api.tools.listPublic);
  } catch (err) {
    console.error("Could not preload public tools; falling back to client fetch", err);
    return null;
  }
}

const steps = [
  ["List a tool", "Name, category, condition. Your neighbours see it straight away."],
  ["Request dates", "Pick a range. Clashes with booked loans are blocked for you."],
  ["Approve and track", "The owner decides. Both sides follow it to return, with reminders."],
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [preloaded, params] = await Promise.all([preloadPublicTools(), searchParams]);
  const count = preloaded ? preloadedQueryResult(preloaded).length : null;
  const demo = Object.hasOwn(params, "demo");
  const button = "inline-flex min-h-10 items-center justify-center rounded-control px-4 py-2 text-sm font-semibold";
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-4 py-5">
        <Logo />
        <nav aria-label="Public" className="hidden gap-6 text-sm text-muted sm:flex">
          <a href="#how">How it works</a>
          <a href="#available">Available now</a>
        </nav>
        <Show when="signed-out">
          <SignInButton mode="modal" forceRedirectUrl="/tools">
            <button className={`${button} border border-field bg-white`}>Sign in</button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <Link href="/tools" className="text-sm font-medium text-brand-ink">
              Open the board →
            </Link>
            <UserButton />
          </div>
        </Show>
      </header>
      <main id="main">
        <section className="grid items-center gap-10 pb-14 pt-10 sm:pt-14 lg:grid-cols-[1.15fr_.85fr] lg:gap-12">
          <div>
            <Pill tone="green">
              ● {count === null ? "Tools free to borrow today" : `${count} tools free to borrow today`}
            </Pill>
            <h1 className="mt-6 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">
              Borrow what you need.
              <br />
              <span className="text-brand">Lend what you don’t.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              A neighbourhood tool library. List a drill, ask for a ladder, and track every loan from request to return.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Show when="signed-out">
                <SignInButton mode="modal" forceRedirectUrl="/tools">
                  <button className={`${button} bg-brand text-white hover:bg-emerald-800`}>
                    Sign in to lend or borrow →
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Link href="/tools" className={`${button} bg-brand text-white`}>
                  Go to the tool board →
                </Link>
              </Show>
              <a href="#how" className={`${button} border border-line bg-white`}>
                See how it works
              </a>
            </div>
          </div>
          {demo ? (
            <DemoAccess />
          ) : (
            <Card>
              <h2 className="text-xl font-semibold">Less buying. More sharing.</h2>
              <ol className="mt-5 space-y-5">
                {steps.map(([title, body], i) => (
                  <li key={title}>
                    <p className="font-semibold">
                      <span className="mr-3 font-mono text-sm text-brand">0{i + 1}</span>
                      {title}
                    </p>
                    <p className="ml-8 mt-1 text-sm text-muted">{body}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </section>
        <section id="how" aria-label="How it works" className="grid scroll-mt-6 gap-4 pb-14 sm:grid-cols-3">
          {steps.map(([title, body], i) => (
            <Card key={title}>
              <p className="font-mono text-xs font-semibold text-brand">0{i + 1}</p>
              <h2 className="mt-3 text-[17px] font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </Card>
          ))}
        </section>
        <section id="available" className="scroll-mt-6 pb-16">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Available now</p>
          <PublicToolList preloaded={preloaded} />
        </section>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-line py-6 text-xs text-muted">
        <p>LendLoop is a take-home demo. Next.js, Clerk, Convex and n8n.</p>
        <a href="https://github.com/PrinceGOdsplan/lendloop" className="underline underline-offset-4">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
