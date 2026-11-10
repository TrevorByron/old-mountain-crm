"use client"

import { MailIcon, MonitorIcon, SmartphoneIcon } from "lucide-react"

import { GlanceChart, RateRing } from "@/components/report-charts"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Engagement } from "@/lib/people/engagement"

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-normal">{title}</h2>
        {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

// Which kind of device they use, with the share on each underneath, as in Flodesk.
function DeviceCard({ verb, counts }: { verb: "open" | "click"; counts: Engagement["opensByDevice"] }) {
  if (counts.mobileShare === null || counts.desktopShare === null) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No {verb} data yet.</CardContent>
      </Card>
    )
  }
  const prefers = counts.mobile > counts.desktop ? "mobile" : counts.desktop > counts.mobile ? "desktop" : null
  const Icon = prefers === "mobile" ? SmartphoneIcon : MonitorIcon
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-8 py-4">
        <p className="text-center">
          {prefers ? `This subscriber prefers to ${verb} your emails on ${prefers}` : `This subscriber ${verb}s your emails on mobile and desktop alike`}
        </p>
        <Icon className="size-24 text-muted-foreground" strokeWidth={1.25} />
        <div className="flex w-full justify-between text-center text-xs">
          <div className="flex flex-col items-center gap-1">
            <SmartphoneIcon className="size-5" />
            {counts.mobileShare}% {verb}s on mobile
          </div>
          <div className="flex flex-col items-center gap-1">
            <MonitorIcon className="size-5" />
            {counts.desktopShare}% {verb}s on desktop
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// A person's email engagement, laid out like Flodesk's subscriber analytics.
export function PersonAnalytics({ engagement }: { engagement: Engagement }) {
  if (engagement.sent === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No emails sent yet</EmptyTitle>
          <EmptyDescription>Once they get an email from you, what they open and click shows up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const glance = [
    { label: "Delivered", value: engagement.delivered, color: "var(--chart-2)" },
    { label: "Opened", value: engagement.opened, color: "var(--chart-3)" },
    { label: "Total clicks", value: engagement.totalClicks, color: "var(--chart-1)" },
    { label: "Unique clicks", value: engagement.uniqueClicks, color: "var(--chart-4)" },
  ]

  return (
    <div className="flex flex-col gap-12">
      <Section title="At a glance" description="Here's a breakdown of this subscriber's interactions with your emails.">
        <GlanceChart data={glance} className="aspect-auto h-64 w-full sm:h-80" />
      </Section>

      <Section title="Engagement">
        <div className="grid gap-4 sm:grid-cols-2">
          <RateRing
            title="Lifetime open rate"
            value={engagement.openRate}
            color="var(--chart-3)"
            caption={engagement.opened === 0 ? "This subscriber hasn't opened any of your emails yet." : `This subscriber has opened ${engagement.openRate}% of the emails you've sent them.`}
          />
          <RateRing
            title="Lifetime click rate"
            value={engagement.clickRate}
            color="var(--chart-1)"
            caption={engagement.totalClicks === 0 ? "This subscriber hasn't clicked any of your emails." : `This subscriber has clicked in ${engagement.clickRate}% of the emails you've sent them.`}
          />
        </div>
      </Section>

      <Tabs defaultValue="opens" className="gap-4">
        <TabsList variant="line" className="gap-4">
          <TabsTrigger value="opens" className="flex-none px-0 text-base">
            Opens by device
          </TabsTrigger>
          <TabsTrigger value="clicks" className="flex-none px-0 text-base">
            Clicks by device
          </TabsTrigger>
        </TabsList>
        <TabsContent value="opens">
          <DeviceCard verb="open" counts={engagement.opensByDevice} />
        </TabsContent>
        <TabsContent value="clicks">
          <DeviceCard verb="click" counts={engagement.clicksByDevice} />
        </TabsContent>
      </Tabs>
      <p className="-mt-8 text-xs text-muted-foreground">Opens are an estimate: some inboxes load images on their own, and Gmail always reports a desktop.</p>
    </div>
  )
}
