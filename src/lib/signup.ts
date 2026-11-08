import { z } from "zod"

import { normalizeEmail, splitName } from "@/lib/airtable/sync-plan"

const signupSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  name: z.string().trim().max(200).optional(),
  source: z.string().trim().max(100).optional(),
  // Honeypot: hidden from people on the form, so only bots fill it in.
  website: z.string().optional(),
})

export type SignupResult =
  | { kind: "invalid" }
  | { kind: "bot" }
  | {
      kind: "valid"
      subscriber: { email: string; first_name: string | null; last_name: string | null; source: string }
    }

export function parseSignup(body: unknown): SignupResult {
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) return { kind: "invalid" }
  if (parsed.data.website) return { kind: "bot" }

  return {
    kind: "valid",
    subscriber: {
      email: normalizeEmail(parsed.data.email) as string,
      ...splitName(parsed.data.name ?? null),
      source: parsed.data.source || "website",
    },
  }
}

// Fails closed: with no allowlist configured, no site can post.
export function isAllowedOrigin(origin: string | null, allowlist: string | undefined) {
  if (!origin || !allowlist) return false
  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .includes(origin)
}
