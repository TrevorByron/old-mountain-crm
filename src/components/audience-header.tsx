import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { value: "subscribers", label: "All subscribers", href: "/subscribers" },
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
          <TabsTrigger key={tab.value} value={tab.value} render={<Link href={tab.href} />} nativeButton={false} className="flex-none">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// One heading for everyone you know, with the tabs under it. Pages with a people table let the
// table draw this instead.
export function AudienceHeader({
  active,
  description,
  fab,
  children,
}: {
  active: AudienceTab
  description: string
  fab?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audience" description={description} fab={fab}>
        {children}
      </PageHeader>
      <AudienceTabs active={active} />
    </div>
  )
}
