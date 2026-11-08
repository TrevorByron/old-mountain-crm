import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { devAuthEmail } from "@/lib/dev-auth"
import { requireEnv } from "@/lib/env"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  if (devAuthEmail()) return response

  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return response
}

// Public paths stay out: login, the magic-link callback, unsubscribe, all API routes and
// the images inside sent emails, which load for people who aren't signed in.
export const config = {
  matcher: ["/((?!api|login|auth|unsubscribe|email/|_next/static|_next/image|favicon.ico).*)"],
}
