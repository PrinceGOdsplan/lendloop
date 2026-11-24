"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ToolForm } from "@/components/ToolForm";
import { Button, Card, EmptyState, ErrorText, Loading, PageHeader, Pill } from "@/components/ui";
import { CATEGORY_LABELS, CONDITION_LABELS, errorMessage } from "@/lib/format";

export default function MyListingsPage() {
  const tools = useQuery(api.tools.myListings);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function del(toolId: Id<"tools">, name: string) {
    if (!confirm(`Delete “${name}”? Pending requests will be declined.`)) return;
    setError(null);
    try {
      await remove({ toolId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="My listings" subtitle="Tools you’re willing to lend." />

      <Card className="mb-8">
        <h2 className="mb-4 font-medium">List a tool</h2>
        <ToolForm submitLabel="Add listing" onSubmit={(input) => create(input)} />
      </Card>

      <ErrorText message={error} />
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven’t listed anything yet">Add your first tool above.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card>
                {editing === tool._id ? (
                  <ToolForm
                    initial={{ name: tool.name, category: tool.category, condition: tool.condition, description: tool.description }}
                    submitLabel="Save changes"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (input) => {
                      await update({ toolId: tool._id, ...input });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{tool.name}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                      </p>
                      <p className="mt-2 text-sm text-stone-700">{tool.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.available ? <Pill tone="green">Available</Pill> : <Pill tone="amber">On loan</Pill>}
                      <Button variant="secondary" onClick={() => setEditing(tool._id)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => del(tool._id, tool.name)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
