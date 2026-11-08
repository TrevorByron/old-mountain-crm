import { NextResponse, type NextRequest } from "next/server"

import { requireEnv } from "@/lib/env"
import { unsubscribeSubscriber } from "@/lib/unsubscribe"
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token"

// One-click unsubscribe from mail clients (RFC 8058).
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? ""
  const subscriberId = verifyUnsubscribeToken(token, requireEnv("UNSUBSCRIBE_TOKEN_SECRET"))
  if (!subscriberId) return NextResponse.json({ error: "Invalid token" }, { status: 400 })

  await unsubscribeSubscriber(subscriberId, "one_click_unsubscribe")
  return NextResponse.json({ ok: true })
}

// Link scanners follow GET requests, so this only opens the confirmation page.
export async function GET(request: NextRequest) {
  const url = new URL("/unsubscribe", request.url)
  url.searchParams.set("token", request.nextUrl.searchParams.get("token") ?? "")
  return NextResponse.redirect(url)
}
