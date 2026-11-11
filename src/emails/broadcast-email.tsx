import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import {
  COLORS,
  FONTS,
  SPACING,
  isDarkColor,
  normalizeLink,
  type Block,
  type ColorKey,
  type EmailContent,
  type ImageBlock,
  type ImageTextBlock,
  type RichNode,
} from "@/lib/broadcasts/blocks"
import { brand, fontFamily } from "@/theme/tokens"

import { RichText, type RichTextTheme } from "./rich-text"

// Emails keep the brand's warm gray for quiet text, whatever the app's own grays are.
const MUTED_TEXT = "#5c5a4a"

export type EmailFooter = {
  brandName: string
  postalAddress: string
  unsubscribeUrl: string
  appUrl: string
}

const WEBSITE_URL = "https://www.old-mountain.com"
// A little wider than the usual 600, so desktop inboxes don't show a narrow strip. Phones
// still shrink it to fit.
const PAGE_WIDTH = 680
const GUTTER = 32
const COLUMN_WIDTH = 296

const logoAlt = { fontSize: "16px", fontWeight: 600, letterSpacing: "0.06em", lineHeight: "22px" }

const LOGOS = {
  lockup: { file: "logo-lockup.png", sizes: { small: 200, medium: 280, large: 360 }, color: brand.gold },
  mark_gold: { file: "mark-gold.png", sizes: { small: 72, medium: 120, large: 180 }, color: brand.gold },
  mark_cream: { file: "mark-cream.png", sizes: { small: 72, medium: 120, large: 180 }, color: brand.cream },
}

const BUTTONS: Record<string, CSSProperties> = {
  gold: { backgroundColor: brand.gold, color: brand.dark },
  olive: { backgroundColor: brand.olive, color: brand.cream },
  dark: { backgroundColor: brand.dark, color: brand.cream },
  outline: { border: `2px solid ${brand.gold}`, color: brand.textDark },
}

function themeFor(background: ColorKey): RichTextTheme {
  return isDarkColor(background) ? { text: brand.cream, label: brand.gold } : { text: brand.textDark, label: brand.gold }
}

function absolute(url: string, appUrl: string) {
  return url.startsWith("/") ? `${appUrl}${url}` : url
}

type RenderContext = { appUrl: string; paper: ColorKey; editing: boolean; brandName: string }

function BlockSection({
  block,
  context,
  bleed,
  align,
  children,
}: {
  block: Block
  context: RenderContext
  bleed?: boolean
  align?: "left" | "center" | "right"
  children: ReactNode
}) {
  const y = SPACING[block.spacing]
  return (
    <Section
      {...(context.editing ? { "data-block-id": block.id } : {})}
      style={{
        ...(block.background ? { backgroundColor: COLORS[block.background].value } : {}),
        padding: `${block.spacing === "none" ? 0 : Math.round(y / 2)}px ${bleed ? 0 : GUTTER}px`,
        textAlign: align ?? "left",
      }}
    >
      {children}
    </Section>
  )
}

// Only in the editor, so a new block can be seen and clicked before it has anything in it.
function EditingPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: `2px dashed ${brand.gold}`,
        borderRadius: "8px",
        color: MUTED_TEXT,
        fontFamily: fontFamily.emailStack,
        fontSize: "15px",
        padding: "28px 16px",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  )
}

function photoMargins(align: string): CSSProperties {
  if (align === "center") return { marginLeft: "auto", marginRight: "auto" }
  if (align === "right") return { marginLeft: "auto" }
  return {}
}

function PhotoBlock({ block, context }: { block: ImageBlock; context: RenderContext }) {
  if (!block.src) {
    return context.editing ? (
      <BlockSection block={block} context={context}>
        <EditingPlaceholder>Add a photo</EditingPlaceholder>
      </BlockSection>
    ) : null
  }
  const available = block.bleed ? PAGE_WIDTH : PAGE_WIDTH - GUTTER * 2
  const width = Math.round((available * block.width) / 100)
  const href = normalizeLink(block.link)
  const image = (
    <Img
      src={absolute(block.src, context.appUrl)}
      alt={block.alt}
      width={width}
      style={{
        borderRadius: block.rounded ? "12px" : 0,
        display: "block",
        height: "auto",
        maxWidth: `${width}px`,
        width: `${block.width}%`,
        ...photoMargins(block.align),
      }}
    />
  )
  return (
    <BlockSection block={block} context={context} bleed={block.bleed} align={block.align}>
      {href ? <Link href={href}>{image}</Link> : image}
    </BlockSection>
  )
}

function PhotoBesideText({ block, context }: { block: ImageTextBlock; context: RenderContext }) {
  const column: CSSProperties = {
    display: "inline-block",
    maxWidth: `${COLUMN_WIDTH}px`,
    textAlign: "left",
    verticalAlign: "top",
    width: "100%",
  }
  const photo = (
    <div key="photo" style={column}>
      {!block.src && context.editing && <EditingPlaceholder>Add a photo</EditingPlaceholder>}
      {block.src && (
        <Img
          src={absolute(block.src, context.appUrl)}
          alt={block.alt}
          width={COLUMN_WIDTH}
          style={{ borderRadius: block.rounded ? "12px" : 0, display: "block", height: "auto", marginBottom: "12px", width: "100%" }}
        />
      )}
    </div>
  )
  const words = (
    <div key="words" style={column}>
      <RichText doc={block.doc} theme={themeFor(block.background ?? context.paper)} />
    </div>
  )
  return (
    <BlockSection block={block} context={context} align="center">
      {block.side === "left" ? [photo, " ", words] : [words, " ", photo]}
    </BlockSection>
  )
}

function hasText(node: RichNode): boolean {
  return Boolean(node.text?.trim()) || (node.content ?? []).some(hasText)
}

function BlockView({ block, context }: { block: Block; context: RenderContext }) {
  switch (block.type) {
    case "logo": {
      const logo = LOGOS[block.variant]
      const width = logo.sizes[block.size]
      return (
        <BlockSection block={block} context={context} align={block.align}>
          <Img
            src={`${context.appUrl}/email/${logo.file}`}
            alt={context.brandName}
            width={width}
            style={{ ...logoAlt, color: logo.color, display: "inline-block", height: "auto", maxWidth: `${width}px`, width: "70%" }}
          />
        </BlockSection>
      )
    }
    case "text":
      return (
        <BlockSection block={block} context={context}>
          {context.editing && !hasText(block.doc) ? (
            <EditingPlaceholder>Click to write</EditingPlaceholder>
          ) : (
            <RichText doc={block.doc} theme={themeFor(block.background ?? context.paper)} />
          )}
        </BlockSection>
      )
    case "image":
      return <PhotoBlock block={block} context={context} />
    case "image_text":
      return <PhotoBesideText block={block} context={context} />
    case "button": {
      if (!block.label.trim()) {
        return context.editing ? (
          <BlockSection block={block} context={context}>
            <EditingPlaceholder>Add a button label</EditingPlaceholder>
          </BlockSection>
        ) : null
      }
      return (
        <BlockSection block={block} context={context} align={block.align}>
          <Button
            href={normalizeLink(block.url) ?? WEBSITE_URL}
            style={{
              ...BUTTONS[block.style],
              borderRadius: "4px",
              boxSizing: "border-box",
              display: block.fullWidth ? "block" : "inline-block",
              fontFamily: FONTS[block.font].stack,
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: block.font === "stamp" ? "0.12em" : "0.02em",
              padding: "15px 28px",
              textAlign: "center",
              textDecoration: "none",
              textTransform: block.font === "stamp" ? "uppercase" : "none",
            }}
          >
            {block.label}
          </Button>
        </BlockSection>
      )
    }
    case "divider":
      return (
        <BlockSection block={block} context={context}>
          <Hr
            style={{
              borderColor: COLORS[block.color].value,
              borderStyle: "solid",
              borderWidth: "1px 0 0",
              margin: "0 auto",
              width: `${block.width}%`,
            }}
          />
        </BlockSection>
      )
    case "spacer": {
      const height = SPACING[block.spacing]
      return (
        <Section
          {...(context.editing ? { "data-block-id": block.id } : {})}
          style={block.background ? { backgroundColor: COLORS[block.background].value } : undefined}
        >
          <div style={{ fontSize: "1px", height: `${height}px`, lineHeight: `${height}px` }}>&nbsp;</div>
        </Section>
      )
    }
    case "links": {
      const color = isDarkColor(block.background ?? context.paper) ? brand.cream : brand.textDark
      return (
        <BlockSection block={block} context={context} align={block.align}>
          <Text style={{ color, fontFamily: fontFamily.emailStack, fontSize: "15px", lineHeight: "24px", margin: 0 }}>
            {block.items.map((item, index) => (
              <span key={index}>
                {index > 0 && " · "}
                <Link href={normalizeLink(item.url) ?? WEBSITE_URL} style={{ color, fontWeight: 700, textDecoration: "underline" }}>
                  {item.label}
                </Link>
              </span>
            ))}
          </Text>
        </BlockSection>
      )
    }
  }
}

// Fixed in every email and not a block, so the law's requirements can't be deleted by accident.
function Footer({ footer, paper }: { footer: EmailFooter; paper: ColorKey }) {
  const color = isDarkColor(paper) ? brand.cream : MUTED_TEXT
  const text = { color, fontFamily: fontFamily.emailStack, fontSize: "12px", lineHeight: "18px", margin: "0 0 4px", textAlign: "center" as const }
  const link = { color, textDecoration: "underline" }
  return (
    <Section style={{ padding: `32px ${GUTTER}px 36px` }}>
      <Hr style={{ borderColor: brand.gold, margin: "0 0 28px", opacity: 0.5 }} />
      <Section style={{ marginBottom: "14px", textAlign: "center" }}>
        <Img
          src={`${footer.appUrl}/email/mark-gold.png`}
          alt=""
          width="72"
          style={{ display: "inline-block", height: "auto", width: "72px" }}
        />
      </Section>
      <Text style={text}>{footer.brandName}</Text>
      <Text style={text}>{footer.postalAddress}</Text>
      <Text style={{ ...text, marginTop: "12px" }}>
        <Link href={WEBSITE_URL} style={link}>
          old-mountain.com
        </Link>
        {" · "}
        <Link href={footer.unsubscribeUrl} style={link}>
          Unsubscribe
        </Link>
      </Text>
    </Section>
  )
}

export function BroadcastEmail({
  content,
  preheader,
  footer,
  editing = false,
}: {
  content: EmailContent
  preheader: string | null
  footer: EmailFooter
  editing?: boolean
}) {
  const context: RenderContext = { appUrl: footer.appUrl, paper: content.paper, editing, brandName: footer.brandName }

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      {preheader && <Preview>{preheader}</Preview>}
      <Body style={{ backgroundColor: COLORS[content.page].value, fontFamily: fontFamily.emailStack, margin: 0, padding: 0 }}>
        <Container style={{ backgroundColor: COLORS[content.paper].value, margin: "0 auto", maxWidth: `${PAGE_WIDTH}px` }}>
          {content.blocks.map((block) => (
            <BlockView key={block.id} block={block} context={context} />
          ))}
          <Footer footer={footer} paper={content.paper} />
        </Container>
      </Body>
    </Html>
  )
}
