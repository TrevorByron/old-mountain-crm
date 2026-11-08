"use client"

import { useRouter } from "next/navigation"

import { ManageMenu } from "@/components/manage-menu"

import { deleteBroadcast, duplicateBroadcast, resetBroadcast } from "./actions"

export function CampaignRowMenu({ id, name, isDraft }: { id: string; name: string; isDraft: boolean }) {
  const router = useRouter()
  return (
    <ManageMenu
      label={`Manage ${name}`}
      actions={[
        {
          label: "Duplicate",
          success: "Duplicated",
          run: async () => {
            const result = await duplicateBroadcast(id)
            if (result.ok && "id" in result) router.push(`/broadcasts/${result.id}`)
            return result
          },
        },
        {
          label: "Reset to template",
          title: "Start this draft over?",
          description: "Clears your writing and photos and puts the template back.",
          success: "Draft reset",
          hidden: !isDraft,
          run: () => resetBroadcast(id),
        },
        {
          label: "Remove draft",
          title: `Remove ${name}?`,
          description: "Nothing has been sent. This removes the draft for good.",
          destructive: true,
          success: "Draft removed",
          hidden: !isDraft,
          run: () => deleteBroadcast(id),
        },
      ]}
    />
  )
}
