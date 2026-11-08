import { z } from "zod"

import { blockSchema, emailContentSchema, normalizeLink, type Block, type EmailContent, type RichNode } from "./blocks"
import { EMAIL_PHOTOS } from "./photos"

export const LAYOUTS = [
  { key: "letter", name: "Newsletter", description: "A note from Jesse and Trevor, with the logo and a photo." },
  { key: "announcement", name: "Announcement", description: "A dark banner and a big headline, for news that stands alone." },
  { key: "trip_spotlight", name: "Trip spotlight", description: "Leads with a wide photo of a place or departure." },
] as const

export type LayoutKey = (typeof LAYOUTS)[number]["key"]

export const audienceFilterSchema = z.object({
  statuses: z.array(z.string()).default([]),
  airtable_segments: z.array(z.string()).default([]),
  segment_ids: z.array(z.uuid()).default([]),
  exclude_segment_ids: z.array(z.uuid()).default([]),
  exclude_lifecycles: z.array(z.string()).default([]),
})

export type AudienceFilter = z.output<typeof audienceFilterSchema>

export function isAudienceEmpty(filter: AudienceFilter) {
  return filter.statuses.length + filter.airtable_segments.length + filter.segment_ids.length === 0
}

const text = (value: string) => [{ type: "text", text: value }]
const title = (value: string): RichNode => ({ type: "heading", attrs: { level: 1 }, content: text(value) })
const label = (value: string, textAlign = "left"): RichNode => ({
  type: "heading",
  attrs: { level: 3, textAlign },
  content: text(value),
})
const body = (value: string): RichNode => ({ type: "paragraph", content: text(value) })
const doc = (...content: RichNode[]): RichNode => ({ type: "doc", content })
const lions = EMAIL_PHOTOS[0]
const volcano = EMAIL_PHOTOS.find((photo) => photo.path.includes("volcano")) ?? lions

const blocks = (items: Record<string, unknown>[]): Block[] =>
  items.map((item) => blockSchema.parse({ id: crypto.randomUUID(), ...item }))

// The starting point for each built-in template. These are prompts to write over, so
// they only state what's true of every email.
export function starterContent(layout: string): EmailContent {
  if (layout === "announcement") {
    return emailContentSchema.parse({
      blocks: blocks([
        { type: "logo", variant: "mark_cream", size: "medium", background: "dark", spacing: "large" },
        {
          type: "text",
          background: "dark",
          spacing: "large",
          doc: doc(
            { ...label("Your label", "center") },
            { type: "heading", attrs: { level: 1, textAlign: "center" }, content: text("Your big news") }
          ),
        },
        { type: "text", spacing: "large", doc: doc(body("Say what's happening, in a few short sentences.")) },
        { type: "button", label: "Your next step", url: "https://www.old-mountain.com", align: "center" },
      ]),
    })
  }
  if (layout === "trip_spotlight") {
    return emailContentSchema.parse({
      page: "cream",
      paper: "paper",
      blocks: blocks([
        { type: "logo", spacing: "large" },
        { type: "image", source: volcano.original, src: volcano.path, alt: volcano.alt, aspect: "wide", bleed: true, spacing: "none" },
        { type: "text", spacing: "large", doc: doc(label("Dates and details"), title("The place or trip"), body("Tell them what it's like to be there.")) },
        { type: "button", label: "Your next step", url: "https://www.old-mountain.com" },
      ]),
    })
  }
  return emailContentSchema.parse({
    blocks: blocks([
      { type: "logo", spacing: "large" },
      { type: "image", source: lions.original, src: lions.path, alt: lions.alt, aspect: "wide", rounded: true, spacing: "none" },
      { type: "text", spacing: "small", doc: doc(label("Month newsletter", "right")) },
      {
        type: "text",
        doc: doc(
          { type: "paragraph", content: [{ type: "text", text: "Hi {{first_name|friends and family}},", marks: [{ type: "bold" }] }] },
          body("Trevor and Jesse here, with some news.")
        ),
      },
    ]),
  })
}

function docLinks(node: RichNode): string[] {
  const own = (node.marks ?? []).flatMap((mark) => (mark.type === "link" ? [{ text: node.text ?? "" }] : []))
  return [...own.map((item) => item.text), ...(node.content ?? []).flatMap(docLinks)]
}

const GMAIL_CLIP_BYTES = 102 * 1024

// Words from the built-in templates that are meant to be written over.
export const STARTER_PLACEHOLDERS = [
  "Your label",
  "Your big news",
  "Say what's happening, in a few short sentences.",
  "Your next step",
  "Dates and details",
  "The place or trip",
  "Tell them what it's like to be there.",
  "Month newsletter",
  "Trevor and Jesse here, with some news.",
]

function leafTexts(node: RichNode): string[] {
  return [...(node.text ? [node.text] : []), ...(node.content ?? []).flatMap(leafTexts)]
}

export type IssueTarget = "subject" | "preheader" | { blockId: string }
export type BroadcastIssue = { severity: "error" | "warning"; message: string; target: IssueTarget | null }
export type BroadcastChecks = { errors: string[]; warnings: string[]; issues: BroadcastIssue[] }

// A pre-send review: errors stop a send, warnings are worth a second look. Each one says
// where to go to fix it.
export function checkBroadcast(
  { subject, preheader, content }: { subject: string | null; preheader: string | null; content: EmailContent },
  htmlBytes = 0
): BroadcastChecks {
  const issues: BroadcastIssue[] = []
  const add = (severity: BroadcastIssue["severity"], message: string, target: IssueTarget | null) => {
    if (!issues.some((issue) => issue.message === message)) issues.push({ severity, message, target })
  }
  const trimmedSubject = subject?.trim() ?? ""

  if (!trimmedSubject) add("error", "Add a subject.", "subject")
  else {
    if (trimmedSubject.length > 60) add("warning", "The subject is over 60 characters, so phones may cut it off.", "subject")
    if (trimmedSubject === trimmedSubject.toUpperCase() && /[A-Z]/.test(trimmedSubject)) {
      add("warning", "An all-caps subject can look like spam.", "subject")
    }
    if (/!{2,}/.test(trimmedSubject)) add("warning", "Repeated exclamation marks in a subject can look like spam.", "subject")
  }
  if (!preheader?.trim()) add("warning", "Add preview text. Otherwise inboxes show the first words of the email.", "preheader")

  let hasWords = false
  let wordCount = 0
  let photoCount = 0
  for (const block of content.blocks) {
    const target = { blockId: block.id }
    if (block.type === "text" || block.type === "image_text") {
      const texts = leafTexts(block.doc)
      const words = texts.join(" ").trim()
      if (words) hasWords = true
      wordCount += words ? words.split(/\s+/).length : 0
      if (texts.some((text) => STARTER_PLACEHOLDERS.includes(text.trim()))) {
        add("error", "Replace the template's placeholder text.", target)
      }
      if (docLinks(block.doc).some((link) => /^(click here|here|read more|link)$/i.test(link.trim()))) {
        add("warning", `Say where a link goes instead of "click here".`, target)
      }
    }
    if (block.type === "image" || block.type === "image_text") {
      photoCount += 1
      if (!block.src) add("error", "A photo block has no photo. Add one or remove the block.", target)
      else if (!block.alt.trim()) add("warning", "Describe every photo, for people with images turned off.", target)
    }
    if (block.type === "button") {
      if (!block.label.trim() || !block.url.trim()) add("error", "Give every button a label and a link.", target)
      else if (!normalizeLink(block.url)) add("error", "A button's link isn't a web address.", target)
      if (STARTER_PLACEHOLDERS.includes(block.label.trim())) add("error", "Replace the template's placeholder text.", target)
    }
    if (block.type === "image" && block.link.trim() && !normalizeLink(block.link)) {
      add("error", "A photo's link isn't a web address.", target)
    }
    if (block.type === "links") {
      if (block.items.some((item) => !item.label.trim() || !normalizeLink(item.url))) {
        add("error", "Give every link in a links block a label and a web address.", target)
      }
    }
  }
  if (!hasWords) add("error", "Write something in a text block.", null)
  else if (photoCount > 0 && wordCount / photoCount < 20) {
    add("warning", "This is mostly photos. People with images off would see very little, and spam filters notice.", null)
  }
  if (htmlBytes > GMAIL_CLIP_BYTES) add("warning", "This email is long enough that Gmail will cut it off. Try trimming it.", null)

  return {
    errors: issues.filter((issue) => issue.severity === "error").map((issue) => issue.message),
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message),
    issues,
  }
}
