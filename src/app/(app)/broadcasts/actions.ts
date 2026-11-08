"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { inngest } from "@/inngest/client"
import { requireTeamMember } from "@/lib/auth"
import { composeEmail, previewHtml, sendBlockers, sendConfig } from "@/lib/broadcasts/compose"
import {
  LAYOUTS,
  audienceFilterSchema,
  broadcastContentSchema,
  isAudienceEmpty,
  missingContent,
  type LayoutKey,
} from "@/lib/broadcasts/content"
import { BROADCAST_SEND_EVENT, resendClient } from "@/lib/broadcasts/sending"

const layoutSchema = z.enum(LAYOUTS.map((layout) => layout.key) as [LayoutKey, ...LayoutKey[]])
const idSchema = z.uuid()

const CONTENT_COLUMNS = "subject, preheader, heading, body_markdown, cta_label, cta_url, image_url, image_alt"

export async function createBroadcast(input: unknown) {
  const layout = layoutSchema.safeParse(input)
  if (!layout.success) return { ok: false as const, error: "Choose a layout." }

  const { supabase, member } = await requireTeamMember()
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id")
    .eq("layout_key", layout.data)
    .single()
  if (templateError) return { ok: false as const, error: "Couldn't find that layout." }

  const { data, error } = await supabase
    .from("broadcasts")
    .insert({ name: "Untitled broadcast", template_id: template.id, created_by: member.id })
    .select("id")
    .single()
  if (error) return { ok: false as const, error: "Couldn't create the broadcast." }
  revalidatePath("/broadcasts")
  return { ok: true as const, id: data.id as string }
}

const saveSchema = broadcastContentSchema.extend({
  id: idSchema,
  name: z.string().trim().min(1, "Give the broadcast a name.").max(200),
  template_id: idSchema,
  audience_filter: audienceFilterSchema,
})

// Only drafts change. A scheduled broadcast has to be cancelled first, so what was
// confirmed is what goes out.
export async function saveBroadcast(input: unknown) {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  const { data, error } = await supabase
    .from("broadcasts")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("state", "draft")
    .select("id")
  if (error) return { ok: false as const, error: "Couldn't save the broadcast." }
  if (data.length === 0) return { ok: false as const, error: "Only drafts can be edited." }
  revalidatePath("/broadcasts")
  return { ok: true as const }
}

// A half-typed link shouldn't blank the preview, so it's left out until it's valid.
const previewSchema = z.object({
  layout: layoutSchema,
  content: broadcastContentSchema.extend({
    cta_url: broadcastContentSchema.shape.cta_url.catch(null),
    image_url: broadcastContentSchema.shape.image_url.catch(null),
  }),
})

export async function previewBroadcast(input: unknown) {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) return null

  await requireTeamMember()
  return previewHtml(parsed.data.layout, parsed.data.content)
}

export async function countAudience(input: unknown) {
  const filter = audienceFilterSchema.safeParse(input)
  if (!filter.success) return null

  const { supabase } = await requireTeamMember()
  const { data, error } = await supabase.rpc("count_broadcast_audience", { filter: filter.data })
  return error ? null : (data as number)
}

async function loadBroadcast(supabase: Awaited<ReturnType<typeof requireTeamMember>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("broadcasts")
    .select(`id, state, scheduled_at, audience_filter, ${CONTENT_COLUMNS}, templates (layout_key)`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const { templates, audience_filter, state, scheduled_at, ...content } = data as unknown as {
    templates: { layout_key: LayoutKey } | null
    audience_filter: unknown
    state: string
    scheduled_at: string | null
    id: string
  } & Record<string, string | null>
  return {
    state,
    scheduledAt: scheduled_at,
    layout: templates?.layout_key ?? ("letter" as LayoutKey),
    filter: audienceFilterSchema.parse(audience_filter),
    content: broadcastContentSchema.parse(content),
  }
}

// Goes to the person signed in. The unsubscribe link carries their team id, which matches
// no subscriber, so testing it can't opt them out of anything. Suppression is still checked
// in case their address is also on the list.
export async function sendTest(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that broadcast." }

  const blockers = sendBlockers(process.env, { realRecipients: false })
  if (blockers.length > 0) return { ok: false as const, error: blockers[0] }

  const { supabase, member } = await requireTeamMember()
  const broadcast = await loadBroadcast(supabase, id)
  if (!broadcast) return { ok: false as const, error: "Couldn't find that broadcast." }
  const missing = missingContent(broadcast.content, broadcast.layout)
  if (missing.length > 0) return { ok: false as const, error: missing[0] }

  const { data: self, error: selfError } = await supabase
    .from("subscribers")
    .select("unsubscribed_at, suppressed")
    .eq("email", member.email)
    .maybeSingle()
  if (selfError) return { ok: false as const, error: "Couldn't check your address." }
  if (self?.unsubscribed_at || self?.suppressed) {
    return { ok: false as const, error: `${member.email} is unsubscribed or suppressed, so it can't receive tests.` }
  }

  const email = await composeEmail(broadcast.layout, broadcast.content, { id: member.id, email: member.email }, sendConfig(), {
    subjectPrefix: "[Test] ",
  })
  const { error } = await resendClient().emails.send(email)
  if (error) return { ok: false as const, error: `Resend: ${error.message}` }
  return { ok: true as const, sentTo: member.email as string }
}

const queueSchema = z.object({
  id: idSchema,
  scheduledAt: z.iso.datetime().nullable(),
  expectedCount: z.number().int().positive(),
})

export async function queueBroadcast(input: unknown) {
  const parsed = queueSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Check the send time and audience." }
  const { id, scheduledAt, expectedCount } = parsed.data

  const blockers = sendBlockers(process.env, { realRecipients: true })
  if (blockers.length > 0) return { ok: false as const, error: blockers[0] }

  const { supabase } = await requireTeamMember()
  const broadcast = await loadBroadcast(supabase, id)
  if (!broadcast || broadcast.state !== "draft") return { ok: false as const, error: "Only drafts can be sent." }

  const missing = missingContent(broadcast.content, broadcast.layout)
  if (missing.length > 0) return { ok: false as const, error: missing[0] }
  if (isAudienceEmpty(broadcast.filter)) return { ok: false as const, error: "Choose who this goes to." }

  const { data: count, error: countError } = await supabase.rpc("count_broadcast_audience", {
    filter: broadcast.filter,
  })
  if (countError) return { ok: false as const, error: "Couldn't count the audience." }
  if (count !== expectedCount) {
    return { ok: false as const, error: `The audience is now ${count} people, not ${expectedCount}. Review and confirm again.` }
  }

  const now = new Date()
  if (scheduledAt && new Date(scheduledAt) <= now) {
    return { ok: false as const, error: "Choose a time in the future." }
  }
  const sendAt = scheduledAt ?? now.toISOString()

  const { data: claimed, error } = await supabase
    .from("broadcasts")
    .update({ state: "scheduled", scheduled_at: sendAt, last_error: null, updated_at: now.toISOString() })
    .eq("id", id)
    .eq("state", "draft")
    .select("id")
  if (error || claimed.length === 0) return { ok: false as const, error: "Couldn't queue the broadcast." }

  try {
    await inngest.send({ name: BROADCAST_SEND_EVENT, data: { broadcastId: id, scheduledAt: sendAt } })
  } catch (sendError) {
    console.error("Couldn't queue broadcast:", sendError)
    await supabase.from("broadcasts").update({ state: "draft", scheduled_at: null }).eq("id", id)
    return { ok: false as const, error: "The sending service didn't respond, so nothing was sent. It's still a draft." }
  }
  revalidatePath("/broadcasts")
  revalidatePath(`/broadcasts/${id}`)
  return { ok: true as const }
}

export async function cancelBroadcast(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that broadcast." }

  const { supabase } = await requireTeamMember()
  const { data, error } = await supabase
    .from("broadcasts")
    .update({ state: "draft", scheduled_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("state", "scheduled")
    .select("id")
  if (error) return { ok: false as const, error: "Couldn't cancel the broadcast." }
  if (data.length === 0) return { ok: false as const, error: "It's already sending, so it can't be cancelled." }
  revalidatePath("/broadcasts")
  revalidatePath(`/broadcasts/${id}`)
  return { ok: true as const }
}

// Picks up with whoever hasn't been sent to yet. Nobody already sent to is sent again.
export async function resumeBroadcast(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that broadcast." }

  const blockers = sendBlockers(process.env, { realRecipients: true })
  if (blockers.length > 0) return { ok: false as const, error: blockers[0] }

  const { supabase } = await requireTeamMember()
  const broadcast = await loadBroadcast(supabase, id)
  if (!broadcast || broadcast.state !== "failed" || !broadcast.scheduledAt) {
    return { ok: false as const, error: "Only a stopped send can be resumed." }
  }

  try {
    await inngest.send({
      name: BROADCAST_SEND_EVENT,
      data: { broadcastId: id, scheduledAt: broadcast.scheduledAt, resume: true },
    })
  } catch (sendError) {
    console.error("Couldn't resume broadcast:", sendError)
    return { ok: false as const, error: "The sending service didn't respond. Try again in a moment." }
  }
  revalidatePath(`/broadcasts/${id}`)
  return { ok: true as const }
}

export async function deleteBroadcast(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that broadcast." }

  const { supabase } = await requireTeamMember()
  const { data, error } = await supabase.from("broadcasts").delete().eq("id", id).eq("state", "draft").select("id")
  if (error || data.length === 0) return { ok: false as const, error: "Only drafts can be deleted." }
  revalidatePath("/broadcasts")
  return { ok: true as const }
}
