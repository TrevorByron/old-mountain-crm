import type { CSSProperties, ReactNode } from "react"

import { COLORS, FONTS, FONT_SIZES, type RichMark, type RichNode } from "@/lib/broadcasts/blocks"
import { fontFamily } from "@/theme/tokens"

const ALLOWED_COLORS = new Set<string>(Object.values(COLORS).map((color) => color.value.toLowerCase()))
const ALLOWED_FONTS = new Set<string>(Object.values(FONTS).map((font) => font.stack))
const ALLOWED_SIZES = new Set<string>(FONT_SIZES)
const ALIGNMENTS = new Set(["left", "center", "right"])

function safeHref(value: unknown) {
  return typeof value === "string" && /^(https?:\/\/|mailto:)\S+$/i.test(value) ? value : null
}

function markStyle(attrs: RichMark["attrs"] = {}): CSSProperties {
  const style: CSSProperties = {}
  const { color, fontFamily: font, fontSize } = attrs
  if (typeof color === "string" && ALLOWED_COLORS.has(color.toLowerCase())) style.color = color
  if (typeof font === "string" && ALLOWED_FONTS.has(font)) style.fontFamily = font
  if (typeof fontSize === "string" && ALLOWED_SIZES.has(fontSize)) style.fontSize = fontSize
  return style
}

function applyMark(mark: RichMark, child: ReactNode, linkColor: string): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong>{child}</strong>
    case "italic":
      return <em>{child}</em>
    case "underline":
      return <u>{child}</u>
    case "strike":
      return <s>{child}</s>
    case "link": {
      const href = safeHref(mark.attrs?.href)
      return href ? (
        <a href={href} style={{ color: linkColor, fontWeight: 700, textDecoration: "underline" }}>
          {child}
        </a>
      ) : (
        child
      )
    }
    case "textStyle":
      return <span style={markStyle(mark.attrs)}>{child}</span>
    default:
      return child
  }
}

export type RichTextTheme = { text: string; label: string }

function blockAlign(node: RichNode): CSSProperties {
  const align = node.attrs?.textAlign
  return typeof align === "string" && ALIGNMENTS.has(align) ? { textAlign: align as CSSProperties["textAlign"] } : {}
}

// Only these nodes and marks reach an email. Anything else in a document, such as
// formatting pasted from elsewhere, is left out and its text kept.
function renderNode(node: RichNode, key: number, theme: RichTextTheme): ReactNode {
  const children = () => (node.content ?? []).map((child, index) => renderNode(child, index, theme))

  switch (node.type) {
    case "text":
      return (node.marks ?? []).reduceRight<ReactNode>(
        (child, mark, index) => <span key={index}>{applyMark(mark, child, theme.text)}</span>,
        <span key={key}>{node.text}</span>
      )
    case "hardBreak":
      return <br key={key} />
    case "paragraph":
      return (
        <p
          key={key}
          style={{
            color: theme.text,
            fontFamily: fontFamily.emailStack,
            fontSize: "17px",
            lineHeight: "27px",
            margin: "0 0 16px",
            minHeight: "27px",
            ...blockAlign(node),
          }}
        >
          {children()}
        </p>
      )
    case "heading": {
      const level = node.attrs?.level
      if (level === 3) {
        // The small gold label from the brand's kicker-then-headline pattern.
        return (
          <p
            key={key}
            style={{
              color: theme.label,
              fontFamily: fontFamily.emailKickerStack,
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              lineHeight: "20px",
              margin: "0 0 10px",
              textTransform: "uppercase",
              ...blockAlign(node),
            }}
          >
            {children()}
          </p>
        )
      }
      const Tag = level === 2 ? "h2" : "h1"
      return (
        <Tag
          key={key}
          style={{
            color: theme.text,
            fontFamily: fontFamily.emailHeadingStack,
            fontSize: level === 2 ? "24px" : "36px",
            fontWeight: 400,
            lineHeight: level === 2 ? "30px" : "42px",
            margin: "0 0 16px",
            ...blockAlign(node),
          }}
        >
          {children()}
        </Tag>
      )
    }
    case "bulletList":
    case "orderedList": {
      const Tag = node.type === "bulletList" ? "ul" : "ol"
      return (
        <Tag key={key} style={{ margin: "0 0 16px", paddingLeft: "24px" }}>
          {children()}
        </Tag>
      )
    }
    case "listItem":
      return (
        <li key={key} style={{ color: theme.text, fontFamily: fontFamily.emailStack, fontSize: "17px", lineHeight: "27px" }}>
          {children()}
        </li>
      )
    case "doc":
      return <div key={key}>{children()}</div>
    default:
      return node.content ? <div key={key}>{children()}</div> : node.text ? <span key={key}>{node.text}</span> : null
  }
}

export function RichText({ doc, theme }: { doc: RichNode; theme: RichTextTheme }) {
  return <>{renderNode(doc, 0, theme)}</>
}
