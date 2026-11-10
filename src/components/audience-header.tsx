import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { value: "subscribers", label: "Subscribers", href: "/subscribers" },
  { value: "customers", label: "Customers", href: "/subscribers?show=customers" },
  { value: "segments", label: "Segments", href: "/segments" },
] as const

export type AudienceTab = (typeof TABS)[number]["value"]

// Each tab is its own page, so links and the back button work.
export function AudienceTabs({ active }: { active: AudienceTab }) {
  return (
    <Tabs value={active}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} render={<Link href={tab.href} />} nativeButton={false}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// One heading for everyone you know. Pages with a people table put the tabs in its toolbar instead.
export function AudienceHeader({
  active,
  description,
  tabs = true,
  children,
}: {
  active: AudienceTab
  description: string
  tabs?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audience" description={description}>
        {children}
      </PageHeader>
      {tabs && <AudienceTabs active={active} />}
    </div>
  )
}
