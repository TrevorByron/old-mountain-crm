"use client"

import { Trash2Icon } from "lucide-react"
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
import { LAYOUTS } from "@/lib/broadcasts/content"

import { createBroadcast, deleteTemplate } from "./actions"

export type TemplateOption = { id: string; name: string; layout_key: string }

export function NewBroadcastDialog({
  templates,
  segmentId = null,
  label = "New campaign",
}: {
  templates: TemplateOption[]
  segmentId?: string | null
  label?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const custom = templates.filter((template) => template.layout_key === "custom")

  function create(id: string) {
    startTransition(async () => {
      const result = await createBroadcast({ templateId: id, segmentId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/broadcasts/${result.id}`)
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTemplate(id)
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })
  }

  const option = (id: string, name: string, description: string) => (
    <Button
      variant="outline"
      className="h-auto flex-1 flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
      disabled={isPending}
      onClick={() => create(id)}
    >
      <span className="font-medium">{name}</span>
      <span className="font-normal text-muted-foreground">{description}</span>
    </Button>
  )

  return (
    <Dialog>
      <DialogTrigger render={<Button />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>Every block can be changed, moved or removed once you&apos;re in.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {LAYOUTS.flatMap((layout) => {
            const template = templates.find((item) => item.layout_key === layout.key)
            return template ? [<div key={layout.key} className="flex">{option(template.id, layout.name, layout.description)}</div>] : []
          })}
          {custom.map((template) => (
            <div key={template.id} className="flex items-center gap-2">
              {option(template.id, template.name, "Saved template")}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete template ${template.name}`}
                disabled={isPending}
                onClick={() => remove(template.id)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
