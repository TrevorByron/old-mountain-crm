import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { GlobalSearch } from "@/components/global-search"
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
        <header className="flex h-12 items-center gap-2 px-2 pt-2 md:px-4">
          <SidebarTrigger />
          <GlobalSearch />
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 pt-2 md:p-6 md:pt-2">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
