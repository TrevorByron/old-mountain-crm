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
  keywords: values,
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

export function describeRules(rules: SegmentRules) {
  const parts = RULE_FIELDS.flatMap(({ key, label }) =>
    rules[key].length > 0 ? [`${label}: ${rules[key].join(" or ")}`] : []
  )
  if (rules.keywords.length > 0) parts.push(`Wrote about: ${rules.keywords.join(" or ")}`)
  return parts.join(" · ")
}
