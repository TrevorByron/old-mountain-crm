import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { MobileHeader } from "@/components/mobile-nav"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { requireTeamMember } from "@/lib/auth"
import { loadAttention } from "@/lib/pipeline/attention"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { member, supabase } = await requireTeamMember()
  const { count: attentionCount } = await loadAttention(supabase)
  const cookieStore = await cookies()

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar name={member.name} email={member.email} attentionCount={attentionCount} />
      {/* Like Flodesk, each page sits on a white panel with round corners over the gray app
          background, and scrolls inside it. On phones the panel is a sheet under the top bar. */}
      <SidebarInset className="min-w-0 bg-background md:h-[calc(100svh-2rem)] md:overflow-y-auto md:peer-data-[variant=inset]:m-4 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-3xl md:peer-data-[variant=inset]:bg-card md:peer-data-[variant=inset]:shadow-none">
        <header className="flex h-[calc(4.5rem+env(safe-area-inset-top))] shrink-0 items-center px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <MobileHeader name={member.name} email={member.email} />
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 bg-card px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] max-md:rounded-t-3xl md:gap-8 md:px-8 md:py-10 lg:px-14 lg:py-14">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
