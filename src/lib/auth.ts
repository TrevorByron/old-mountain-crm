import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

// Pages and server actions call this. The proxy only handles the redirect for
// signed-out visitors; this is the check that matters.
export async function requireTeamMember() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect("/login")

  const { data: member } = await supabase
    .from("team_members")
    .select("id, email, name")
    .eq("email", user.email)
    .maybeSingle()

  if (!member) redirect("/login?error=not_invited")

  return { supabase, member }
}
