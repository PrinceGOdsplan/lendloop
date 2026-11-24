"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ToolForm } from "@/components/ToolForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toaster";
import { Button, Card, EmptyState, ErrorText, Loading, PageHeader, Pill } from "@/components/ui";
import { CATEGORY_LABELS, CONDITION_LABELS, errorMessage } from "@/lib/format";

export default function MyListingsPage() {
  const tools = useQuery(api.tools.myListings);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: Id<"tools">; name: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const toast = useToast();
  const hasListings = (tools?.length ?? 0) > 0;

  async function del(toolId: Id<"tools">) {
    setError(null);
    try {
      await remove({ toolId });
      toast("Listing deleted.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="My listings" subtitle="Tools you lend to neighbours.">
        {hasListings && !formOpen && (
          <Button className="md:hidden" onClick={() => setFormOpen(true)}>
            + List a tool
          </Button>
        )}
      </PageHeader>

      <Card className={`mb-8 ${hasListings && !formOpen ? "hidden md:block" : ""}`}>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">List a tool</h2>
        <ToolForm
          submitLabel="Add listing"
          onSubmit={async (input) => {
            await create(input);
            toast("Listing added.");
            setFormOpen(false);
          }}
        />
      </Card>

      <ErrorText message={error} />
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven’t listed anything yet">Add your first tool above.</EmptyState>
      ) : (
        <ul className="space-y-3.5">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card>
                {editing === tool._id ? (
                  <ToolForm
                    initial={{
                      name: tool.name,
                      category: tool.category,
                      condition: tool.condition,
                      description: tool.description,
                    }}
                    submitLabel="Save changes"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (input) => {
                      await update({ toolId: tool._id, ...input });
                      setEditing(null);
                      toast("Changes saved.");
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-semibold">{tool.name}</h3>
                      <p className="mt-1 text-[13px] text-muted">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                      </p>
                      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{tool.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.available ? (
                        <Pill tone="green">
                          <span aria-hidden>●</span> Available
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          <span aria-hidden>●</span> On loan
                        </Pill>
                      )}
                      <Button variant="secondary" onClick={() => setEditing(tool._id)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => setDeleting({ id: tool._id, name: tool.name })}>
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
      <ConfirmDialog
        open={deleting !== null}
        title={`Remove ${deleting?.name ?? "listing"}?`}
        confirmLabel="Remove listing"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del(deleting.id)}
      >
        Pending requests on it will be declined.
      </ConfirmDialog>
    </>
  );
}
