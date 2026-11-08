import { redirect } from "next/navigation"

import { devAuthEmail } from "@/lib/dev-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Pages and server actions call this. The proxy only handles the redirect for
// signed-out visitors; this is the check that matters.
export async function requireTeamMember() {
  const devEmail = devAuthEmail()
  const supabase = devEmail ? createAdminClient() : await createClient()

  let email = devEmail
  if (!email) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    email = user?.email ?? null
  }

  if (!email) redirect("/login")

  const { data: member } = await supabase
    .from("team_members")
    .select("id, email, name")
    .eq("email", email)
    .maybeSingle()

  if (!member) redirect("/login?error=not_invited")

  return { supabase, member }
}
