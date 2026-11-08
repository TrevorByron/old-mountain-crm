import { z } from "zod"

export const LAYOUTS = [
  { key: "letter", name: "Letter", description: "A personal note. No banner, just your words." },
  { key: "announcement", name: "Announcement", description: "A branded banner, a heading and a button." },
  { key: "trip_spotlight", name: "Trip spotlight", description: "Leads with a large photo of the trip." },
] as const

export type LayoutKey = (typeof LAYOUTS)[number]["key"]

const blankToNull = (value: string | null | undefined) => value?.trim() || null
const optionalText = (max: number) => z.string().max(max).nullish().transform(blankToNull)
const optionalUrl = z
  .string()
  .max(2000)
  .nullish()
  .transform(blankToNull)
  .refine((value) => !value || /^https?:\/\/\S+$/i.test(value), "Links need to start with http:// or https://.")

export const broadcastContentSchema = z.object({
  subject: optionalText(200),
  preheader: optionalText(200),
  heading: optionalText(200),
  body_markdown: optionalText(50_000),
  cta_label: optionalText(80),
  cta_url: optionalUrl,
  image_url: optionalUrl,
  image_alt: optionalText(300),
})

export type BroadcastContent = z.output<typeof broadcastContentSchema>

export const audienceFilterSchema = z.object({
  statuses: z.array(z.string()).default([]),
  airtable_segments: z.array(z.string()).default([]),
  segment_ids: z.array(z.uuid()).default([]),
})

export type AudienceFilter = z.output<typeof audienceFilterSchema>

export function isAudienceEmpty(filter: AudienceFilter) {
  return filter.statuses.length + filter.airtable_segments.length + filter.segment_ids.length === 0
}

// What still stands between a draft and a send, in words for the person writing it.
export function missingContent(content: BroadcastContent, layout: LayoutKey) {
  const missing: string[] = []
  if (!content.subject) missing.push("Add a subject.")
  if (!content.body_markdown) missing.push("Write the body.")
  if (Boolean(content.cta_label) !== Boolean(content.cta_url)) missing.push("Give the button both a label and a link.")
  if (layout === "trip_spotlight" && !content.image_url) missing.push("Add a photo for the trip spotlight.")
  return missing
}
