"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { segmentRulesSchema } from "@/lib/segments/rules"

const nameSchema = z.string().trim().min(1, "Give the segment a name.").max(120)
const descriptionSchema = z.string().trim().max(500).optional()
const DUPLICATE_NAME = "A segment with that name already exists."

const createSchema = z.object({ name: nameSchema, description: descriptionSchema, rules: segmentRulesSchema.optional() })

export async function createSegment(input: unknown) {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase, member } = await requireTeamMember()
  const { data, error } = await supabase
    .from("segments")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      rules: parsed.data.rules ?? {},
      created_by: member.id,
    })
    .select("id")
    .single()
  if (error) {
    return { ok: false as const, error: error.code === "23505" ? DUPLICATE_NAME : "Couldn't create the segment." }
  }
  revalidatePath("/segments")
  return { ok: true as const, id: data.id as string }
}

const saveSchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  description: descriptionSchema,
  rules: segmentRulesSchema,
})

export async function saveSegment(input: unknown) {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, name, description, rules } = parsed.data
  const { error } = await supabase
    .from("segments")
    .update({ name, description: description || null, rules, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    return { ok: false as const, error: error.code === "23505" ? DUPLICATE_NAME : "Couldn't save the segment." }
  }
  revalidatePath("/segments")
  revalidatePath(`/segments/${id}`)
  return { ok: true as const }
}

export async function countRuleMatches(input: unknown) {
  const rules = segmentRulesSchema.safeParse(input)
  if (!rules.success) return null

  const { supabase } = await requireTeamMember()
  const { data, error } = await supabase.rpc("count_rule_matches", { rules: rules.data })
  return error ? null : (data as number)
}

export async function deleteSegment(id: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Couldn't delete the segment." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("segments").delete().eq("id", id)
  if (error) return { ok: false as const, error: "Couldn't delete the segment." }
  revalidatePath("/segments")
  return { ok: true as const }
}

const membersSchema = z.object({ segmentId: z.uuid(), subscriberIds: z.array(z.uuid()).min(1).max(5000) })

export async function addToSegment(input: unknown) {
  const parsed = membersSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Choose a segment and at least one person." }

  const { supabase, member } = await requireTeamMember()
  const { segmentId, subscriberIds } = parsed.data
  const { error } = await supabase.from("segment_members").upsert(
    subscriberIds.map((subscriberId) => ({
      segment_id: segmentId,
      subscriber_id: subscriberId,
      added_by: member.email,
    })),
    { onConflict: "segment_id,subscriber_id", ignoreDuplicates: true }
  )
  if (error) return { ok: false as const, error: "Couldn't add them to the segment." }
  revalidatePath("/segments")
  revalidatePath(`/segments/${segmentId}`)
  return { ok: true as const }
}

export async function removeFromSegment(input: unknown) {
  const parsed = membersSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't remove them." }

  const { supabase } = await requireTeamMember()
  const { segmentId, subscriberIds } = parsed.data
  const { error } = await supabase
    .from("segment_members")
    .delete()
    .eq("segment_id", segmentId)
    .in("subscriber_id", subscriberIds)
  if (error) return { ok: false as const, error: "Couldn't remove them." }
  revalidatePath("/segments")
  revalidatePath(`/segments/${segmentId}`)
  return { ok: true as const }
}
