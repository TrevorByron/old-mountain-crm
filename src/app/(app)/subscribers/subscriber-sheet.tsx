"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { markUnsubscribed, updateSubscriber } from "./actions"
import { fullName, type Subscriber } from "./subscriber-table"

export function SubscriberSheet({
  subscriber,
  statuses,
  onClose,
}: {
  subscriber: Subscriber | null
  statuses: string[]
  onClose: () => void
}) {
  return (
    <Sheet open={subscriber !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {subscriber && (
          <SubscriberForm key={subscriber.id} subscriber={subscriber} statuses={statuses} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function Detail({ label, value, badges = [] }: { label: string; value?: string | null; badges?: string[] }) {
  if (!value && badges.length === 0) return null
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
        </div>
      )}
      {value && <span className="whitespace-pre-wrap">{value}</span>}
    </div>
  )
}

function AirtableDetails({ subscriber }: { subscriber: Subscriber }) {
  return (
    <FieldSet>
      <FieldLegend>From Airtable</FieldLegend>
      <div className="flex flex-col gap-3">
        <Detail label="What excites them" value={subscriber.interests_other} badges={subscriber.interests} />
        <Detail label="Trip type" value={subscriber.trip_type} />
        <Detail label="Departure window" value={subscriber.departure_window} />
        <Detail label="Group size" value={subscriber.group_size} />
        <Detail label="Objections" value={subscriber.objections_other} badges={subscriber.objections} />
        <Detail label="Segments" badges={subscriber.segments} />
        <Detail label="Heard about us" value={subscriber.source} />
        <Detail label="Account owner" value={subscriber.account_owner} />
        <Detail label="Phone" value={subscriber.phone} />
      </div>
    </FieldSet>
  )
}

function SubscriberForm({
  subscriber,
  statuses,
  onClose,
}: {
  subscriber: Subscriber
  statuses: string[]
  onClose: () => void
}) {
  const [status, setStatus] = useState<string | null>(subscriber.status)
  const [isPending, startTransition] = useTransition()
  const optedOut = Boolean(subscriber.unsubscribed_at) || subscriber.suppressed

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateSubscriber({
        id: subscriber.id,
        email: formData.get("email"),
        first_name: formData.get("first_name"),
        last_name: formData.get("last_name"),
        country: formData.get("country"),
        status,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Subscriber saved", { description: result.warning })
      onClose()
    })
  }

  function unsubscribe() {
    startTransition(async () => {
      const result = await markUnsubscribed(subscriber.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Unsubscribed")
      onClose()
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{fullName(subscriber) || subscriber.email}</SheetTitle>
        <SheetDescription>Changes to name, email and status also update Airtable.</SheetDescription>
      </SheetHeader>
      <form action={save} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        {optedOut && (
          <Alert>
            <AlertDescription>
              {subscriber.suppressed
                ? `Suppressed (${subscriber.suppressed_reason?.replace("_", " ")}). They won't receive email.`
                : "Unsubscribed. They won't receive email, and syncs or signups can't re-subscribe them."}
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input id="first_name" name="first_name" defaultValue={subscriber.first_name ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input id="last_name" name="last_name" defaultValue={subscriber.last_name ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required defaultValue={subscriber.email} />
          </Field>
          <Field>
            <FieldLabel htmlFor="status">Status</FieldLabel>
            <Select
              items={statuses.map((value) => ({ label: value, value }))}
              value={status}
              onValueChange={setStatus}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="No status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <Input id="country" name="country" defaultValue={subscriber.country ?? ""} />
          </Field>
        </FieldGroup>
        <AirtableDetails subscriber={subscriber} />
        <SheetFooter className="mt-auto px-0">
          <Button type="submit" disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            Save changes
          </Button>
          {!subscriber.unsubscribed_at && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={isPending} />}>
                Unsubscribe
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unsubscribe {subscriber.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They&apos;ll stop receiving email right away. This can&apos;t be undone from the app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={unsubscribe}>
                    Unsubscribe
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </form>
    </>
  )
}
