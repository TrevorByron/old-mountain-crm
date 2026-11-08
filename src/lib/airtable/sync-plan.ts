import { z } from "zod"

export type AirtableContact = {
  recordId: string
  createdTime: string
  name: string | null
  email: string | null
  status: string | null
  segments: string[]
  source: string | null
  phone: string | null
  accountOwner: string | null
  tripType: string | null
  departureWindow: string | null
  groupSize: string | null
  interests: string[]
  interestsOther: string | null
  objections: string[]
  objectionsOther: string | null
}

// Copied as they are, one to one with the Airtable columns.
type ContactDetails = {
  phone: string | null
  account_owner: string | null
  trip_type: string | null
  departure_window: string | null
  group_size: string | null
  interests: string[]
  interests_other: string | null
  objections: string[]
  objections_other: string | null
}

export type ExistingSubscriber = ContactDetails & {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  status: string | null
  source: string | null
  segments: string[]
  airtable_record_id: string | null
  airtable_push_pending: boolean
}

// Only ever contains columns Airtable owns. unsubscribed_at and suppressed are deliberately
// absent, so a sync has no way to write them. So is status, which the app owns: a new
// contact's Airtable status is only their starting point.
export type SubscriberFields = ContactDetails & {
  email: string | null
  first_name: string | null
  last_name: string | null
  source: string | null
  segments: string[]
  airtable_record_id: string
}

export type SkipReason = "no_email" | "invalid_email" | "duplicate_email" | "pending_app_change"

export type SkippedContact = {
  recordId: string
  name: string | null
  email: string | null
  reason: SkipReason
}

export type SyncPlan = {
  creates: (SubscriberFields & { subscribed_at: string; status: string | null })[]
  updates: { id: string; fields: SubscriberFields; changed: (keyof SubscriberFields)[] }[]
  unchanged: number
  skipped: SkippedContact[]
  unknownStatuses: string[]
}

const emailSchema = z.email()

export function splitName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: null, last_name: null }
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || null }
}

export function normalizeEmail(email: string | null) {
  return email?.trim().toLowerCase() || null
}

// The Segment field has trailing spaces in its option names, and some options
// are email addresses that were typed into the field by mistake.
export function cleanSegments(segments: string[]) {
  const names = segments.map((segment) => segment.trim()).filter(Boolean)
  return [...new Set(names.filter((name) => !emailSchema.safeParse(name).success))]
}

const cleanText = (value: string | null) => value?.trim() || null
const cleanList = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function planSync(
  contacts: AirtableContact[],
  existing: ExistingSubscriber[],
  knownStatuses: string[]
): SyncPlan {
  const plan: SyncPlan = { creates: [], updates: [], unchanged: 0, skipped: [], unknownStatuses: [] }
  const byRecordId = new Map(existing.flatMap((row) => (row.airtable_record_id ? [[row.airtable_record_id, row]] : [])))
  const byEmail = new Map(existing.flatMap((row) => (row.email ? [[row.email.toLowerCase(), row]] : [])))
  const statuses = new Set(knownStatuses)
  const unknownStatuses = new Set<string>()
  const claimedEmails = new Set<string>()

  // Oldest record first, so the earliest signup wins when an email is duplicated.
  const ordered = [...contacts].sort((a, b) => a.createdTime.localeCompare(b.createdTime))

  for (const contact of ordered) {
    const email = normalizeEmail(contact.email)
    const skip = (reason: SkipReason) =>
      plan.skipped.push({ recordId: contact.recordId, name: contact.name, email, reason })

    if (email && !emailSchema.safeParse(email).success) {
      skip("invalid_email")
      continue
    }
    if (email && claimedEmails.has(email)) {
      skip("duplicate_email")
      continue
    }

    const linked = byRecordId.get(contact.recordId)
    const owner = email ? byEmail.get(email) : undefined
    if (linked && owner && owner.id !== linked.id) {
      skip("duplicate_email")
      continue
    }
    if (email) claimedEmails.add(email)

    const match = linked ?? owner

    const fields: SubscriberFields = {
      // A blank Airtable cell doesn't erase an email the app already has.
      email: email ?? match?.email ?? null,
      ...splitName(contact.name),
      source: cleanText(contact.source),
      segments: cleanSegments(contact.segments),
      airtable_record_id: contact.recordId,
      phone: cleanText(contact.phone),
      account_owner: cleanText(contact.accountOwner),
      trip_type: cleanText(contact.tripType),
      departure_window: cleanText(contact.departureWindow),
      group_size: cleanText(contact.groupSize),
      interests: cleanList(contact.interests),
      interests_other: cleanText(contact.interestsOther),
      objections: cleanList(contact.objections),
      objections_other: cleanText(contact.objectionsOther),
    }

    if (!match) {
      let status = contact.status
      if (status && !statuses.has(status)) {
        unknownStatuses.add(status)
        status = null
      }
      plan.creates.push({ ...fields, status, subscribed_at: contact.createdTime })
      continue
    }

    // An app edit hasn't reached Airtable yet, so Airtable's copy is stale.
    if (match.airtable_push_pending) {
      skip("pending_app_change")
      continue
    }

    const changed = (Object.keys(fields) as (keyof SubscriberFields)[]).filter((key) => {
      if (key === "email") return fields.email !== (match.email?.toLowerCase() ?? null)
      const value = fields[key]
      const current = match[key]
      if (Array.isArray(value) && Array.isArray(current)) return !sameList(value, current)
      return value !== current
    })

    if (changed.length === 0) plan.unchanged += 1
    else plan.updates.push({ id: match.id, fields, changed })
  }

  plan.unknownStatuses = [...unknownStatuses]
  return plan
}
