"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  KanbanIcon,
  ListFilterIcon,
  LogOutIcon,
  MapIcon,
  RefreshCwIcon,
  SendIcon,
  SunIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react"

import { signOut } from "@/app/login/actions"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV_GROUPS = [
  { label: null, items: [{ href: "/today", label: "Today", icon: SunIcon }] },
  {
    label: "Customers",
    items: [
      { href: "/subscribers", label: "People", icon: UsersIcon },
      { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
      { href: "/trips", label: "Trips", icon: MapIcon },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/segments", label: "Segments", icon: ListFilterIcon },
      { href: "/broadcasts", label: "Campaigns", icon: SendIcon },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/sync", label: "Airtable sync", icon: RefreshCwIcon },
      { href: "/team", label: "Team", icon: UsersRoundIcon },
    ],
  },
]

export function AppSidebar({ email, attentionCount }: { email: string; attentionCount: number }) {
  const pathname = usePathname()
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/today" aria-label="Old Mountain Tours and Explorations, home" className="flex justify-center overflow-visible py-1">
          {collapsed ? (
            <Image src="/email/mark-gold.png" alt="" width={32} height={14} className="h-auto w-8 max-w-none" />
          ) : (
            <Image src="/email/logo-lockup.png" alt="" width={168} height={74} className="h-auto w-40" priority />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? "home"}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={pathname.startsWith(item.href)}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.href === "/today" && attentionCount > 0 && <SidebarMenuBadge>{attentionCount}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
      <SidebarRail />
    </Sidebar>
  )
}
