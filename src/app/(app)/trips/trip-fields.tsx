"use client"

import { InlineMoney, InlineSelect, InlineText } from "@/components/inline-edit"
import { ManageMenu } from "@/components/manage-menu"

import { deleteTrip, resetTrip, updateTrip } from "./actions"

export type TripFields = {
  id: string
  name: string
  kind: string
  starts_on: string | null
  ends_on: string | null
  seats: number | null
  price_per_person: number | null
  deposit_per_person: number | null
  balance_due_on: string | null
  notes: string | null
  archived: boolean
}

const KINDS = [
  { value: "group", label: "Group departure" },
  { value: "custom", label: "Custom safari" },
]

export function TripMenu({ trip, leaveTo }: { trip: Pick<TripFields, "id" | "archived">; leaveTo?: string }) {
  return (
    <ManageMenu
      label="Manage this trip"
      actions={[
        { label: trip.archived ? "Bring back from archive" : "Archive trip", success: trip.archived ? "Back in use" : "Archived", run: () => updateTrip({ id: trip.id, archived: !trip.archived }) },
        {
          label: "Reset details",
          title: "Clear this trip's details?",
          description: "Clears its seats, price, deposit, balance date and notes. The name, dates and everyone on it stay, and existing trip plans keep their own prices.",
          success: "Details cleared",
          run: () => resetTrip(trip.id),
        },
        {
          label: "Remove trip",
          title: "Remove this trip for good?",
          description: "Only works once no trip plans are on it.",
          destructive: true,
          success: "Trip removed",
          redirectTo: leaveTo,
          run: () => deleteTrip(trip.id),
        },
      ]}
    />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function seatsOnSave(id: string) {
  return async (text: string) => {
    if (!text) return updateTrip({ id, seats: null })
    const seats = Number(text)
    if (!Number.isInteger(seats) || seats <= 0) return { ok: false, error: "Seats need to be a whole number above zero." }
    return updateTrip({ id, seats })
  }
}

export function TripName({ trip }: { trip: Pick<TripFields, "id" | "name"> }) {
  return <InlineText label="Trip name" required value={trip.name} className="font-heading text-xl font-semibold" onSave={(name) => updateTrip({ id: trip.id, name })} />
}

export function TripDetails({ trip }: { trip: TripFields }) {
  const save = (fields: Record<string, unknown>) => updateTrip({ id: trip.id, ...fields })
  return (
    <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
      <Row label="Kind">
        <InlineSelect label="Kind" value={trip.kind} items={KINDS} onSave={(kind) => save({ kind })} />
      </Row>
      <Row label="Seats">
        <InlineText label="Seats" value={trip.seats === null ? null : String(trip.seats)} placeholder="Add seats" onSave={seatsOnSave(trip.id)} />
      </Row>
      <Row label="Starts">
        <InlineText label="Starts" type="date" value={trip.starts_on} onSave={(starts_on) => save({ starts_on })} />
      </Row>
      <Row label="Ends">
        <InlineText label="Ends" type="date" value={trip.ends_on} onSave={(ends_on) => save({ ends_on })} />
      </Row>
      <Row label="Price each">
        <InlineMoney label="Price per person" value={trip.price_per_person} onSave={(price_per_person) => save({ price_per_person })} />
      </Row>
      <Row label="Deposit each">
        <InlineMoney label="Deposit per person" value={trip.deposit_per_person} onSave={(deposit_per_person) => save({ deposit_per_person })} />
      </Row>
      <Row label="Balance due">
        <InlineText label="Balance due" type="date" value={trip.balance_due_on} onSave={(balance_due_on) => save({ balance_due_on })} />
      </Row>
      <Row label="Notes">
        <InlineText label="Notes" multiline rows={1} value={trip.notes} placeholder="Add notes" onSave={(notes) => save({ notes })} />
      </Row>
    </div>
  )
}

// A row on the trips list. Dates and seats change right there.
export function TripRowDates({ trip }: { trip: Pick<TripFields, "id" | "starts_on" | "ends_on"> }) {
  const save = (fields: Record<string, unknown>) => updateTrip({ id: trip.id, ...fields })
  return (
    <div className="relative z-10 flex items-center gap-1">
      <InlineText label="Starts" type="date" className="w-auto" value={trip.starts_on} onSave={(starts_on) => save({ starts_on })} />
      <span className="text-muted-foreground">to</span>
      <InlineText label="Ends" type="date" className="w-auto" value={trip.ends_on} onSave={(ends_on) => save({ ends_on })} />
    </div>
  )
}

export function TripRowSeats({ trip }: { trip: Pick<TripFields, "id" | "seats"> }) {
  return (
    <div className="relative z-10 w-16">
      <InlineText label="Seats" value={trip.seats === null ? null : String(trip.seats)} placeholder="Seats" onSave={seatsOnSave(trip.id)} />
    </div>
  )
}
