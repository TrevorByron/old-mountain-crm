import { requireEnv } from "@/lib/env"

import type { AirtableContact } from "./sync-plan"

// Field ids rather than names, so renaming a column in Airtable doesn't break the sync.
export const AIRTABLE_FIELDS = {
  name: "fldDDP7oM2nYhKeLh",
  email: "fldSmlDqOAWudaRWY",
  status: "fldYGqTXTjAHoG318",
  segments: "fldLh5eIdoh21y42K",
  source: "fldNn1GyzBPJ8IihH",
} as const

const API_URL = "https://api.airtable.com/v0"
// Airtable allows 5 requests per second per base and blocks for 30 seconds on a 429.
const REQUEST_SPACING_MS = 220
const RATE_LIMIT_WAIT_MS = 30_000
const MAX_RATE_LIMIT_RETRIES = 2

type AirtableRecord = {
  id: string
  createdTime: string
  fields: Record<string, unknown>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function tableUrl() {
  return `${API_URL}/${requireEnv("AIRTABLE_BASE_ID")}/${requireEnv("AIRTABLE_TABLE_ID")}`
}

async function airtableFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("AIRTABLE_TOKEN")}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  })

  if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    await sleep(RATE_LIMIT_WAIT_MS)
    return airtableFetch(url, init, attempt + 1)
  }
  if (!response.ok) {
    throw new Error(`Airtable request failed with status ${response.status}`)
  }
  return response
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)

export function parseContact(record: AirtableRecord): AirtableContact {
  const segments = record.fields[AIRTABLE_FIELDS.segments]
  return {
    recordId: record.id,
    createdTime: record.createdTime,
    name: text(record.fields[AIRTABLE_FIELDS.name]),
    email: text(record.fields[AIRTABLE_FIELDS.email]),
    status: text(record.fields[AIRTABLE_FIELDS.status]),
    segments: Array.isArray(segments) ? segments.filter((segment) => typeof segment === "string") : [],
    source: text(record.fields[AIRTABLE_FIELDS.source]),
  }
}

// Reads only the mapped fields. Phone, objections and other notes never leave Airtable.
export async function listContacts() {
  const contacts: AirtableContact[] = []
  let offset: string | undefined

  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: "true", pageSize: "100" })
    Object.values(AIRTABLE_FIELDS).forEach((field) => params.append("fields[]", field))
    if (offset) params.set("offset", offset)

    const response = await airtableFetch(`${tableUrl()}?${params}`)
    const page: { records: AirtableRecord[]; offset?: string } = await response.json()
    contacts.push(...page.records.map(parseContact))
    offset = page.offset
    if (offset) await sleep(REQUEST_SPACING_MS)
  } while (offset)

  return contacts
}

export async function createRecord(fields: Record<string, unknown>) {
  const response = await airtableFetch(tableUrl(), {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  })
  const record: AirtableRecord = await response.json()
  await sleep(REQUEST_SPACING_MS)
  return record.id
}

export async function updateRecord(recordId: string, fields: Record<string, unknown>) {
  await airtableFetch(`${tableUrl()}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  })
  await sleep(REQUEST_SPACING_MS)
}
