import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// Target of the sign-in emails. Supabase's default template arrives with a `code`,
// which only works in the browser that requested the link. The custom templates in
// the README arrive with a `token_hash`, which works on any device.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (!code && !(tokenHash && type)) return redirectTo("/login?error=link_expired")

  const supabase = await createClient()
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash as string, type: type as EmailOtpType })
  if (error || !data.user?.email) return redirectTo("/login?error=link_expired")

  const { data: member } = await createAdminClient()
    .from("team_members")
    .update({ last_login_at: new Date().toISOString() })
    .eq("email", data.user.email)
    .select("id")
    .maybeSingle()

  if (!member) {
    await supabase.auth.signOut()
    return redirectTo("/login?error=not_invited")
  }

  return redirectTo("/subscribers")
}
