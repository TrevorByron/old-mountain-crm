import { z } from "zod"

// The fields a segment can filter on. `column` is where the choices come from.
export const RULE_FIELDS = [
  { key: "departure_windows", label: "Departure window", column: "departure_window" },
  { key: "trip_types", label: "Trip type", column: "trip_type" },
  { key: "group_sizes", label: "Group size", column: "group_size" },
  { key: "interests", label: "What excites them", column: "interests" },
  { key: "objections", label: "Objections", column: "objections" },
  { key: "statuses", label: "Status", column: "status" },
  { key: "airtable_segments", label: "Airtable segment", column: "segments" },
  { key: "account_owners", label: "Account owner", column: "account_owner" },
  { key: "tags", label: "Your tags", column: "tags" },
] as const

export type RuleKey = (typeof RULE_FIELDS)[number]["key"]
export const RULE_COLUMNS = RULE_FIELDS.map((field) => field.column).join(", ")

const values = z.array(z.string().trim().min(1).max(200)).max(100).default([])

export const segmentRulesSchema = z.object({
  departure_windows: values,
  trip_types: values,
  group_sizes: values,
  interests: values,
  objections: values,
  statuses: values,
  airtable_segments: values,
  account_owners: values,
  tags: values,
  keywords: values,
  lifecycles: values,
  plan_stages: values,
  trips: values,
  not_on_trips: values,
})

export type SegmentRules = z.output<typeof segmentRulesSchema>
export type RuleOptions = Record<RuleKey, string[]>

// Choices come from the contacts themselves, so they follow whatever Airtable holds.
export function ruleOptions(rows: Record<string, unknown>[], statuses: string[]): RuleOptions {
  const options = {} as RuleOptions
  for (const { key, column } of RULE_FIELDS) {
    const found = rows.flatMap((row) => row[column] ?? []) as string[]
    options[key] = [...new Set(found)].sort((a, b) => a.localeCompare(b))
  }
  options.statuses = statuses
  return options
}

export function parseKeywords(input: string) {
  return [...new Set(input.split(",").map((keyword) => keyword.trim()).filter(Boolean))]
}

export const JOURNEY_RULES = [
  { key: "lifecycles", label: "Relationship" },
  { key: "plan_stages", label: "Has a trip plan at" },
  { key: "trips", label: "Joined trip" },
  { key: "not_on_trips", label: "Hasn't joined trip" },
] as const

export type JourneyRuleKey = (typeof JOURNEY_RULES)[number]["key"]

// `names` turns stored values like trip ids and stage keys into words.
export function describeRules(rules: SegmentRules, names: Record<string, string> = {}) {
  const parts = RULE_FIELDS.flatMap(({ key, label }) =>
    rules[key].length > 0 ? [`${label}: ${rules[key].join(" or ")}`] : []
  )
  for (const { key, label } of JOURNEY_RULES) {
    if (rules[key].length > 0) parts.push(`${label}: ${rules[key].map((value) => names[value] ?? value).join(" or ")}`)
  }
  if (rules.keywords.length > 0) parts.push(`Wrote about: ${rules.keywords.join(" or ")}`)
  return parts.join(" · ")
}
