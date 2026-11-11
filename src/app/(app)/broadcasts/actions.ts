"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { inngest } from "@/inngest/client"
import { requireTeamMember } from "@/lib/auth"
import { emailContentSchema } from "@/lib/broadcasts/blocks"
import { composeEmail, previewHtml, sendBlockers, sendConfig } from "@/lib/broadcasts/compose"
import {
  audienceFilterSchema,
  checkBroadcast,
  isAudienceEmpty,
  starterContent,
} from "@/lib/broadcasts/content"
import { EMAIL_IMAGES_BUCKET, MAX_UPLOAD_BYTES, cropForEmail, prepareOriginal } from "@/lib/broadcasts/photo-upload"
import { BROADCAST_SEND_EVENT, resendClient } from "@/lib/broadcasts/sending"
import { requireEnv } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

const idSchema = z.uuid()
const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((value) => value?.trim() || null)

const createSchema = z.object({ templateId: idSchema, segmentId: idSchema.nullish() })

export async function createBroadcast(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Choose a template." }

  const { supabase, member } = await requireTeamMember()
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, layout_key, content")
    .eq("id", parsed.data.templateId)
    .single()
  if (templateError) return { ok: false as const, error: "Couldn't find that template." }

  const { data, error } = await supabase
    .from("broadcasts")
    .insert({
      name: "Untitled email",
      template_id: template.id,
      audience_filter: audienceFilterSchema.parse(parsed.data.segmentId ? { segment_ids: [parsed.data.segmentId] } : {}),
      created_by: member.id,
      content: template.content ?? starterContent(template.layout_key),
    })
    .select("id")
    .single()
  if (error) return { ok: false as const, error: "Couldn't create the broadcast." }
  revalidatePath("/broadcasts")
  return { ok: true as const, id: data.id as string }
}

const saveSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Give the broadcast a name.").max(200),
  subject: optionalText(200),
  preheader: optionalText(200),
  content: emailContentSchema,
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

const previewSchema = z.object({ preheader: optionalText(200), content: emailContentSchema })

export async function previewBroadcast(input: unknown) {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) return null

  await requireTeamMember()
  const html = await previewHtml(parsed.data.content, parsed.data.preheader)
  return { html, bytes: Buffer.byteLength(html) }
}

export async function countAudience(input: unknown) {
  const filter = audienceFilterSchema.safeParse(input)
  if (!filter.success) return null

  const { supabase } = await requireTeamMember()
  const { data, error } = await supabase.rpc("count_broadcast_audience", { filter: filter.data })
  return error ? null : (data as number)
}

function publicUrlPrefix() {
  return `${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/${EMAIL_IMAGES_BUCKET}/originals/`
}

async function storePhoto(folder: string, photo: Buffer) {
  const storage = createAdminClient().storage.from(EMAIL_IMAGES_BUCKET)
  const path = `${folder}/${randomUUID()}.jpg`
  const { error } = await storage.upload(path, photo, { contentType: "image/jpeg" })
  if (error) throw new Error(error.message)
  return storage.getPublicUrl(path).data.publicUrl
}

export async function uploadPhoto(formData: FormData) {
  await requireTeamMember()

  const file = formData.get("photo")
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Choose a photo to upload." }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false as const, error: "That photo is too large. Try a smaller one." }

  let original: Buffer
  let display: Buffer
  try {
    original = await prepareOriginal(Buffer.from(await file.arrayBuffer()))
    display = await cropForEmail(original, null)
  } catch {
    return { ok: false as const, error: "Couldn't read that file. Try a JPG or PNG." }
  }

  try {
    return { ok: true as const, source: await storePhoto("originals", original), src: await storePhoto("crops", display) }
  } catch (error) {
    console.error("Photo upload failed:", error)
    return { ok: false as const, error: "Couldn't upload the photo. Try again." }
  }
}

const cropSchema = z.object({
  source: z.string().max(2000),
  area: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(0.1).max(100),
    height: z.number().min(0.1).max(100),
  }),
})

// Only reads photos from this app: library originals and our own uploads, never any other address.
function sourceUrl(source: string) {
  if (/^\/email\/originals\/[\w-]+\.jpg$/.test(source)) return `${requireEnv("APP_URL")}${source}`
  const prefix = publicUrlPrefix()
  if (source.startsWith(prefix) && /^[\w-]+\.jpg$/.test(source.slice(prefix.length))) return source
  return null
}

export async function cropPhoto(input: unknown) {
  const parsed = cropSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't crop that photo." }

  await requireTeamMember()
  const url = sourceUrl(parsed.data.source)
  if (!url) return { ok: false as const, error: "Couldn't crop that photo." }

  try {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) throw new Error(`Photo request failed with status ${response.status}`)
    const cropped = await cropForEmail(Buffer.from(await response.arrayBuffer()), parsed.data.area)
    return { ok: true as const, src: await storePhoto("crops", cropped) }
  } catch (error) {
    console.error("Photo crop failed:", error)
    return { ok: false as const, error: "Couldn't crop that photo. Try again." }
  }
}

async function loadBroadcast(supabase: Awaited<ReturnType<typeof requireTeamMember>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("broadcasts")
    .select("id, state, scheduled_at, audience_filter, subject, preheader, content")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    state: data.state as string,
    scheduledAt: data.scheduled_at as string | null,
    filter: audienceFilterSchema.parse(data.audience_filter),
    subject: data.subject as string | null,
    preheader: data.preheader as string | null,
    content: emailContentSchema.parse(data.content ?? {}),
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
  const { errors } = checkBroadcast(broadcast)
  if (errors.length > 0) return { ok: false as const, error: errors[0] }

  const { data: self, error: selfError } = await supabase
    .from("subscribers")
    .select("first_name, unsubscribed_at, suppressed")
    .eq("email", member.email)
    .maybeSingle()
  if (selfError) return { ok: false as const, error: "Couldn't check your address." }
  if (self?.unsubscribed_at || self?.suppressed) {
    return { ok: false as const, error: `${member.email} is unsubscribed or suppressed, so it can't receive tests.` }
  }

  const email = await composeEmail(
    broadcast,
    { id: member.id, email: member.email, firstName: self?.first_name ?? member.name?.split(" ")[0] ?? null },
    sendConfig()
  )
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

  const { errors } = checkBroadcast(broadcast)
  if (errors.length > 0) return { ok: false as const, error: errors[0] }
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

// Back to what the template started with. Only drafts, because a sent email is a record.
export async function resetBroadcast(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that email." }

  const { supabase } = await requireTeamMember()
  const { data: broadcast, error: readError } = await supabase
    .from("broadcasts")
    .select("state, templates (layout_key, content)")
    .eq("id", id)
    .single()
  if (readError) return { ok: false as const, error: "Couldn't find that email." }
  if (broadcast.state !== "draft") return { ok: false as const, error: "Only drafts can be reset." }
  const template = broadcast.templates as unknown as { layout_key: string; content: unknown } | null

  const { error } = await supabase
    .from("broadcasts")
    .update({ subject: null, preheader: null, content: template?.content ?? starterContent(template?.layout_key ?? "letter") })
    .eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't reset the draft." }
  revalidatePath("/broadcasts")
  revalidatePath(`/broadcasts/${id}`)
  return { ok: true as const }
}

// Any broadcast can seed a new draft, including ones already sent.
export async function duplicateBroadcast(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't find that broadcast." }

  const { supabase, member } = await requireTeamMember()
  const { data: original, error } = await supabase
    .from("broadcasts")
    .select("name, template_id, subject, preheader, content, audience_filter")
    .eq("id", id)
    .single()
  if (error) return { ok: false as const, error: "Couldn't find that broadcast." }

  const { data, error: insertError } = await supabase
    .from("broadcasts")
    .insert({ ...original, name: `${original.name} (copy)`, created_by: member.id })
    .select("id")
    .single()
  if (insertError) return { ok: false as const, error: "Couldn't copy the broadcast." }
  revalidatePath("/broadcasts")
  return { ok: true as const, id: data.id as string }
}

const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(120),
  content: emailContentSchema,
})

export async function saveAsTemplate(input: unknown) {
  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase
    .from("templates")
    .insert({ name: parsed.data.name, layout_key: "custom", content: parsed.data.content })
  if (error) return { ok: false as const, error: "Couldn't save the template." }
  revalidatePath("/broadcasts")
  return { ok: true as const }
}

export async function deleteTemplate(id: string) {
  if (!idSchema.safeParse(id).success) return { ok: false as const, error: "Couldn't delete the template." }

  const { supabase } = await requireTeamMember()
  await supabase.from("broadcasts").update({ template_id: null }).eq("template_id", id)
  const { error } = await supabase.from("templates").delete().eq("id", id).eq("layout_key", "custom")
  if (error) return { ok: false as const, error: "Couldn't delete the template." }
  revalidatePath("/broadcasts")
  return { ok: true as const }
}
