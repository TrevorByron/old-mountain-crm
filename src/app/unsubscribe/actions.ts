"use server"

import { redirect } from "next/navigation"

import { requireEnv } from "@/lib/env"
import { unsubscribeSubscriber } from "@/lib/unsubscribe"
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token"

export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "")
  const subscriberId = verifyUnsubscribeToken(token, requireEnv("UNSUBSCRIBE_TOKEN_SECRET"))
  if (!subscriberId) redirect("/unsubscribe")

  await unsubscribeSubscriber(subscriberId, "unsubscribe_page")
  redirect("/unsubscribe?done=1")
}
