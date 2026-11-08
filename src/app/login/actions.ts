"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { requireEnv } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type LoginState = { status: "idle" | "sent" | "invalid" | "error" }

export async function sendMagicLink(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase())
  if (!email.success) return { status: "invalid" }

  const { data: member, error: lookupError } = await createAdminClient()
    .from("team_members")
    .select("id")
    .eq("email", email.data)
    .maybeSingle()
  if (lookupError) return { status: "error" }

  // Uninvited addresses get the same response, so this form can't reveal who's on the team.
  if (member) {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: { emailRedirectTo: `${requireEnv("APP_URL")}/auth/confirm` },
    })
    if (error) return { status: "error" }
  }
  return { status: "sent" }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
