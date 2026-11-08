import { createClient } from "@supabase/supabase-js"

import { requireEnv } from "@/lib/env"

// Service role: bypasses row-level security. Server-only, for public endpoints and sync.
export function createAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
