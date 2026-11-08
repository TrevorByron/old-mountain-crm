import { describe, expect, it } from "vitest"

import { devAuthEmail } from "./dev-auth"

describe("devAuthEmail", () => {
  it("applies in local development when an email is set", () => {
    expect(devAuthEmail({ NODE_ENV: "development", DEV_AUTH_EMAIL: " Heather@Old-Mountain.com " })).toBe(
      "heather@old-mountain.com"
    )
  })

  it("is off without an email", () => {
    expect(devAuthEmail({ NODE_ENV: "development" })).toBeNull()
    expect(devAuthEmail({ NODE_ENV: "development", DEV_AUTH_EMAIL: "  " })).toBeNull()
  })

  it.each(["production", "test", undefined])("is off when NODE_ENV is %s", (NODE_ENV) => {
    expect(devAuthEmail({ NODE_ENV, DEV_AUTH_EMAIL: "heather@old-mountain.com" })).toBeNull()
  })

  it("is off on Vercel, even in development mode", () => {
    expect(devAuthEmail({ NODE_ENV: "development", VERCEL: "1", DEV_AUTH_EMAIL: "heather@old-mountain.com" })).toBeNull()
  })
})
