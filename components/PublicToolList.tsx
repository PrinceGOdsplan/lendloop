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
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool, i) => (
        <li key={`${tool.name}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <span className="font-medium">{tool.name}</span>
          <Pill>{CATEGORY_LABELS[tool.category]}</Pill>
        </li>
      ))}
    </ul>
  );
}
