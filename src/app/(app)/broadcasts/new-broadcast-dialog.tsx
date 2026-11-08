"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LAYOUTS, type LayoutKey } from "@/lib/broadcasts/content"

import { createBroadcast } from "./actions"

export function NewBroadcastDialog() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function create(layout: LayoutKey) {
    startTransition(async () => {
      const result = await createBroadcast(layout)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/broadcasts/${result.id}`)
    })
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>New broadcast</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>You can switch layouts while you write.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {LAYOUTS.map((layout) => (
            <Button
              key={layout.key}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
              disabled={isPending}
              onClick={() => create(layout.key)}
            >
              <span className="font-medium">{layout.name}</span>
              <span className="font-normal text-muted-foreground">{layout.description}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
