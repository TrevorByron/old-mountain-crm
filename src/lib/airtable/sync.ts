import { requireEnv } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

import { AIRTABLE_FIELDS, createRecord, listContacts, updateRecord } from "./client"
import { planSync, type ExistingSubscriber } from "./sync-plan"

const PAGE_SIZE = 1000
const INSERT_BATCH_SIZE = 500
const SYNC_ACTOR = "airtable_sync"

type SyncTrigger = "first_import" | "manual" | "schedule"

async function loadPlanInputs() {
  const admin = createAdminClient()
  const existing: ExistingSubscriber[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("subscribers")
      .select(
        "id, email, first_name, last_name, status, source, segments, airtable_record_id, airtable_push_pending, phone, account_owner, trip_type, departure_window, group_size, interests, interests_other, objections, objections_other"
      )
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    existing.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const { data: statuses, error } = await admin.from("statuses").select("value")
  if (error) throw new Error(error.message)

  return { existing, knownStatuses: statuses.map((status) => status.value) }
}

export async function previewSync() {
  const { existing, knownStatuses } = await loadPlanInputs()
  const contacts = await listContacts()
  return { total: contacts.length, plan: planSync(contacts, existing, knownStatuses) }
}

export async function hasCompletedImport() {
  const { count, error } = await createAdminClient()
    .from("sync_runs")
    .select("id", { count: "exact", head: true })
    .not("finished_at", "is", null)
    .is("error", null)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

// Sends a subscriber's current state to Airtable. The caller has already set
// airtable_push_pending, so a failure here leaves it set and the next sync
// retries. Opt-outs are honored in Supabase whether or not this succeeds.
export async function pushToAirtable(subscriberId: string) {
  const admin = createAdminClient()

  try {
    const { data: row, error } = await admin
      .from("subscribers")
      .select("email, first_name, last_name, phone, source, unsubscribed_at, suppressed, airtable_record_id")
      .eq("id", subscriberId)
      .single()
    if (error) throw new Error(error.message)

    const fields: Record<string, unknown> = {
      [AIRTABLE_FIELDS.name]: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
    }
    if (row.email) fields[AIRTABLE_FIELDS.email] = row.email
    if (row.phone) fields[AIRTABLE_FIELDS.phone] = row.phone
    const optOutField = process.env.AIRTABLE_OPT_OUT_FIELD_ID
    if (optOutField) fields[optOutField] = Boolean(row.unsubscribed_at) || row.suppressed

    if (row.airtable_record_id) {
      await updateRecord(row.airtable_record_id, fields)
      const { error: clearError } = await admin
        .from("subscribers")
        .update({ airtable_push_pending: false })
        .eq("id", subscriberId)
      if (clearError) throw new Error(clearError.message)
    } else {
      fields[AIRTABLE_FIELDS.source] = row.source
      const recordId = await createRecord(fields)
      const { error: linkError } = await admin
        .from("subscribers")
        .update({ airtable_record_id: recordId, airtable_push_pending: false })
        .eq("id", subscriberId)
      if (linkError) throw new Error(linkError.message)
    }
    return true
  } catch (error) {
    console.error(`Airtable push failed for subscriber ${subscriberId}:`, error)
    return false
  }
}

async function flushPendingPushes() {
  const { data, error } = await createAdminClient()
    .from("subscribers")
    .select("id")
    .eq("airtable_push_pending", true)
  if (error) throw new Error(error.message)
  for (const row of data) await pushToAirtable(row.id)
}

export async function runSync(trigger: SyncTrigger) {
  requireEnv("AIRTABLE_TOKEN")
  const admin = createAdminClient()

  // The scheduled sync waits until someone has reviewed and committed the first import.
  if (trigger === "schedule" && !(await hasCompletedImport())) {
    return { skippedRun: true as const }
  }

  const { data: run, error: runError } = await admin.from("sync_runs").insert({ trigger }).select("id").single()
  if (runError) throw new Error(runError.message)

  try {
    await flushPendingPushes()

    const { existing, knownStatuses } = await loadPlanInputs()
    const plan = planSync(await listContacts(), existing, knownStatuses)

    for (let i = 0; i < plan.creates.length; i += INSERT_BATCH_SIZE) {
      const rows = plan.creates
        .slice(i, i + INSERT_BATCH_SIZE)
        .map((row) => ({ ...row, last_changed_by: SYNC_ACTOR }))
      const { error } = await admin.from("subscribers").insert(rows)
      if (error) throw new Error(error.message)
    }

    for (const update of plan.updates) {
      const changes = Object.fromEntries(update.changed.map((key) => [key, update.fields[key]]))
      const { error } = await admin
        .from("subscribers")
        .update({ ...changes, last_changed_by: SYNC_ACTOR })
        .eq("id", update.id)
      if (error) throw new Error(error.message)
    }

    const summary = {
      created_count: plan.creates.length,
      updated_count: plan.updates.length,
      skipped: plan.skipped,
    }
    await admin
      .from("sync_runs")
      .update({ ...summary, finished_at: new Date().toISOString() })
      .eq("id", run.id)
    return { skippedRun: false as const, ...summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed"
    await admin.from("sync_runs").update({ error: message, finished_at: new Date().toISOString() }).eq("id", run.id)
    throw error
  }
}
