import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { requireEnv } from "@/lib/env"

// Acts as the signed-in user, so row-level security applies.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components can't set cookies. The proxy refreshes the session instead.
          }
        },
      },
    }
  )
}
