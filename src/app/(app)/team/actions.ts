"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireTeamMember } from "@/lib/auth"
import { requireEnv } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().max(200).optional(),
})

export async function inviteMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email address." }

  const { supabase } = await requireTeamMember()
  const { email, name } = parsed.data

  const { error } = await supabase.from("team_members").insert({ email, name: name || null })
  if (error) {
    return {
      ok: false as const,
      error: error.code === "23505" ? "That person is already on the team." : "Couldn't add them to the team.",
    }
  }
  revalidatePath("/team")

  // Their access is the row above. If this email fails, they can still request
  // a sign-in link from the login page.
  const { error: inviteError } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${requireEnv("APP_URL")}/today`,
  })
  if (inviteError) {
    console.error("Invite email failed:", inviteError.message)
    return { ok: true as const, warning: "They're on the team, but the email didn't send. Ask them to sign in." }
  }
  return { ok: true as const }
}

const memberNameSchema = z.object({ id: z.uuid(), name: z.string().trim().max(200) })

export async function renameMember(input: unknown) {
  const parsed = memberNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Couldn't save that name." }

  const { supabase } = await requireTeamMember()
  const { error } = await supabase.from("team_members").update({ name: parsed.data.name || null }).eq("id", parsed.data.id)
  if (error) return { ok: false as const, error: "Couldn't save that name." }
  revalidatePath("/team")
  return { ok: true as const }
}

// Their access is this row, so removing it stops them signing in.
export async function removeMember(id: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Couldn't find them." }

  const { supabase, member } = await requireTeamMember()
  if (member.id === id) return { ok: false as const, error: "You can't remove yourself. Ask someone else on the team." }

  const { error } = await supabase.from("team_members").delete().eq("id", id)
  if (error) {
    return { ok: false as const, error: error.code === "23503" ? "They've created campaigns, so they can't be removed yet." : "Couldn't remove them." }
  }
  revalidatePath("/team")
  return { ok: true as const }
}
