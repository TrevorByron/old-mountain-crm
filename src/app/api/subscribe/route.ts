import { createHash } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { pushToAirtable } from "@/lib/airtable/sync"
import { requireEnv } from "@/lib/env"
import { isAllowedOrigin, parseSignup } from "@/lib/signup"
import { createAdminClient } from "@/lib/supabase/admin"

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}

async function readBody(request: NextRequest) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    return request.json().catch(() => null)
  }
  return Object.fromEntries((await request.formData().catch(() => new FormData())).entries())
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin || !isAllowedOrigin(origin, process.env.SIGNUP_ALLOWED_ORIGINS)) {
    return new NextResponse(null, { status: 403 })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin || !isAllowedOrigin(origin, process.env.SIGNUP_ALLOWED_ORIGINS)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 })
  }
  const headers = corsHeaders(origin)
  const admin = createAdminClient()

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const ipHash = createHash("sha256").update(`${ip}:${requireEnv("UNSUBSCRIBE_TOKEN_SECRET")}`).digest("hex")
  const { data: allowed, error: limitError } = await admin.rpc("check_rate_limit", {
    limit_key: `signup:${ipHash}`,
    max_requests: RATE_LIMIT_MAX,
    window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  })
  if (limitError) return NextResponse.json({ error: "Something went wrong" }, { status: 500, headers })
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers })

  const signup = parseSignup(await readBody(request))
  if (signup.kind === "invalid") {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400, headers })
  }
  // Bots and existing contacts get the same answer as a new signup, so this
  // endpoint can't reveal who's on the list.
  if (signup.kind === "bot") return NextResponse.json({ ok: true }, { headers })

  // ignoreDuplicates leaves existing rows alone, so signing up again can't undo an opt-out.
  const { data: inserted, error } = await admin
    .from("subscribers")
    .upsert(
      { ...signup.subscriber, status: "New", airtable_push_pending: true, last_changed_by: "signup_form" },
      { onConflict: "email", ignoreDuplicates: true }
    )
    .select("id")
  if (error) return NextResponse.json({ error: "Something went wrong" }, { status: 500, headers })

  if (inserted.length > 0) await pushToAirtable(inserted[0].id)
  // Someone the team added by hand has now asked for email themselves. Opt-outs still hold.
  else await admin.from("subscribers").update({ marketing_ok: true }).eq("email", signup.subscriber.email).eq("marketing_ok", false)

  return NextResponse.json({ ok: true }, { headers })
}
