export const STAGES = [
  { key: "talking", label: "Talking" },
  { key: "planning", label: "Planning" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "committed", label: "Committed" },
  { key: "ready", label: "Ready to travel" },
  { key: "on_trip", label: "On trip" },
  { key: "traveled", label: "Traveled" },
  { key: "not_this_time", label: "Not this time" },
] as const

export type StageKey = (typeof STAGES)[number]["key"]
export const STAGE_KEYS = STAGES.map((stage) => stage.key) as [StageKey, ...StageKey[]]
export const stageLabel = (key: string) => STAGES.find((stage) => stage.key === key)?.label ?? key

export const isOpenStage = (stage: string) => stage !== "traveled" && stage !== "not_this_time"
// Holding a seat: they've said yes and the trip hasn't been lost.
export const holdsSeat = (stage: string) => ["committed", "ready", "on_trip", "traveled"].includes(stage)
const isCommitted = (stage: string) => ["committed", "ready", "on_trip"].includes(stage)
// Still deciding. A deposit moves a plan out of these.
export const EARLY_STAGES = ["talking", "planning", "proposal_sent"]
export const isEarlyStage = (stage: string) => EARLY_STAGES.includes(stage)

export type NextMove = { kind: "deposit"; label: string } | { kind: "stage"; stage: StageKey; label: string }

// The one thing that usually happens next. The stage tracker still allows skipping or going back.
export function nextMove(stage: string, paid: number): NextMove | null {
  const deposit: NextMove = { kind: "deposit", label: "Record a deposit" }
  switch (stage) {
    case "talking":
      return { kind: "stage", stage: "planning", label: "Move to Planning" }
    case "planning":
      return { kind: "stage", stage: "proposal_sent", label: "Mark proposal sent" }
    case "proposal_sent":
      return deposit
    case "committed":
      return paid > 0 ? { kind: "stage", stage: "ready", label: "Move to Ready to travel" } : deposit
    case "ready":
      return { kind: "stage", stage: "on_trip", label: "Mark as on trip" }
    case "on_trip":
      return { kind: "stage", stage: "traveled", label: "Mark as traveled" }
    default:
      return null
  }
}

export const LIFECYCLES = [
  { key: "subscriber", label: "Subscriber" },
  { key: "prospect", label: "Prospect" },
  { key: "customer", label: "Customer" },
  { key: "past_guest", label: "Past guest" },
] as const

export const lifecycleLabel = (key: string) => LIFECYCLES.find((item) => item.key === key)?.label ?? key

export const ITINERARY_STATUSES = [
  { key: "not_started", label: "Not started" },
  { key: "drafting", label: "Drafting" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
] as const

export type ItineraryKey = (typeof ITINERARY_STATUSES)[number]["key"]
export const ITINERARY_KEYS = ITINERARY_STATUSES.map((item) => item.key) as [ItineraryKey, ...ItineraryKey[]]
export const itineraryLabel = (key: string) => ITINERARY_STATUSES.find((item) => item.key === key)?.label ?? key

export const PREP_ITEMS = [
  { key: "guest_form", label: "Guest form received" },
  { key: "passport_checked", label: "Passport validity checked" },
  { key: "visa", label: "Visa sorted" },
  { key: "insurance", label: "Travel insurance confirmed" },
  { key: "flights", label: "Flight details received" },
  { key: "dietary_medical", label: "Dietary and medical needs noted" },
  { key: "emergency_contact", label: "Emergency contact received" },
] as const

export const PREP_KEYS = PREP_ITEMS.map((item) => item.key)

export const PAYMENT_KINDS = [
  { key: "deposit", label: "Deposit" },
  { key: "balance", label: "Balance" },
  { key: "other", label: "Other payment" },
  { key: "refund", label: "Refund" },
] as const

export type PaymentKind = (typeof PAYMENT_KINDS)[number]["key"]
export const PAYMENT_KIND_KEYS = PAYMENT_KINDS.map((item) => item.key) as [PaymentKind, ...PaymentKind[]]
export const paymentKindLabel = (key: string) => PAYMENT_KINDS.find((item) => item.key === key)?.label ?? key

export const OWNERS = ["Jesse", "Trevor", "Heather"]

export function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "")
  if (!cleaned) return null
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : Number.NaN
}

const toCents = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100)

export type PaymentRow = { kind: string; amount: number | string }
export type PaymentTerms = {
  agreed_total: number | string | null
  deposit_amount: number | string | null
  deposit_due_on: string | null
  balance_due_on: string | null
}

export type PaymentStatus = "no_total" | "not_paid" | "deposit_paid" | "paid_in_full" | "overpaid"

export type PaymentSummary = {
  paid: number
  balance: number | null
  status: PaymentStatus
  overdue: "deposit" | "balance" | null
}

// Worked in cents so that repeated dollar-and-cent amounts can't drift. Dates are YYYY-MM-DD.
export function summarizePayments(terms: PaymentTerms, payments: PaymentRow[], today: string): PaymentSummary {
  const paidCents = payments.reduce((sum, payment) => sum + (payment.kind === "refund" ? -1 : 1) * toCents(payment.amount), 0)
  const totalCents = terms.agreed_total === null || terms.agreed_total === "" ? null : toCents(terms.agreed_total)
  const depositCents = toCents(terms.deposit_amount)
  const paid = paidCents / 100

  if (totalCents === null) {
    return { paid, balance: null, status: paidCents > 0 ? "deposit_paid" : "no_total", overdue: null }
  }

  const depositMet = depositCents > 0 ? paidCents >= depositCents : paidCents > 0
  const fullyPaid = totalCents > 0 && paidCents >= totalCents
  const status: PaymentStatus =
    paidCents > totalCents && totalCents > 0
      ? "overpaid"
      : fullyPaid
        ? "paid_in_full"
        : paidCents > 0
          ? "deposit_paid"
          : "not_paid"

  let overdue: PaymentSummary["overdue"] = null
  if (!fullyPaid) {
    if (terms.balance_due_on && terms.balance_due_on < today) overdue = "balance"
    else if (!depositMet && terms.deposit_due_on && terms.deposit_due_on < today) overdue = "deposit"
  }

  return { paid, balance: (totalCents - paidCents) / 100, status, overdue }
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  no_total: "No total set",
  not_paid: "Not paid",
  deposit_paid: "Part paid",
  paid_in_full: "Paid in full",
  overpaid: "Overpaid",
}

const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const withCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

export function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "-"
  const amount = Number(value)
  return (Number.isInteger(amount) ? wholeDollars : withCents).format(amount)
}

export const seatsTaken = (plans: { stage: string; travelers: number }[]) =>
  plans.filter((plan) => holdsSeat(plan.stage)).reduce((sum, plan) => sum + plan.travelers, 0)

export function prepProgress(done: string[]) {
  return { done: PREP_KEYS.filter((key) => done.includes(key)).length, total: PREP_KEYS.length }
}

const PREP_WARNING_DAYS = 60

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export type AttentionInput = PaymentTerms & {
  stage: string
  next_step: string | null
  next_step_due: string | null
  itinerary_status: string
  prep_done: string[]
  trip: { kind: string; starts_on: string | null } | null
  payments: PaymentRow[]
}

export type AttentionReason = { severity: "overdue" | "soon" | "missing"; message: string }

// Why a trip plan needs someone's eye today. Most urgent first; an empty list means it's fine.
export function planAttention(plan: AttentionInput, today: string): AttentionReason[] {
  const reasons: AttentionReason[] = []
  if (!isOpenStage(plan.stage)) return reasons

  const payments = summarizePayments(plan, plan.payments, today)
  if (isCommitted(plan.stage)) {
    if (payments.overdue === "balance") reasons.push({ severity: "overdue", message: "Balance is past due" })
    if (payments.overdue === "deposit") reasons.push({ severity: "overdue", message: "Deposit is past due" })
    if (payments.status === "no_total") reasons.push({ severity: "missing", message: "Committed with no agreed total" })
  }

  if (plan.next_step_due && plan.next_step_due < today) {
    reasons.push({ severity: "overdue", message: `Next step is overdue: ${plan.next_step ?? "no details"}` })
  } else if (plan.next_step_due && plan.next_step_due === today) {
    reasons.push({ severity: "soon", message: `Due today: ${plan.next_step ?? "no details"}` })
  } else if (!plan.next_step) {
    reasons.push({ severity: "missing", message: "No next step" })
  }

  if (isCommitted(plan.stage) && plan.trip?.starts_on) {
    const days = daysBetween(today, plan.trip.starts_on)
    if (days >= 0 && days <= PREP_WARNING_DAYS) {
      const { done, total } = prepProgress(plan.prep_done)
      if (done < total) reasons.push({ severity: "soon", message: `Departs in ${days} days, prep is ${done} of ${total}` })
      if (plan.trip.kind === "custom" && plan.itinerary_status !== "approved") {
        reasons.push({ severity: "soon", message: `Departs in ${days} days, itinerary isn't approved` })
      }
    }
  }

  const order = { overdue: 0, soon: 1, missing: 2 }
  return reasons.sort((a, b) => order[a.severity] - order[b.severity])
}
