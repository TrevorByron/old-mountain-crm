"use client"

import { InlineText } from "@/components/inline-edit"
import { ManageMenu } from "@/components/manage-menu"

import { deleteSegment, saveSegment } from "./actions"

export function SegmentRowDescription({ id, name, description, rules }: { id: string; name: string; description: string | null; rules: unknown }) {
  return (
    <div className="relative z-10">
      <InlineText
        label={`Description of ${name}`}
        value={description}
        placeholder="Add a description"
        className="text-muted-foreground"
        onSave={(next) => saveSegment({ id, name, description: next, rules })}
      />
    </div>
  )
}

export function SegmentRowMenu({ id, name }: { id: string; name: string }) {
  return (
    <ManageMenu
      label={`Manage ${name}`}
      actions={[
        {
          label: "Remove segment",
          title: `Remove ${name}?`,
          description: "Nobody is unsubscribed or removed from Airtable. Scheduled campaigns using this segment will skip it.",
          destructive: true,
          success: "Segment removed",
          run: () => deleteSegment(id),
        },
      ]}
    />
  )
}
