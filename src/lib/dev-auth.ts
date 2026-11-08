// Skips sign-in while building locally. Only `next dev` sets NODE_ENV to development,
// so a build can never turn this on, and the dev scripts bind to 127.0.0.1 because
// everything then runs with the service role.
export function devAuthEmail(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "development" || env.VERCEL) return null
  return env.DEV_AUTH_EMAIL?.trim().toLowerCase() || null
}
