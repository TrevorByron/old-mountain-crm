import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Markdown,
  Preview,
  Section,
  Text,
} from "@react-email/components"

import type { BroadcastContent, LayoutKey } from "@/lib/broadcasts/content"
import { fontFamily, light } from "@/theme/tokens"

export type EmailFooter = {
  brandName: string
  postalAddress: string
  unsubscribeUrl: string
}

const page = { backgroundColor: light.background, fontFamily: fontFamily.emailStack, margin: 0, padding: "24px 0" }
const card = { backgroundColor: light.card, maxWidth: "600px", margin: "0 auto", borderRadius: "8px", overflow: "hidden" }
const content = { padding: "28px 32px" }
const wordmarkBand = { backgroundColor: light.primary, padding: "18px 32px" }
const wordmark = {
  color: light["primary-foreground"],
  fontSize: "16px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  margin: 0,
  textTransform: "uppercase" as const,
}
const heading = { color: light.foreground, fontSize: "26px", lineHeight: "32px", fontWeight: 600, margin: "0 0 16px" }
const button = {
  backgroundColor: light.primary,
  borderRadius: "6px",
  color: light["primary-foreground"],
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  marginTop: "20px",
  padding: "12px 22px",
  textDecoration: "none",
}
const footerText = { color: light["muted-foreground"], fontSize: "12px", lineHeight: "18px", margin: "0 0 6px" }
const markdownStyles = {
  p: { color: light.foreground, fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" },
  li: { color: light.foreground, fontSize: "16px", lineHeight: "26px" },
  h2: { color: light.foreground, fontSize: "20px", lineHeight: "28px", fontWeight: 600, margin: "24px 0 8px" },
  h3: { color: light.foreground, fontSize: "17px", lineHeight: "24px", fontWeight: 600, margin: "20px 0 8px" },
  link: { color: light.ring, textDecoration: "underline" },
}

// Raw HTML isn't part of the writing surface, so it shows as typed instead of reaching inboxes.
export function escapeHtml(markdown: string) {
  return markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

function BodyText({ markdown }: { markdown: string | null }) {
  if (!markdown?.trim()) return null
  return (
    <Markdown markdownCustomStyles={markdownStyles} markdownContainerStyles={{ margin: 0 }}>
      {escapeHtml(markdown)}
    </Markdown>
  )
}

function CallToAction({ label, url }: { label: string | null; url: string | null }) {
  if (!label?.trim() || !url?.trim()) return null
  return (
    <Button href={url} style={button}>
      {label}
    </Button>
  )
}

function Footer({ brandName, postalAddress, unsubscribeUrl }: EmailFooter) {
  return (
    <Section style={{ padding: "0 32px 28px" }}>
      <Hr style={{ borderColor: light.border, margin: "0 0 18px" }} />
      <Text style={footerText}>{brandName}</Text>
      <Text style={footerText}>{postalAddress}</Text>
      <Text style={footerText}>
        Don&apos;t want these emails?{" "}
        <Link href={unsubscribeUrl} style={{ color: light["muted-foreground"], textDecoration: "underline" }}>
          Unsubscribe
        </Link>
      </Text>
    </Section>
  )
}

export function BroadcastEmail({
  layout,
  email,
  footer,
}: {
  layout: LayoutKey
  email: BroadcastContent
  footer: EmailFooter
}) {
  return (
    <Html lang="en">
      <Head />
      {email.preheader && <Preview>{email.preheader}</Preview>}
      <Body style={page}>
        <Container style={card}>
          {layout !== "letter" && (
            <Section style={wordmarkBand}>
              <Text style={wordmark}>{footer.brandName}</Text>
            </Section>
          )}
          {layout === "trip_spotlight" && email.image_url && (
            <Img src={email.image_url} alt={email.image_alt ?? ""} width="600" style={{ width: "100%", height: "auto" }} />
          )}
          <Section style={content}>
            {email.heading?.trim() && (
              <Heading as="h1" style={heading}>
                {email.heading}
              </Heading>
            )}
            <BodyText markdown={email.body_markdown} />
            <CallToAction label={email.cta_label} url={email.cta_url} />
          </Section>
          <Footer {...footer} />
        </Container>
      </Body>
    </Html>
  )
}
