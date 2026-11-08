import { createHmac, timingSafeEqual } from "node:crypto"

// Tokens don't expire: CAN-SPAM requires links in old emails to keep working.
function sign(subscriberId: string, secret: string) {
  return createHmac("sha256", secret).update(`unsubscribe:${subscriberId}`).digest("base64url")
}

export function createUnsubscribeToken(subscriberId: string, secret: string) {
  return `${Buffer.from(subscriberId).toString("base64url")}.${sign(subscriberId, secret)}`
}

export function verifyUnsubscribeToken(token: string, secret: string) {
  const [encodedId, signature, ...rest] = token.split(".")
  if (!encodedId || !signature || rest.length > 0) return null

  const subscriberId = Buffer.from(encodedId, "base64url").toString()
  const expected = Buffer.from(sign(subscriberId, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  return subscriberId
}

// Every send in Phase 2 attaches these for one-click unsubscribe (RFC 8058).
export function listUnsubscribeHeaders(subscriberId: string, secret: string, appUrl: string) {
  const token = createUnsubscribeToken(subscriberId, secret)
  return {
    "List-Unsubscribe": `<${appUrl}/api/unsubscribe?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}
