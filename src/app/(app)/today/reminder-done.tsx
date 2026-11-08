"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

import { updateProfile } from "../subscribers/actions"

export function ReminderDone({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      className="relative z-10"
      aria-label={`Mark reminder for ${name} done`}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateProfile({ id, follow_up_on: null, follow_up_note: null })
          if (!result.ok) toast.error(result.error)
        })
      }
    >
      Done
    </Button>
  )
}
