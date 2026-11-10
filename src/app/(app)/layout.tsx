import Image from "next/image"
import Link from "next/link"
import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { GlobalSearch } from "@/components/global-search"
import { MobileSettingsButton, MobileTabBar } from "@/components/mobile-nav"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { requireTeamMember } from "@/lib/auth"
import { loadAttention } from "@/lib/pipeline/attention"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { member, supabase } = await requireTeamMember()
  const { count: attentionCount } = await loadAttention(supabase)
  const cookieStore = await cookies()

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar email={member.email} attentionCount={attentionCount} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:static md:h-12 md:bg-transparent md:px-6 md:pt-2 md:backdrop-blur-none">
          <SidebarTrigger className="hidden md:inline-flex" />
          <Link href="/today" aria-label="Old Mountain, home" className="shrink-0 md:hidden">
            <Image src="/email/mark-gold.png" alt="" width={32} height={14} className="h-auto w-8" />
          </Link>
          <GlobalSearch />
          <MobileSettingsButton email={member.email} />
        </header>
        {/* On phones the bottom tab bar covers the last 4rem, so the page leaves room for it. */}
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:pt-2">{children}</main>
        <MobileTabBar attentionCount={attentionCount} />
      </SidebarInset>
    </SidebarProvider>
  )
}
