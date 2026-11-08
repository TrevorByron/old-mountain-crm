import { describe, expect, it } from "vitest"

import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token"

import { LAYOUTS, missingContent, type BroadcastContent } from "./content"
import {
  batchIdempotencyKey,
  composeEmail,
  previewHtml,
  sendBlockers,
  splitBatch,
  type QueuedSend,
  type SendConfig,
} from "./compose"

const CONFIG: SendConfig = {
  from: "Trevor Borden <trevor@mail.old-mountain.com>",
  brandName: "Old Mountain Tours & Explorations",
  postalAddress: "48 Patton Ave, Asheville, NC 28801",
  appUrl: "https://crm.old-mountain.com",
  unsubscribeSecret: "test-secret",
}

const CONTENT: BroadcastContent = {
  subject: "Two seats left for July 2027",
  preheader: "The Serengeti departure is nearly full.",
  heading: "July in the Serengeti",
  body_markdown: "We have **two seats** left on the July departure.\n\n- Tented camps\n- Walking safaris",
  cta_label: "Hold my seat",
  cta_url: "https://www.old-mountain.com/july-2027",
  image_url: "https://www.old-mountain.com/serengeti.jpg",
  image_alt: "Wildebeest crossing the Mara River",
}

const RECIPIENT = { id: "3f0f8a52-6a14-4c55-8d39-7b1f5d0e9a11", email: "amara.diallo@example.com" }

describe.each(LAYOUTS.map((layout) => layout.key))("%s layout", (layout) => {
  it("carries everything CAN-SPAM requires", async () => {
    const email = await composeEmail(layout, CONTENT, RECIPIENT, CONFIG)
    const link = email.html.match(/href="([^"]*\/unsubscribe\?token=[^"]+)"/)?.[1]

    expect(link).toBeDefined()
    const token = new URL(link as string).searchParams.get("token") as string
    expect(verifyUnsubscribeToken(token, CONFIG.unsubscribeSecret)).toBe(RECIPIENT.id)
    expect(email.html).toContain("48 Patton Ave, Asheville, NC 28801")
    expect(email.text).toContain("48 Patton Ave, Asheville, NC 28801")
    expect(email.text).toContain("/unsubscribe?token=")
    expect(email.headers["List-Unsubscribe"]).toBe(`<${CONFIG.appUrl}/api/unsubscribe?token=${token}>`)
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(email.from).toBe(CONFIG.from)
    expect(email.subject).toBe(CONTENT.subject)
  })

  it("renders the content", async () => {
    const { html } = await composeEmail(layout, CONTENT, RECIPIENT, CONFIG)
    expect(html).toContain("July in the Serengeti")
    expect(html).toContain("<strong")
    expect(html).toContain("https://www.old-mountain.com/july-2027")
  })
})

describe("composeEmail", () => {
  it("only shows the photo in the trip spotlight", async () => {
    const trip = await composeEmail("trip_spotlight", CONTENT, RECIPIENT, CONFIG)
    const letter = await composeEmail("letter", CONTENT, RECIPIENT, CONFIG)
    expect(trip.html).toContain("serengeti.jpg")
    expect(letter.html).not.toContain("serengeti.jpg")
  })

  it("doesn't let raw HTML from the body through", async () => {
    const { html } = await composeEmail(
      "letter",
      { ...CONTENT, body_markdown: 'Hello <script>alert("x")</script><img src=x onerror=alert(1)>' },
      RECIPIENT,
      CONFIG
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<img src=x")
  })

  it("leaves the button out unless it has a label and a link", async () => {
    const { html } = await composeEmail("announcement", { ...CONTENT, cta_label: null }, RECIPIENT, CONFIG)
    expect(html).not.toContain("https://www.old-mountain.com/july-2027")
  })

  it("is identical on a retry, so Resend's idempotency key still matches", async () => {
    const first = await composeEmail("announcement", CONTENT, RECIPIENT, CONFIG)
    const second = await composeEmail("announcement", CONTENT, RECIPIENT, CONFIG)
    expect(second).toEqual(first)
  })

  it("marks test sends in the subject", async () => {
    const email = await composeEmail("letter", CONTENT, RECIPIENT, CONFIG, { subjectPrefix: "[Test] " })
    expect(email.subject).toBe("[Test] Two seats left for July 2027")
  })
})

describe("previewHtml", () => {
  it("says when the postal address is missing", async () => {
    expect(await previewHtml("letter", CONTENT, { APP_URL: "http://localhost:3100" })).toContain(
      "Postal address not set yet"
    )
  })
})

describe("sendBlockers", () => {
  const READY = {
    RESEND_API_KEY: "re_test",
    SENDER_FROM: CONFIG.from,
    SENDER_POSTAL_ADDRESS: CONFIG.postalAddress,
    UNSUBSCRIBE_TOKEN_SECRET: "secret",
    APP_URL: "https://crm.old-mountain.com",
  }

  it("passes when everything is set", () => {
    expect(sendBlockers(READY, { realRecipients: true })).toEqual([])
  })

  it.each(Object.keys(READY))("blocks when %s is missing", (key) => {
    expect(sendBlockers({ ...READY, [key]: undefined }, { realRecipients: false })).toHaveLength(1)
  })

  it("treats a blank postal address as missing", () => {
    expect(sendBlockers({ ...READY, SENDER_POSTAL_ADDRESS: "  " }, { realRecipients: false })).toHaveLength(1)
  })

  it.each(["http://localhost:3100", "http://127.0.0.1:3100", "http://[::1]:3100", "http://localhost"])(
    "stops real recipients on %s, but allows tests",
    (APP_URL) => {
      expect(sendBlockers({ ...READY, APP_URL }, { realRecipients: true })).toHaveLength(1)
      expect(sendBlockers({ ...READY, APP_URL }, { realRecipients: false })).toEqual([])
    }
  )

  it("doesn't mistake a real domain for localhost", () => {
    expect(sendBlockers({ ...READY, APP_URL: "https://localhost-tours.com" }, { realRecipients: true })).toEqual([])
  })
})

describe("missingContent", () => {
  it("accepts a complete broadcast", () => {
    expect(missingContent(CONTENT, "trip_spotlight")).toEqual([])
  })

  it("needs a subject and body", () => {
    expect(missingContent({ ...CONTENT, subject: null, body_markdown: null }, "letter")).toHaveLength(2)
  })

  it("needs the button's label and link together", () => {
    expect(missingContent({ ...CONTENT, cta_url: null }, "letter")).toHaveLength(1)
    expect(missingContent({ ...CONTENT, cta_label: null, cta_url: null }, "letter")).toEqual([])
  })

  it("needs a photo only for the trip spotlight", () => {
    expect(missingContent({ ...CONTENT, image_url: null }, "trip_spotlight")).toHaveLength(1)
    expect(missingContent({ ...CONTENT, image_url: null }, "letter")).toEqual([])
  })
})

describe("batchIdempotencyKey", () => {
  it("is stable for the same recipients in any order", () => {
    expect(batchIdempotencyKey("b1", ["a", "b"])).toBe(batchIdempotencyKey("b1", ["b", "a"]))
  })

  it("differs by broadcast and recipients, and fits Resend's 256 characters", () => {
    expect(batchIdempotencyKey("b1", ["a"])).not.toBe(batchIdempotencyKey("b2", ["a"]))
    expect(batchIdempotencyKey("b1", ["a"])).not.toBe(batchIdempotencyKey("b1", ["a", "b"]))
    expect(batchIdempotencyKey("3f0f8a52-6a14-4c55-8d39-7b1f5d0e9a11", ["a"]).length).toBeLessThanOrEqual(256)
  })
})

describe("splitBatch", () => {
  const row = (id: string, overrides: Partial<QueuedSend["subscribers"]> = {}): QueuedSend => ({
    id,
    subscriber_id: `sub-${id}`,
    subscribers: { email: `${id}@example.com`, unsubscribed_at: null, suppressed: false, ...overrides },
  })

  it("drops anyone who opted out after the audience was resolved", () => {
    const { recipients, optedOutSendIds } = splitBatch([
      row("ok"),
      row("left", { unsubscribed_at: "2026-11-08T00:00:00Z" }),
      row("bounced", { suppressed: true }),
    ])
    expect(recipients).toEqual([{ sendId: "ok", subscriberId: "sub-ok", email: "ok@example.com" }])
    expect(optedOutSendIds).toEqual(["left", "bounced"])
  })
})
