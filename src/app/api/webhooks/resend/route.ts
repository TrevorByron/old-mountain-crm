import { NextResponse, type NextRequest } from "next/server"
import type { WebhookEventPayload } from "resend"

import { recordResendEvent } from "@/lib/broadcasts/webhook"
import { resendClient } from "@/lib/broadcasts/sending"
import { requireEnv } from "@/lib/env"

// Deliveries, opens, clicks, bounces and complaints from Resend. The signature proves it's them.
export async function POST(request: NextRequest) {
  const deliveryId = request.headers.get("svix-id")
  const timestamp = request.headers.get("svix-timestamp")
  const signature = request.headers.get("svix-signature")
  if (!deliveryId || !timestamp || !signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 })

  const body = await request.text()
  let payload: WebhookEventPayload
  try {
    payload = resendClient().webhooks.verify({
      payload: body,
      headers: { id: deliveryId, timestamp, signature },
      webhookSecret: requireEnv("RESEND_WEBHOOK_SECRET"),
    })
  } catch (error) {
    console.error("Rejected a Resend webhook:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const outcome = await recordResendEvent(deliveryId, payload)
  if (outcome === "retry") return NextResponse.json({ error: "Send not found yet" }, { status: 503 })
  return NextResponse.json({ ok: true })
}
