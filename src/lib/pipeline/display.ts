import { formatMoney, itineraryLabel, paymentKindLabel, stageLabel } from "./stages"

export type PersonName = { first_name: string | null; last_name: string | null; email: string | null }

export const personName = (person: PersonName) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "No name"

export type ActivityRow = {
  id: string
  kind: string
  body: string | null
  meta: Record<string, unknown> | null
  author: string | null
  occurred_at: string
}

const NOTE_LABELS: Record<string, string> = { note: "Note", call: "Call", email: "Email", meeting: "Meeting" }

// The line a log entry shows on a timeline.
export function describeActivity(activity: Pick<ActivityRow, "kind" | "body" | "meta">) {
  const meta = activity.meta ?? {}
  switch (activity.kind) {
    case "plan":
      return { title: `Trip plan started at ${stageLabel(String(meta.stage ?? "talking"))}`, detail: null }
    case "stage":
      return { title: `${stageLabel(String(meta.from))} → ${stageLabel(String(meta.to))}`, detail: null }
    case "itinerary":
      return { title: `Itinerary: ${itineraryLabel(String(meta.from))} → ${itineraryLabel(String(meta.to))}`, detail: null }
    case "payment": {
      const label = `${paymentKindLabel(String(meta.kind))} of ${formatMoney(meta.amount as number)}`
      const prefix = meta.action === "removed" ? "Removed: " : meta.action === "edited" ? "Changed to: " : ""
      return { title: `${prefix}${label}`, detail: null }
    }
    case "prep":
      return { title: activity.body ?? "Trip prep updated", detail: null }
    default:
      return { title: NOTE_LABELS[activity.kind] ?? "Note", detail: activity.body }
  }
}

export type TimelineEntry = {
  id: string
  when: string
  title: string
  detail: string | null
  author: string | null
  href?: string
  deletable?: boolean
}

export function sortTimeline(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => b.when.localeCompare(a.when))
}

// The columns every screen that shows a trip plan needs, so they can't disagree.
export const PLAN_COLUMNS =
  "id, trip_id, stage, owner, next_step, next_step_due, itinerary_status, itinerary_url, closed_reason, agreed_total, deposit_amount, deposit_due_on, balance_due_on, prep_done, created_at, updated_at, trips (id, name, kind, starts_on, ends_on), trip_plan_travelers (is_lead, subscribers (id, first_name, last_name, email)), payments (id, kind, amount, paid_on, method, note, recorded_by)"

export type PlanPayment = {
  id: string
  kind: string
  amount: number
  paid_on: string
  method: string | null
  note: string | null
  recorded_by: string | null
}

export type PlanRow = {
  id: string
  trip_id: string | null
  stage: string
  owner: string | null
  next_step: string | null
  next_step_due: string | null
  itinerary_status: string
  itinerary_url: string | null
  closed_reason: string | null
  agreed_total: number | null
  deposit_amount: number | null
  deposit_due_on: string | null
  balance_due_on: string | null
  prep_done: string[]
  created_at: string
  updated_at: string
  trips: { id: string; name: string; kind: string; starts_on: string | null; ends_on: string | null } | null
  trip_plan_travelers: { is_lead: boolean; subscribers: PersonName & { id: string } }[]
  payments: PlanPayment[]
}

export function planTitle(plan: Pick<PlanRow, "trip_plan_travelers">) {
  const travelers = [...plan.trip_plan_travelers].sort((a, b) => Number(b.is_lead) - Number(a.is_lead))
  if (travelers.length === 0) return "No travelers yet"
  const first = personName(travelers[0].subscribers)
  return travelers.length === 1 ? first : `${first} + ${travelers.length - 1}`
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
export const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : "-")
