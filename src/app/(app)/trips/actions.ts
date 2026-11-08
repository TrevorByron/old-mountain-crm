"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"

const blank = (value: string | null | undefined) => value?.trim() || null
const date = z
  .string()
  .nullish()
  .transform(blank)
  .refine((value) => !value || z.iso.date().safeParse(value).success, "Check the dates.")
const money = z.number().min(0).max(100_000_000).nullable()

const tripSchema = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Give the trip a name.").max(200),
    kind: z.enum(["group", "custom"]),
    starts_on: date,
    ends_on: date,
    seats: z.number().int().positive("Seats need to be above zero.").max(1000).nullable(),
    price_per_person: money,
    deposit_per_person: money,
    balance_due_on: date,
    notes: z.string().max(5000).nullish().transform(blank),
    archived: z.boolean().default(false),
  })
  .refine((trip) => !trip.starts_on || !trip.ends_on || trip.starts_on <= trip.ends_on, "The trip ends before it starts.")

export async function saveTrip(input: unknown) {
  const parsed = tripSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message }

  const { supabase } = await requireTeamMember()
  const { id, ...fields } = parsed.data
  const result = id
    ? await supabase.from("trips").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await supabase.from("trips").insert(fields).select("id").single()
  if (result.error) return { ok: false as const, error: "Couldn't save the trip." }

  revalidatePath("/trips", "layout")
  revalidatePath("/pipeline", "layout")
  return { ok: true as const, id: result.data.id as string }
}
