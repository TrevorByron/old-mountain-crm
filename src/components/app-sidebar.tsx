"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  KanbanIcon,
  ListFilterIcon,
  LogOutIcon,
  SettingsIcon,
  MapIcon,
  RefreshCwIcon,
  SendIcon,
  SunIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react"

import { signOut } from "@/app/login/actions"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  {
    label: null,
    items: [
      { href: "/today", label: "Today", icon: SunIcon },
      { href: "/subscribers", label: "People", icon: UsersIcon },
      { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
      { href: "/trips", label: "Trips", icon: MapIcon },
      { href: "/segments", label: "Segments", icon: ListFilterIcon },
      { href: "/broadcasts", label: "Campaigns", icon: SendIcon },
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
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton aria-label="Settings" />}>
                <SettingsIcon />
                <span className="truncate">Settings</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem render={<Link href="/sync" />}>
                  <RefreshCwIcon />
                  Airtable sync
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/team" />}>
                  <UsersRoundIcon />
                  Team
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOutIcon />
                  Sign out {email}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
