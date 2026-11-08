import { holdsSeat, isOpenStage } from "@/lib/pipeline/stages"

const STAY_IN_TOUCH_DAYS = 180

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

export function parseTags(input: string) {
  return [...new Set(input.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

// The form's answers in a line a person can take in at a glance.
export function tripInterestSummary(person: {
  trip_type: string | null
  departure_window: string | null
  group_size: string | null
}) {
  return [person.trip_type, person.departure_window, person.group_size].filter(Boolean).join(" · ")
}

export type FollowUpState = "none" | "upcoming" | "today" | "overdue"

export function followUpState(on: string | null, today: string): FollowUpState {
  if (!on) return "none"
  if (on < today) return "overdue"
  return on === today ? "today" : "upcoming"
}

export function lastContactLabel(lastTouch: string | null, today: string) {
  if (!lastTouch) return "Never logged"
  const days = daysBetween(lastTouch, today)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 60) return `${days} days ago`
  if (days < 730) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

// Past guests are who you resell to, and nothing else in the app prompts you to call them.
export function needsStayingInTouch(
  person: { lifecycle: string; follow_up_on: string | null; last_touch: string | null },
  today: string
) {
  if (person.lifecycle !== "past_guest" || person.follow_up_on) return false
  return !person.last_touch || daysBetween(person.last_touch, today) >= STAY_IN_TOUCH_DAYS
}

type PlanFacts = { stage: string; next_step: string | null; next_step_due: string | null; trips: { name: string; starts_on: string | null } | null }

// What's going on with them in one place: what's next, and where they've been.
export function journeySummary(plans: PlanFacts[], today: string) {
  const open = plans.filter((plan) => isOpenStage(plan.stage))
  const traveled = plans.filter((plan) => plan.stage === "traveled")
  const upcoming = plans.filter(
    (plan) => holdsSeat(plan.stage) && plan.stage !== "traveled" && (!plan.trips?.starts_on || plan.trips.starts_on >= today)
  )
  const nextStep = open
    .filter((plan) => plan.next_step)
    .sort((a, b) => (a.next_step_due ?? "9999").localeCompare(b.next_step_due ?? "9999"))[0]

  return {
    tripsTaken: traveled.length,
    upcomingTrip: upcoming[0]?.trips?.name ?? null,
    nextStep: nextStep?.next_step ?? null,
    nextStepDue: nextStep?.next_step_due ?? null,
    openPlans: open.length,
  }
}

// People who've traveled together, from the trip plans they share.
export function companions<T extends { id: string }>(
  plans: { trip_plan_travelers: { subscribers: T }[] }[],
  personId: string
) {
  const seen = new Map<string, T>()
  for (const plan of plans) {
    for (const { subscribers: traveler } of plan.trip_plan_travelers) {
      if (traveler.id !== personId) seen.set(traveler.id, traveler)
    }
  }
  return [...seen.values()]
}
