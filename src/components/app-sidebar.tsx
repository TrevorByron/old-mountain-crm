"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOutIcon, RefreshCwIcon, UsersIcon, UsersRoundIcon } from "lucide-react"

import { signOut } from "@/app/login/actions"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const NAV_ITEMS = [
  { href: "/subscribers", label: "Subscribers", icon: UsersIcon },
  { href: "/sync", label: "Airtable sync", icon: RefreshCwIcon },
  { href: "/team", label: "Team", icon: UsersRoundIcon },
]

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/subscribers" />}>
              <span className="font-heading font-semibold">Old Mountain</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton type="submit" tooltip={email}>
                <LogOutIcon />
                <span className="truncate">Sign out {email}</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
