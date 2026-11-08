"use client"

import { InlineText } from "@/components/inline-edit"
import { ManageMenu } from "@/components/manage-menu"

import { removeMember, renameMember } from "./actions"

export function MemberName({ id, name }: { id: string; name: string | null }) {
  return <InlineText label="Name" value={name} placeholder="Add name" onSave={(next) => renameMember({ id, name: next })} />
}

export function MemberMenu({ id, email }: { id: string; email: string }) {
  return (
    <ManageMenu
      label={`Manage ${email}`}
      actions={[
        {
          label: "Remove from team",
          title: `Remove ${email}?`,
          description: "They won't be able to sign in any more. You can invite them again later.",
          destructive: true,
          success: "Removed from the team",
          run: () => removeMember(id),
        },
      ]}
    />
  )
}
