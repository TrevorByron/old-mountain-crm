"use client"

import { PencilIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import { SubscriberSheet } from "../subscriber-sheet"
import type { Subscriber } from "../subscriber-table"

export function EditPerson({ person, statuses }: { person: Subscriber; statuses: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" />
        Edit
      </Button>
      <SubscriberSheet subscriber={open ? person : null} statuses={statuses} onClose={() => setOpen(false)} />
    </>
  )
}
