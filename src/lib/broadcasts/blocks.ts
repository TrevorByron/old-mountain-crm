import { z } from "zod"

import { brand, fontFamily, light } from "@/theme/tokens"

// The brand limits of the builder. Anything outside these lists is dropped when an email
// renders, so a draft can't drift off brand and pasted formatting can't reach an inbox.
export const COLORS = {
  text: { label: "Ink", value: brand.textDark },
  gold: { label: "Gold", value: brand.gold },
  olive: { label: "Olive", value: brand.olive },
  dark: { label: "Near black", value: brand.dark },
  cream: { label: "Cream", value: brand.cream },
  paper: { label: "Paper", value: light.card },
  white: { label: "White", value: "#ffffff" },
} as const

export type ColorKey = keyof typeof COLORS
const colorKeys = Object.keys(COLORS) as [ColorKey, ...ColorKey[]]

export const isDarkColor = (key: ColorKey) => key === "dark" || key === "olive"

// Gmail and most clients ignore custom fonts, so these are all fonts every inbox can show.
export const FONTS = {
  sans: { label: "Roboto", stack: fontFamily.emailStack },
  serif: { label: "Georgia", stack: fontFamily.emailHeadingStack },
  classic: { label: "Times", stack: "'Times New Roman', Times, serif" },
  stamp: { label: "Courier", stack: fontFamily.emailKickerStack },
  plain: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
} as const

export type FontKey = keyof typeof FONTS
const fontKeys = Object.keys(FONTS) as [FontKey, ...FontKey[]]

export const FONT_SIZES = ["13px", "15px", "17px", "20px", "24px", "30px", "38px", "46px"] as const

export const SPACING = { none: 0, small: 12, medium: 24, large: 40, xlarge: 64 } as const
const spacingKeys = Object.keys(SPACING) as [keyof typeof SPACING, ...(keyof typeof SPACING)[]]

export const ASPECTS = [
  { key: "original", label: "Original", ratio: null },
  { key: "wide", label: "Wide", ratio: 12 / 5 },
  { key: "landscape", label: "3:2", ratio: 3 / 2 },
  { key: "square", label: "Square", ratio: 1 },
  { key: "portrait", label: "Tall", ratio: 4 / 5 },
] as const

export type RichMark = { type: string; attrs?: Record<string, unknown> }
export type RichNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: RichMark[]
  content?: RichNode[]
}

const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.string().max(40),
    text: z.string().max(20_000).optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(z.object({ type: z.string().max(40), attrs: z.record(z.string(), z.unknown()).optional() })).optional(),
    content: z.array(richNode).optional(),
  })
)

// Saved as typed, so a half-typed link can't block autosave. It only ever reaches an
// email through normalizeLink, and checkBroadcast stops a send if it can't be used.
const link = z.string().max(2000)

export function normalizeLink(value: string) {
  const trimmed = value.trim()
  if (/^(https?:\/\/|mailto:)\S+$/i.test(trimmed)) return trimmed
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed)) return `https://${trimmed}`
  return null
}

// Library photos are stored as paths, so drafts keep working when APP_URL changes.
const imageUrl = z
  .string()
  .max(2000)
  .refine(
    (value) => value === "" || /^https:\/\/\S+$/i.test(value) || /^\/email\/(photos|originals)\/[\w-]+\.jpg$/.test(value),
    "Photos need to be uploaded or chosen from the library."
  )

const align = z.enum(["left", "center", "right"])
const blockBase = {
  id: z.string().min(1).max(64),
  background: z.enum(colorKeys).nullable().default(null),
  spacing: z.enum(spacingKeys).default("medium"),
}

const photo = {
  source: imageUrl.default(""),
  src: imageUrl.default(""),
  alt: z.string().max(300).default(""),
  aspect: z.string().max(20).default("original"),
  area: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .default(null),
}

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    ...blockBase,
    type: z.literal("logo"),
    variant: z.enum(["lockup", "mark_gold", "mark_cream"]).default("lockup"),
    size: z.enum(["small", "medium", "large"]).default("medium"),
    align: align.default("center"),
  }),
  z.object({ ...blockBase, type: z.literal("text"), doc: richNode }),
  z.object({
    ...blockBase,
    type: z.literal("image"),
    ...photo,
    width: z.union([z.literal(100), z.literal(75), z.literal(50), z.literal(33)]).default(100),
    align: align.default("center"),
    rounded: z.boolean().default(false),
    bleed: z.boolean().default(false),
    link: link.default(""),
  }),
  z.object({
    ...blockBase,
    type: z.literal("image_text"),
    ...photo,
    side: z.enum(["left", "right"]).default("left"),
    rounded: z.boolean().default(false),
    doc: richNode,
  }),
  z.object({
    ...blockBase,
    type: z.literal("button"),
    label: z.string().max(80).default(""),
    url: link.default(""),
    style: z.enum(["gold", "olive", "dark", "outline"]).default("gold"),
    font: z.enum(fontKeys).default("stamp"),
    align: align.default("left"),
    fullWidth: z.boolean().default(false),
  }),
  z.object({
    ...blockBase,
    type: z.literal("divider"),
    color: z.enum(colorKeys).default("gold"),
    width: z.union([z.literal(100), z.literal(50), z.literal(25)]).default(100),
  }),
  z.object({ ...blockBase, type: z.literal("spacer") }),
  z.object({
    ...blockBase,
    type: z.literal("links"),
    items: z.array(z.object({ label: z.string().max(60), url: link })).max(8).default([]),
    align: align.default("center"),
  }),
])

export type Block = z.output<typeof blockSchema>
export type BlockType = Block["type"]
export type ImageBlock = Extract<Block, { type: "image" }>
export type ImageTextBlock = Extract<Block, { type: "image_text" }>
export type TextBlock = Extract<Block, { type: "text" }>

export const emailContentSchema = z.object({
  page: z.enum(colorKeys).default("white"),
  paper: z.enum(colorKeys).default("white"),
  blocks: z.array(blockSchema).max(60).default([]),
})

export type EmailContent = z.output<typeof emailContentSchema>

export const BLOCK_LABELS: Record<BlockType, { label: string; description: string }> = {
  text: { label: "Text", description: "Headlines, labels and paragraphs" },
  image: { label: "Photo", description: "Upload, recenter and size a photo" },
  image_text: { label: "Photo beside text", description: "Stacks on phones" },
  button: { label: "Button", description: "One clear next step" },
  logo: { label: "Logo", description: "Your real logo files" },
  divider: { label: "Divider", description: "A thin line" },
  spacer: { label: "Space", description: "Room to breathe" },
  links: { label: "Links", description: "A row of text links" },
}

const paragraph = (text = ""): RichNode => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined })

export const emptyDoc = (text = ""): RichNode => ({ type: "doc", content: [paragraph(text)] })

export function newBlock(type: BlockType): Block {
  return blockSchema.parse({
    id: crypto.randomUUID(),
    type,
    ...(type === "text" || type === "image_text" ? { doc: emptyDoc() } : {}),
    ...(type === "spacer" ? { spacing: "large" } : {}),
    ...(type === "links" ? { items: [{ label: "old-mountain.com", url: "https://www.old-mountain.com" }] } : {}),
  })
}
