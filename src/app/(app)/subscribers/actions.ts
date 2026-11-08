"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { pushToAirtable } from "@/lib/airtable/sync"
import { requireTeamMember } from "@/lib/auth"
import { unsubscribeSubscriber } from "@/lib/unsubscribe"

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string }

// Larger bulk changes stay pending and go out with the next sync, so the
// request isn't held open by Airtable's rate limit.
const MAX_IMMEDIATE_PUSHES = 50
const AIRTABLE_DELAY_WARNING = "Saved here. Airtable will catch up on the next sync."

const optionalText = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value || null)

const subscriberSchema = z.object({
  id: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  first_name: optionalText,
  last_name: optionalText,
  status: z.string().nullable(),
  country: optionalText,
})

export async function updateSubscriber(input: unknown): Promise<ActionResult> {
  const parsed = subscriberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Check the email address and try again." }

  const { supabase, member } = await requireTeamMember()
  const { id, ...fields } = parsed.data

  const { error } = await supabase
    .from("subscribers")
    .update({ ...fields, airtable_push_pending: true, last_changed_by: member.email })
    .eq("id", id)
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Another subscriber already has that email." : "Couldn't save those changes.",
    }
  }

  const pushed = await pushToAirtable(id)
  revalidatePath("/subscribers")
  return pushed ? { ok: true } : { ok: true, warning: AIRTABLE_DELAY_WARNING }
}

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1),
  status: z.string().min(1),
})

export async function bulkChangeStatus(input: unknown): Promise<ActionResult> {
  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Pick at least one subscriber and a status." }

  const { supabase, member } = await requireTeamMember()
  const { ids, status } = parsed.data

  const { error } = await supabase
    .from("subscribers")
    .update({ status, airtable_push_pending: true, last_changed_by: member.email })
    .in("id", ids)
  if (error) return { ok: false, error: "Couldn't change those statuses." }

  let allPushed = ids.length <= MAX_IMMEDIATE_PUSHES
  for (const id of ids.slice(0, MAX_IMMEDIATE_PUSHES)) {
    if (!(await pushToAirtable(id))) allPushed = false
  }

  revalidatePath("/subscribers")
  return allPushed ? { ok: true } : { ok: true, warning: AIRTABLE_DELAY_WARNING }
}

// For opt-outs that arrive another way, such as someone replying to ask.
export async function markUnsubscribed(id: unknown): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { ok: false, error: "Couldn't find that subscriber." }

  const { member } = await requireTeamMember()
  try {
    await unsubscribeSubscriber(parsed.data, member.email)
  } catch {
    return { ok: false, error: "Couldn't unsubscribe them. Try again." }
  }

  revalidatePath("/subscribers")
  return { ok: true }
}
