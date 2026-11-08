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
import { photoAlt } from "@/lib/broadcasts/photos"
import { brand, fontFamily, light } from "@/theme/tokens"

export type EmailFooter = {
  brandName: string
  postalAddress: string
  unsubscribeUrl: string
  appUrl: string
}

const WEBSITE_URL = "https://www.old-mountain.com"
const PAGE_WIDTH = "600px"

const kickerBase = {
  color: brand.gold,
  fontFamily: fontFamily.emailKickerStack,
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  lineHeight: "20px",
  textTransform: "uppercase" as const,
}
const headingBase = {
  fontFamily: fontFamily.emailHeadingStack,
  fontWeight: 400,
}
const button = {
  backgroundColor: brand.gold,
  borderRadius: "4px",
  color: brand.dark,
  display: "inline-block",
  fontFamily: fontFamily.emailKickerStack,
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  marginTop: "12px",
  padding: "14px 26px",
  textDecoration: "none",
  textTransform: "uppercase" as const,
}
const footerText = {
  color: light["muted-foreground"],
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 4px",
  textAlign: "center" as const,
}
// How logos read when an inbox has images turned off.
const logoAlt = { fontSize: "16px", fontWeight: 600, letterSpacing: "0.06em", lineHeight: "22px" }
const footerLink = { color: light["muted-foreground"], textDecoration: "underline" }
const markdownStyles = {
  p: { color: brand.textDark, fontSize: "17px", lineHeight: "27px", margin: "0 0 20px" },
  li: { color: brand.textDark, fontSize: "17px", lineHeight: "27px" },
  h2: { ...headingBase, color: brand.textDark, fontSize: "24px", lineHeight: "30px", margin: "28px 0 10px" },
  h3: { ...headingBase, color: brand.textDark, fontSize: "20px", lineHeight: "26px", margin: "24px 0 8px" },
  link: { color: brand.textDark, fontWeight: 700, textDecoration: "underline" },
}

// Raw HTML isn't part of the writing surface, so it shows as typed instead of reaching inboxes.
export function escapeHtml(markdown: string) {
  return markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

function absolute(url: string, appUrl: string) {
  return url.startsWith("/") ? `${appUrl}${url}` : url
}

function BodyText({ markdown }: { markdown: string | null }) {
  if (!markdown?.trim()) return null
  return (
    <Markdown markdownCustomStyles={markdownStyles} markdownContainerStyles={{ margin: 0 }}>
      {escapeHtml(markdown)}
    </Markdown>
  )
}

function CallToAction({ email, align }: { email: BroadcastContent; align?: "center" }) {
  if (!email.cta_label?.trim() || !email.cta_url?.trim()) return null
  return (
    <Section style={{ textAlign: align ?? "left" }}>
      <Button href={email.cta_url} style={button}>
        {email.cta_label}
      </Button>
    </Section>
  )
}

function Photo({ email, appUrl, rounded }: { email: BroadcastContent; appUrl: string; rounded?: boolean }) {
  if (!email.image_url) return null
  return (
    <Img
      src={absolute(email.image_url, appUrl)}
      alt={email.image_alt ?? photoAlt(email.image_url) ?? ""}
      width="600"
      style={{ borderRadius: rounded ? "12px" : 0, display: "block", height: "auto", width: "100%" }}
    />
  )
}

function Lockup({ footer }: { footer: EmailFooter }) {
  return (
    <Section style={{ padding: "36px 32px 28px", textAlign: "center" }}>
      <Img
        src={`${footer.appUrl}/email/logo-lockup.png`}
        alt={footer.brandName}
        width="280"
        style={{ ...logoAlt, color: brand.gold, display: "inline-block", height: "auto", maxWidth: "280px", width: "70%" }}
      />
    </Section>
  )
}

function Footer({ brandName, postalAddress, unsubscribeUrl, appUrl }: EmailFooter) {
  return (
    <Section style={{ padding: "12px 32px 36px" }}>
      <Hr style={{ borderColor: brand.gold, margin: "0 0 28px", opacity: 0.5 }} />
      <Section style={{ marginBottom: "14px", textAlign: "center" }}>
        <Img
          src={`${appUrl}/email/mark-gold.png`}
          alt=""
          width="72"
          style={{ display: "inline-block", height: "auto", width: "72px" }}
        />
      </Section>
      <Text style={footerText}>{brandName}</Text>
      <Text style={footerText}>{postalAddress}</Text>
      <Text style={{ ...footerText, marginTop: "12px" }}>
        <Link href={WEBSITE_URL} style={footerLink}>
          old-mountain.com
        </Link>
        {" · "}
        <Link href={unsubscribeUrl} style={footerLink}>
          Unsubscribe
        </Link>
      </Text>
    </Section>
  )
}

// The founders' note: logo, rounded photo, a small label to the right, then their words.
function Newsletter({ email, footer }: { email: BroadcastContent; footer: EmailFooter }) {
  return (
    <>
      <Lockup footer={footer} />
      <Section style={{ padding: "0 16px" }}>
        <Photo email={email} appUrl={footer.appUrl} rounded />
      </Section>
      {email.kicker && <Text style={{ ...kickerBase, margin: "14px 28px 0", textAlign: "right" }}>{email.kicker}</Text>}
      <Section style={{ padding: "24px 36px 12px" }}>
        {email.heading && (
          <Heading as="h1" style={{ ...headingBase, color: brand.textDark, fontSize: "30px", lineHeight: "36px", margin: "0 0 18px" }}>
            {email.heading}
          </Heading>
        )}
        <BodyText markdown={email.body_markdown} />
        <CallToAction email={email} />
      </Section>
    </>
  )
}

// News that stands on its own: the dark banner the brand uses for pure announcements.
function Announcement({ email, footer }: { email: BroadcastContent; footer: EmailFooter }) {
  return (
    <>
      <Section style={{ backgroundColor: brand.dark, padding: "44px 32px 48px", textAlign: "center" }}>
        <Img
          src={`${footer.appUrl}/email/mark-cream.png`}
          alt={footer.brandName}
          width="120"
          style={{ ...logoAlt, color: brand.cream, display: "inline-block", height: "auto", marginBottom: "28px", width: "120px" }}
        />
        {email.kicker && <Text style={{ ...kickerBase, margin: "0 0 12px" }}>{email.kicker}</Text>}
        {email.heading && (
          <Heading as="h1" style={{ ...headingBase, color: brand.cream, fontSize: "38px", lineHeight: "44px", margin: 0 }}>
            {email.heading}
          </Heading>
        )}
      </Section>
      <Photo email={email} appUrl={footer.appUrl} />
      <Section style={{ padding: "32px 36px 12px" }}>
        <BodyText markdown={email.body_markdown} />
        <CallToAction email={email} align="center" />
      </Section>
    </>
  )
}

// A place or departure: the photo does the selling, on cream paper.
function TripSpotlight({ email, footer }: { email: BroadcastContent; footer: EmailFooter }) {
  return (
    <>
      <Lockup footer={footer} />
      <Photo email={email} appUrl={footer.appUrl} />
      <Section style={{ padding: "30px 36px 12px" }}>
        {email.kicker && <Text style={{ ...kickerBase, margin: "0 0 10px" }}>{email.kicker}</Text>}
        {email.heading && (
          <Heading as="h1" style={{ ...headingBase, color: brand.textDark, fontSize: "34px", lineHeight: "40px", margin: "0 0 18px" }}>
            {email.heading}
          </Heading>
        )}
        <BodyText markdown={email.body_markdown} />
        <CallToAction email={email} />
      </Section>
    </>
  )
}

const LAYOUT_COMPONENTS = { letter: Newsletter, announcement: Announcement, trip_spotlight: TripSpotlight }

export function BroadcastEmail({
  layout,
  email,
  footer,
}: {
  layout: LayoutKey
  email: BroadcastContent
  footer: EmailFooter
}) {
  const Layout = LAYOUT_COMPONENTS[layout]
  const paper = layout === "trip_spotlight" ? light.card : "#ffffff"
  const pageBackground = layout === "trip_spotlight" ? brand.cream : "#ffffff"

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {email.preheader && <Preview>{email.preheader}</Preview>}
      <Body style={{ backgroundColor: pageBackground, fontFamily: fontFamily.emailStack, margin: 0, padding: "0" }}>
        <Container style={{ backgroundColor: paper, margin: "0 auto", maxWidth: PAGE_WIDTH }}>
          <Layout email={email} footer={footer} />
          <Footer {...footer} />
        </Container>
      </Body>
    </Html>
  )
}
