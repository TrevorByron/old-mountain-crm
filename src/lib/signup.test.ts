import { describe, expect, it } from "vitest"

import { isAllowedOrigin, parseSignup } from "./signup"

describe("parseSignup", () => {
  it("normalizes a valid signup", () => {
    expect(parseSignup({ email: " Mara.Okafor@Example.com ", name: "Mara Okafor", source: "safari-landing" })).toEqual({
      kind: "valid",
      subscriber: {
        email: "mara.okafor@example.com",
        first_name: "Mara",
        last_name: "Okafor",
        source: "safari-landing",
      },
    })
  })

  it("defaults the source and allows a missing name", () => {
    expect(parseSignup({ email: "davi.quinn@example.com" })).toMatchObject({
      subscriber: { first_name: null, source: "website" },
    })
  })

  it("flags a filled honeypot as a bot", () => {
    expect(parseSignup({ email: "davi.quinn@example.com", website: "https://spam.example" }).kind).toBe("bot")
  })

  it.each([{}, { email: "not an email" }, { email: 42 }, null, { email: `${"a".repeat(260)}@example.com` }])(
    "rejects %j",
    (body) => {
      expect(parseSignup(body).kind).toBe("invalid")
    }
  )
})

describe("isAllowedOrigin", () => {
  const allowlist = "https://www.example.com, https://example.com"

  it("allows listed origins", () => {
    expect(isAllowedOrigin("https://example.com", allowlist)).toBe(true)
  })

  it("rejects others, including lookalikes and subdomains", () => {
    expect(isAllowedOrigin("https://example.com.evil.test", allowlist)).toBe(false)
    expect(isAllowedOrigin("https://shop.example.com", allowlist)).toBe(false)
    expect(isAllowedOrigin("http://example.com", allowlist)).toBe(false)
  })

  it("fails closed with no origin or no allowlist", () => {
    expect(isAllowedOrigin(null, allowlist)).toBe(false)
    expect(isAllowedOrigin("https://example.com", undefined)).toBe(false)
    expect(isAllowedOrigin("https://example.com", "")).toBe(false)
  })
})
