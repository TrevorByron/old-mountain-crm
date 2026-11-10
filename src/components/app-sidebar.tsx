"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import {
  KanbanIcon,
  LogOutIcon,
  MapIcon,
  RefreshCwIcon,
  SendIcon,
  SunIcon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import { signOut } from "@/app/login/actions"
import { GlobalSearch } from "@/components/global-search"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type NavItem = { href: string; label: string; icon: LucideIcon; also?: string[] }

// Laid out like Flodesk: the everyday sections as tiles, the rest as a list. `also` lists other
// pages that belong under the same item, like Segments under Audience.
const TILES: NavItem[] = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/broadcasts", label: "Emails", icon: SendIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/trips", label: "Trips", icon: MapIcon },
]
const PEOPLE: NavItem[] = [{ href: "/subscribers", label: "Audience", icon: UsersIcon, also: ["/segments"] }]
const SETUP: NavItem[] = [
  { href: "/sync", label: "Airtable sync", icon: RefreshCwIcon },
  { href: "/team", label: "Team", icon: UsersRoundIcon },
]

function isActive(item: NavItem, pathname: string) {
  return [item.href, ...(item.also ?? [])].some((href) => pathname.startsWith(href))
}

const ITEM = "h-9 rounded-[10px] px-3 data-active:font-medium"

function NavList({ items, pathname, badges = {} }: { items: NavItem[]; pathname: string; badges?: Record<string, number> }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton tooltip={item.label} isActive={isActive(item, pathname)} render={<Link href={item.href} />} className={ITEM}>
            <item.icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
          {badges[item.href] > 0 && <SidebarMenuBadge>{badges[item.href]}</SidebarMenuBadge>}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

// Shared by the sidebar's account button and the phone header's account button.
export function SettingsMenuItems() {
  return (
    <>
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
        Sign out
      </DropdownMenuItem>
    </>
  )
}

export function AppSidebar({ name, email, attentionCount }: { name: string | null; email: string; attentionCount: number }) {
  const pathname = usePathname()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const badges = { "/today": attentionCount }

  // On phones the sidebar is a drawer, so picking a page closes it.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile])

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between px-3 pt-4 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-2">
        <Button variant="ghost" size="icon" aria-label="Close the menu" className="-ml-1 md:hidden" onClick={() => setOpenMobile(false)}>
          <XIcon className="size-5" />
        </Button>
        <Link href="/today" aria-label="Old Mountain Tours and Explorations, home" className="overflow-visible max-md:hidden">
          {collapsed ? (
            <Image src="/email/mark-gold.png" alt="" width={32} height={14} className="h-auto w-8 max-w-none" />
          ) : (
            <Image src="/email/logo-lockup.png" alt="" width={168} height={74} className="h-auto w-28" priority />
          )}
        </Link>
        <SidebarTrigger className="text-muted-foreground max-md:hidden" />
      </SidebarHeader>
      <SidebarContent className="gap-4">
        <SidebarGroup className="pt-2">
          <SidebarGroupContent>
            {/* Tiles when open; a plain icon list when the sidebar is collapsed. */}
            <div className="grid grid-cols-2 gap-2 group-data-[collapsible=icon]:hidden">
              {TILES.map((item) => {
                const active = isActive(item, pathname)
                return (
                  <Button
                    key={item.href}
                    variant="secondary"
                    nativeButton={false}
                    render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                    className={cn(
                      "relative h-[3.875rem] flex-col gap-1 rounded-xl border-transparent bg-sidebar-accent text-[0.8rem] font-normal",
                      active && "border-foreground bg-card font-medium"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {badges[item.href as keyof typeof badges] > 0 && (
                      <Badge className="absolute top-1.5 right-1.5 h-5 min-w-5 px-1.5">{badges[item.href as keyof typeof badges]}</Badge>
                    )}
                  </Button>
                )
              })}
            </div>
            <div className="hidden group-data-[collapsible=icon]:block">
              <NavList items={TILES} pathname={pathname} badges={badges} />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <NavList items={PEOPLE} pathname={pathname} />
            <SidebarMenu>
              <SidebarMenuItem>
                <GlobalSearch className={ITEM} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <NavList items={SETUP} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton aria-label="Your account" className={ITEM} />}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-xs">{(name || email).charAt(0).toUpperCase()}</span>
                <span className="truncate">{name || email}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOutIcon />
                  Sign out
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
