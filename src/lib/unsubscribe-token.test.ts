import { describe, expect, it } from "vitest"

import { createUnsubscribeToken, listUnsubscribeHeaders, verifyUnsubscribeToken } from "./unsubscribe-token"

const SECRET = "test-secret-for-unsubscribe-tokens"
const ID = "3f8a1c2e-5b7d-4e91-a6c3-0d2f9b8e7a11"

describe("unsubscribe tokens", () => {
  it("round-trips a subscriber id", () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(ID, SECRET), SECRET)).toBe(ID)
  })

  it("rejects a token signed with another secret", () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(ID, "other-secret"), SECRET)).toBeNull()
  })

  it("rejects a token with a swapped subscriber id", () => {
    const [, signature] = createUnsubscribeToken(ID, SECRET).split(".")
    const forged = `${Buffer.from("another-subscriber").toString("base64url")}.${signature}`
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull()
  })

  it.each(["", "abc", "abc.", ".abc", "a.b.c"])("rejects malformed token %j", (token) => {
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it("builds one-click headers that carry a valid token", () => {
    const headers = listUnsubscribeHeaders(ID, SECRET, "https://crm.example.com")
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    const token = headers["List-Unsubscribe"].match(/token=([^>]+)>/)?.[1] ?? ""
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(ID)
  })
})
