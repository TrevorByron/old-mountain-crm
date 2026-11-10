import { describe, expect, it } from "vitest"

import { canBeEmailed, emailStatus } from "./people"

const person = { email: "a@example.com", marketing_ok: true, unsubscribed_at: null, suppressed: false, suppressed_reason: null }

describe("emailStatus", () => {
  it("is active when they can get marketing email", () => {
    expect(emailStatus(person)).toBe("active")
    expect(canBeEmailed(person)).toBe(true)
  })

  it("explains why someone won't get email, most serious first", () => {
    expect(emailStatus({ ...person, suppressed: true, suppressed_reason: "hard_bounce" })).toBe("bounced")
    expect(emailStatus({ ...person, suppressed: true, suppressed_reason: "complaint" })).toBe("complained")
    expect(emailStatus({ ...person, suppressed: true, suppressed_reason: "manual" })).toBe("suppressed")
    expect(emailStatus({ ...person, suppressed: true, unsubscribed_at: "2026-01-01" })).toBe("suppressed")
    expect(emailStatus({ ...person, unsubscribed_at: "2026-01-01" })).toBe("unsubscribed")
    expect(emailStatus({ ...person, email: null })).toBe("no_email")
    expect(emailStatus({ ...person, marketing_ok: false })).toBe("not_opted_in")
    expect(canBeEmailed({ ...person, marketing_ok: false })).toBe(false)
  })
})
