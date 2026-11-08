import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { requireTeamMember } from "@/lib/auth"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { member } = await requireTeamMember()

  return (
    <SidebarProvider>
      <AppSidebar email={member.email} />
      <SidebarInset>
        <header className="flex h-12 items-center border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
