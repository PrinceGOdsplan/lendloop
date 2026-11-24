"use client";

import { usePreloadedQuery, useQuery, type Preloaded } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/format";
import { EmptyState, Loading, Pill } from "./ui";

type Tools = (typeof api.tools.listPublic)["_returnType"];

/**
 * Anonymous list: the Convex query itself returns only name + category.
 * Server-rendered via preloadQuery (fast first paint, no wait for Clerk to load),
 * then kept live by the Convex client.
 */
export function PublicToolList({ preloaded }: { preloaded: Preloaded<typeof api.tools.listPublic> | null }) {
  return preloaded ? <Live preloaded={preloaded} /> : <ClientOnly />;
}

function Live({ preloaded }: { preloaded: Preloaded<typeof api.tools.listPublic> }) {
  return <ToolGrid tools={usePreloadedQuery(preloaded)} />;
}

function ClientOnly() {
  return <ToolGrid tools={useQuery(api.tools.listPublic)} />;
}

function ToolGrid({ tools }: { tools: Tools | undefined }) {
  if (tools === undefined) return <Loading />;
  if (tools.length === 0) {
    return <EmptyState title="No tools available right now">Be the first neighbour to lend something.</EmptyState>;
  }
  return (
    <>
      <h2 className="mb-5 text-lg font-semibold">{tools.length} tools ready to borrow</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool, i) => (
          <li
            key={`${tool.name}-${i}`}
            className="flex items-center justify-between gap-3 rounded-card border border-line bg-white px-4 py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-semibold text-brand"
              >
                {tool.name[0]}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{tool.name}</h3>
                <p className="mt-1 text-xs text-muted">{CATEGORY_LABELS[tool.category]}</p>
              </div>
            </div>
            <Pill tone="green">● Free today</Pill>
          </li>
        ))}
      </ul>
    </>
  );
}
