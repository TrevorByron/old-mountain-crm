"use client"

import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PersonPicker, type PersonOption } from "@/components/person-picker"
import { SimpleSelect } from "@/components/simple-select"
import { Fab } from "@/components/fab"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STAGES, stageLabel } from "@/lib/pipeline/stages"

import { createPlan, createPlanForNewPerson } from "../pipeline/actions"

const STAGE_ITEMS = STAGES.filter((item) => item.key !== "not_this_time").map((item) => ({ value: item.key, label: item.label }))

// Rendered inside the dialog, so it starts fresh each time it opens.
function AddToTripForm({ tripId, people, onDone }: { tripId: string; people: PersonOption[]; onDone: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState("list")
  const [person, setPerson] = useState<string | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [stage, setStage] = useState("talking")
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result =
        tab === "list"
          ? await createPlan({ subscriberId: person, tripId, stage })
          : await createPlanForNewPerson({ tripId, firstName, lastName, stage })
      if (!result.ok) {
        const existing = "existingId" in result ? result.existingId : null
        toast.error(result.error, existing ? { action: { label: "Open it", onClick: () => router.push(`/pipeline/${existing}`) } } : undefined)
        return
      }
      toast.success(`Added at ${stageLabel(stage)}`)
      onDone()
    })
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">From your list</TabsTrigger>
          <TabsTrigger value="new">Someone new</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="pt-3">
          <PersonPicker id="trip-person" people={people} value={person} onChange={setPerson} />
        </TabsContent>
        <TabsContent value="new" className="pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="First name" placeholder="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            <Input aria-label="Last name" placeholder="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </div>
        </TabsContent>
      </Tabs>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="trip-stage">Stage</FieldLabel>
          <SimpleSelect id="trip-stage" items={STAGE_ITEMS} value={stage} onChange={setStage} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button onClick={submit} disabled={isPending || (tab === "list" ? !person : !firstName.trim())}>
          {isPending && <Spinner data-icon="inline-start" />}
          Add to trip
        </Button>
      </DialogFooter>
    </>
  )
}

export function AddToTripDialog({ tripId, tripName, people, fab = false }: { tripId: string; tripName: string; people: PersonOption[]; fab?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={fab ? <Fab aria-label="Add person" /> : <Button />}>{fab ? <PlusIcon /> : <><PlusIcon data-icon="inline-start" />Add person</>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add someone to {tripName}</DialogTitle>
          <DialogDescription>They start with this trip&apos;s price and terms.</DialogDescription>
        </DialogHeader>
        <AddToTripForm tripId={tripId} people={people} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
