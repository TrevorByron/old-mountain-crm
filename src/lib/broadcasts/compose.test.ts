import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token"

import { blockSchema, emailContentSchema, emptyDoc, newBlock, type RichNode } from "./blocks"
import {
  applyMergeTags,
  batchIdempotencyKey,
  composeEmail,
  previewHtml,
  sendBlockers,
  splitBatch,
  type QueuedSend,
  type SendConfig,
} from "./compose"
import { LAYOUTS, checkBroadcast, starterContent } from "./content"
import { EMAIL_PHOTOS } from "./photos"

const CONFIG: SendConfig = {
  from: "Trevor Borden <trevor@mail.old-mountain.com>",
  brandName: "Old Mountain Tours & Explorations",
  postalAddress: "48 Patton Ave, Asheville, NC 28801",
  appUrl: "https://crm.old-mountain.com",
  unsubscribeSecret: "test-secret",
}

const RECIPIENT = { id: "3f0f8a52-6a14-4c55-8d39-7b1f5d0e9a11", email: "amara.diallo@example.com", firstName: "Amara" }

const docWith = (...content: RichNode[]): RichNode => ({ type: "doc", content })
const para = (...content: RichNode[]): RichNode => ({ type: "paragraph", content })
const words = (text: string, marks?: RichNode["marks"]): RichNode => ({ type: "text", text, marks })

function contentOf(...blocks: Record<string, unknown>[]) {
  return emailContentSchema.parse({
    blocks: blocks.map((block, index) => blockSchema.parse({ id: `b${index}`, ...block })),
  })
}

const compose = (content = contentOf({ type: "text", doc: emptyDoc("July in the Serengeti") }), recipient = RECIPIENT) =>
  composeEmail({ subject: "Two seats left", preheader: "Nearly full.", content }, recipient, CONFIG)

const CASES: [string, ReturnType<typeof contentOf>][] = [
  ...LAYOUTS.map((layout): [string, ReturnType<typeof contentOf>] => [layout.name, starterContent(layout.key)]),
  ["an email with every block removed", contentOf()],
]

describe.each(CASES)("%s", (_, content) => {
  it("carries everything CAN-SPAM requires, and it can't be removed", async () => {
    const email = await compose(content)
    const link = email.html.match(/href="([^"]*\/unsubscribe\?token=[^"]+)"/)?.[1]

    expect(link).toBeDefined()
    const token = new URL(link as string).searchParams.get("token") as string
    expect(verifyUnsubscribeToken(token, CONFIG.unsubscribeSecret)).toBe(RECIPIENT.id)
    expect(email.html).toContain("48 Patton Ave, Asheville, NC 28801")
    expect(email.text).toContain("48 Patton Ave, Asheville, NC 28801")
    expect(email.text).toContain("/unsubscribe?token=")
    expect(email.headers["List-Unsubscribe"]).toBe(`<${CONFIG.appUrl}/api/unsubscribe?token=${token}>`)
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })
})

describe("rich text", () => {
  const html = async (doc: RichNode) => (await compose(contentOf({ type: "text", doc }))).html

  it("renders bold, italic, underline and links", async () => {
    const output = await html(
      docWith(
        para(
          words("bold", [{ type: "bold" }]),
          words("italic", [{ type: "italic" }]),
          words("under", [{ type: "underline" }]),
          words("site", [{ type: "link", attrs: { href: "https://www.old-mountain.com/trip" } }])
        )
      )
    )
    expect(output).toContain("<strong")
    expect(output).toContain("<em")
    expect(output).toContain("<u")
    expect(output).toContain('href="https://www.old-mountain.com/trip"')
  })

  it("applies brand fonts, colors and sizes", async () => {
    const output = await html(
      docWith(
        para(
          words("styled", [
            { type: "textStyle", attrs: { color: "#C4A96B", fontFamily: "Georgia, 'Times New Roman', Times, serif", fontSize: "30px" } },
          ])
        )
      )
    )
    expect(output).toContain("color:#C4A96B")
    expect(output).toMatch(/font-family:Georgia/)
    expect(output).toContain("font-size:30px")
  })

  it("drops fonts, colors and sizes outside the brand", async () => {
    const output = await html(
      docWith(para(words("pasted", [{ type: "textStyle", attrs: { color: "#ff00ff", fontFamily: "Comic Sans MS", fontSize: "99px" } }])))
    )
    expect(output).toContain("pasted")
    expect(output).not.toContain("#ff00ff")
    expect(output).not.toContain("Comic Sans")
    expect(output).not.toContain("99px")
  })

  it("won't carry a style attack through an allowed-looking value", async () => {
    const output = await html(docWith(para(words("x", [{ type: "textStyle", attrs: { color: "red;background:url(evil)" } }]))))
    expect(output).not.toContain("url(evil)")
    expect(output).not.toContain("color:red")
  })

  it("removes dangerous links but keeps their words", async () => {
    const output = await html(docWith(para(words("tap me", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))))
    expect(output).toContain("tap me")
    expect(output).not.toContain("javascript:")
  })

  it("shows typed HTML as text instead of running it", async () => {
    const output = await html(docWith(para(words('<script>alert("x")</script><img src=x onerror=alert(1)>'))))
    expect(output).not.toContain("<script")
    expect(output).not.toContain("<img src=x")
  })

  it("keeps the words of node types it doesn't know", async () => {
    const output = await html(docWith({ type: "strangeWidget", content: [para(words("still here"))] }))
    expect(output).toContain("still here")
    expect(output).not.toContain("strangeWidget")
  })

  it("makes lists and aligned headings", async () => {
    const output = await html(
      docWith(
        { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [words("Big")] },
        { type: "bulletList", content: [{ type: "listItem", content: [para(words("one"))] }] }
      )
    )
    expect(output).toMatch(/<h1[^>]*text-align:center/)
    expect(output).toContain("<ul")
    expect(output).toContain("<li")
  })
})

describe("merge tags", () => {
  it("uses their first name", () => {
    expect(applyMergeTags("Hi {{first_name|friends}},", "Amara", { html: false })).toBe("Hi Amara,")
  })

  it("falls back to the words after the bar, then to a default", () => {
    expect(applyMergeTags("Hi {{first_name|friends and family}},", null, { html: false })).toBe("Hi friends and family,")
    expect(applyMergeTags("Hi {{ first_name }},", "  ", { html: false })).toBe("Hi there,")
  })

  it("escapes names on their way into HTML, since they come from form answers", () => {
    expect(applyMergeTags("Hi {{first_name}}", "<img src=x>", { html: true })).toBe("Hi &lt;img src=x&gt;")
    expect(applyMergeTags("Hi {{first_name}}", "<img src=x>", { html: false })).toBe("Hi <img src=x>")
  })

  it("reaches the subject, body and plain text of a real email", async () => {
    const email = await composeEmail(
      { subject: "{{first_name|Friend}}, two seats left", preheader: null, content: contentOf({ type: "text", doc: emptyDoc("Hi {{first_name|friend}},") }) },
      RECIPIENT,
      CONFIG
    )
    expect(email.subject).toBe("Amara, two seats left")
    expect(email.html).toContain("Hi Amara,")
    expect(email.text).toContain("Hi Amara,")
    expect(email.html).not.toContain("{{")
  })

  it("doesn't leave a raw tag in the preview", async () => {
    const html = await previewHtml(contentOf({ type: "text", doc: emptyDoc("Hi {{first_name|friend}},") }), null, { APP_URL: "http://localhost:3100" })
    expect(html).toContain("Hi friend,")
  })
})

describe("photo blocks", () => {
  const src = "https://example.supabase.co/storage/v1/object/public/email-images/crops/a.jpg"

  it("sizes, aligns and rounds as asked", async () => {
    const { html } = await compose(contentOf({ type: "image", src, alt: "Elephants", width: 50, align: "right", rounded: true }))
    expect(html).toContain(`src="${src}"`)
    expect(html).toContain('alt="Elephants"')
    expect(html).toContain("width:50%")
    expect(html).toContain("border-radius:12px")
    expect(html).toContain("margin-left:auto")
  })

  it("runs edge to edge when asked", async () => {
    const { html } = await compose(contentOf({ type: "image", src, bleed: true, spacing: "none" }))
    expect(html).toContain('width="600"')
    expect(html).toContain("padding:0px 0px")
  })

  it("can link somewhere", async () => {
    const { html } = await compose(contentOf({ type: "image", src, link: "https://www.old-mountain.com" }))
    expect(html).toMatch(/<a[^>]*href="https:\/\/www\.old-mountain\.com"[^>]*>\s*<img/)
  })

  it("renders nothing until it has a photo", async () => {
    const { html } = await compose(contentOf({ type: "image" }))
    expect(html).not.toContain(`alt=""  src=""`)
    expect(html).not.toContain('src=""')
  })

  it("puts text beside a photo in columns that stack on phones", async () => {
    const { html } = await compose(contentOf({ type: "image_text", src, alt: "Camp", doc: emptyDoc("Beside it") }))
    expect(html).toContain("display:inline-block")
    expect(html).toContain("max-width:256px")
    expect(html.indexOf(src)).toBeLessThan(html.indexOf("Beside it"))
  })

  it("can put the photo on the right", async () => {
    const { html } = await compose(contentOf({ type: "image_text", side: "right", src, doc: emptyDoc("Beside it") }))
    expect(html.indexOf("Beside it")).toBeLessThan(html.indexOf(src))
  })

  it("resolves a library photo to the app's address", async () => {
    const { html } = await compose(contentOf({ type: "image", src: EMAIL_PHOTOS[0].path, alt: "Lions" }))
    expect(html).toContain(`src="${CONFIG.appUrl}${EMAIL_PHOTOS[0].path}"`)
  })

  it("has a file behind every library photo and its original", () => {
    for (const photo of EMAIL_PHOTOS) {
      expect(existsSync(join(process.cwd(), "public", photo.path)), photo.path).toBe(true)
      expect(existsSync(join(process.cwd(), "public", photo.original)), photo.original).toBe(true)
      expect(photo.alt).not.toBe("")
    }
  })

  it("accepts uploads and library paths, but no other paths", () => {
    const parse = (value: string) => blockSchema.safeParse({ id: "a", type: "image", src: value }).success
    expect(parse(EMAIL_PHOTOS[0].path)).toBe(true)
    expect(parse(src)).toBe(true)
    expect(parse("/subscribers")).toBe(false)
    expect(parse("/email/photos/../../secret.jpg")).toBe(false)
    expect(parse("javascript:alert(1)")).toBe(false)
  })
})

describe("other blocks", () => {
  it("uses the real logo files", async () => {
    const { html } = await compose(contentOf({ type: "logo", variant: "lockup" }))
    expect(html).toContain(`${CONFIG.appUrl}/email/logo-lockup.png`)
  })

  it("styles buttons from the brand and can run full width", async () => {
    const { html } = await compose(contentOf({ type: "button", label: "Hold my seat", url: "https://www.old-mountain.com", style: "olive", fullWidth: true }))
    expect(html).toContain("Hold my seat")
    expect(html.toLowerCase()).toContain("background-color:#2c3a22")
    expect(html).toContain("display:block")
  })

  it("never renders a dangerous link, even though a half-typed one can be saved", async () => {
    const content = contentOf(
      { type: "button", label: "Go", url: "javascript:alert(1)" },
      { type: "image", src: EMAIL_PHOTOS[0].path, link: "javascript:alert(2)" },
      { type: "links", items: [{ label: "Bad", url: "javascript:alert(3)" }] }
    )
    expect((await compose(content)).html).not.toContain("javascript:")
  })

  it("adds https to a bare web address", async () => {
    const { html } = await compose(contentOf({ type: "button", label: "Go", url: "www.old-mountain.com/trip" }))
    expect(html).toContain('href="https://www.old-mountain.com/trip"')
  })

  it("renders dividers, spacers and link rows", async () => {
    const { html } = await compose(
      contentOf({ type: "divider", color: "gold" }, { type: "spacer", spacing: "large" }, { type: "links", items: [{ label: "Instagram", url: "https://www.instagram.com/old.mountain.tours" }] })
    )
    expect(html.toLowerCase()).toContain("#c4a96b")
    expect(html).toContain("height:40px")
    expect(html).toContain("Instagram")
  })

  it("makes every new block valid", () => {
    for (const type of ["text", "image", "image_text", "button", "logo", "divider", "spacer", "links"] as const) {
      expect(blockSchema.safeParse(newBlock(type)).success, type).toBe(true)
    }
  })

  it("uses light text on a dark background", async () => {
    const { html } = await compose(contentOf({ type: "text", background: "dark", doc: emptyDoc("On dark") }))
    expect(html.toLowerCase()).toContain("color:#f0e6d3")
  })

  it("shows placeholders for empty blocks in the editor, never in a real email", async () => {
    const content = contentOf({ type: "image" }, { type: "button" }, { type: "text", doc: emptyDoc() })
    const preview = await previewHtml(content, null, { APP_URL: "http://localhost:3100" })
    expect(preview).toContain("Add a photo")
    expect(preview).toContain("Add a button label")
    expect(preview).toContain("Click to write")
    const { html } = await compose(content)
    expect(html).not.toContain("Add a photo")
    expect(html).not.toContain("Add a button label")
    expect(html).not.toContain("Click to write")
  })

  it("marks blocks for clicking only in the editor, never in a real email", async () => {
    const content = contentOf({ type: "text", doc: emptyDoc("Hello") })
    expect((await compose(content)).html).not.toContain("data-block-id")
    expect(await previewHtml(content, null, { APP_URL: "http://localhost:3100" })).toContain('data-block-id="b0"')
  })
})

describe("composeEmail", () => {
  it("sends replies to a real inbox when one is set", async () => {
    const input = { subject: "Hi", preheader: null, content: contentOf() }
    expect(await composeEmail(input, RECIPIENT, { ...CONFIG, replyTo: "trevor@old-mountain.com" })).toMatchObject({ replyTo: "trevor@old-mountain.com" })
    expect(await composeEmail(input, RECIPIENT, CONFIG)).not.toHaveProperty("replyTo")
  })

  it("is identical on a retry, so Resend's idempotency key still matches", async () => {
    const content = starterContent("letter")
    expect(await compose(content)).toEqual(await compose(content))
  })

  it("marks test sends in the subject", async () => {
    const email = await composeEmail({ subject: "Two seats left", preheader: null, content: contentOf() }, RECIPIENT, CONFIG, { subjectPrefix: "[Test] " })
    expect(email.subject).toBe("[Test] Two seats left")
  })
})

describe("previewHtml", () => {
  it("says when the postal address is missing", async () => {
    expect(await previewHtml(contentOf(), null, { APP_URL: "http://localhost:3100" })).toContain("Postal address not set yet")
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

  const LIVE = { ...READY, SENDER_REPLY_TO: "trevor@old-mountain.com" }

  it("passes when everything is set", () => {
    expect(sendBlockers(LIVE, { realRecipients: true })).toEqual([])
  })

  it("needs an inbox for replies before reaching real people, but not for tests", () => {
    expect(sendBlockers(READY, { realRecipients: true })[0]).toContain("SENDER_REPLY_TO")
    expect(sendBlockers(READY, { realRecipients: false })).toEqual([])
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
      expect(sendBlockers({ ...LIVE, APP_URL }, { realRecipients: true })).toHaveLength(1)
      expect(sendBlockers({ ...READY, APP_URL }, { realRecipients: false })).toEqual([])
    }
  )

  it("doesn't mistake a real domain for localhost", () => {
    expect(sendBlockers({ ...LIVE, APP_URL: "https://localhost-tours.com" }, { realRecipients: true })).toEqual([])
  })
})

describe("checkBroadcast", () => {
  const good = {
    subject: "Two seats left for July",
    preheader: "The departure is nearly full.",
    content: contentOf({ type: "text", doc: emptyDoc("We have two seats left on the July departure, and we would love to talk about it with you soon.") }),
  }

  it("passes a complete email", () => {
    expect(checkBroadcast(good)).toEqual({ errors: [], warnings: [], issues: [] })
  })

  it("stops a send with no subject or no words", () => {
    expect(checkBroadcast({ ...good, subject: " " }).errors).toHaveLength(1)
    expect(checkBroadcast({ ...good, content: contentOf() }).errors).toHaveLength(1)
  })

  it("stops a send with an empty photo or an unfinished button", () => {
    const content = contentOf({ type: "text", doc: emptyDoc("Words") }, { type: "image" }, { type: "button", label: "Go" })
    expect(checkBroadcast({ ...good, content }).errors).toHaveLength(2)
  })

  it.each(LAYOUTS.map((layout) => layout.key))("won't send the %s template's placeholder text", (layout) => {
    const { errors } = checkBroadcast({ ...good, content: starterContent(layout) })
    expect(errors).toContain("Replace the template's placeholder text.")
  })

  it("stops a send over a link that can't be used", () => {
    const content = contentOf(
      { type: "text", doc: emptyDoc("Words") },
      { type: "button", label: "Go", url: "htt" },
      { type: "image", src: EMAIL_PHOTOS[0].path, alt: "Lions", link: "javascript:alert(1)" }
    )
    expect(checkBroadcast({ ...good, content }).errors).toHaveLength(2)
  })

  it("says which block each problem is in", () => {
    const content = contentOf({ type: "text", doc: emptyDoc("Words") }, { type: "image" })
    const issue = checkBroadcast({ ...good, content }).issues.find((item) => item.severity === "error")
    expect(issue?.target).toEqual({ blockId: "b1" })
  })

  it("warns about long, shouty or spammy subjects", () => {
    expect(checkBroadcast({ ...good, subject: "x".repeat(61) }).warnings).toHaveLength(1)
    expect(checkBroadcast({ ...good, subject: "SEATS LEFT" }).warnings).toHaveLength(1)
    expect(checkBroadcast({ ...good, subject: "Seats left!!!" }).warnings).toHaveLength(1)
  })

  it("warns about missing preview text and missing photo descriptions", () => {
    expect(checkBroadcast({ ...good, preheader: null }).warnings).toHaveLength(1)
    const content = contentOf({ type: "text", doc: emptyDoc("Twenty one words here so this is not considered mostly photos by the check that looks at the balance of it all") }, { type: "image", src: EMAIL_PHOTOS[0].path })
    expect(checkBroadcast({ ...good, content }).warnings).toEqual(["Describe every photo, for people with images turned off."])
  })

  it("warns when an email is mostly photos", () => {
    const content = contentOf({ type: "text", doc: emptyDoc("Hello") }, { type: "image", src: EMAIL_PHOTOS[0].path, alt: "Lions" })
    expect(checkBroadcast({ ...good, content }).warnings[0]).toContain("mostly photos")
  })

  it('warns about vague links like "click here"', () => {
    const content = contentOf({ type: "text", doc: docWith(para(words("We have two seats left on the July departure and would love to talk with you about the trip soon. "), words("click here", [{ type: "link", attrs: { href: "https://www.old-mountain.com" } }]))) })
    expect(checkBroadcast({ ...good, content }).warnings[0]).toContain("click here")
  })

  it("warns before Gmail would clip the email", () => {
    expect(checkBroadcast(good, 110 * 1024).warnings[0]).toContain("Gmail")
    expect(checkBroadcast(good, 90 * 1024).warnings).toEqual([])
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
    subscribers: { email: `${id}@example.com`, first_name: "Amara", unsubscribed_at: null, suppressed: false, ...overrides },
  })

  it("drops anyone who opted out after the audience was resolved", () => {
    const { recipients, optedOutSendIds } = splitBatch([
      row("ok"),
      row("left", { unsubscribed_at: "2026-11-08T00:00:00Z" }),
      row("bounced", { suppressed: true }),
    ])
    expect(recipients).toEqual([{ sendId: "ok", subscriberId: "sub-ok", email: "ok@example.com", firstName: "Amara" }])
    expect(optedOutSendIds).toEqual(["left", "bounced"])
  })
})
