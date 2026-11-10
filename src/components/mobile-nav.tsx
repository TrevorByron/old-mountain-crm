"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SettingsIcon } from "lucide-react"

import { NAV_ITEMS, SettingsMenuItems, isNavItemActive } from "@/components/app-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// On phones the sections sit in a bar along the bottom, like an app, instead of a drawer.
export function MobileTabBar({ attentionCount }: { attentionCount: number }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname)
        return (
          <Button
            key={item.href}
            variant="ghost"
            nativeButton={false}
            render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
            className={cn(
              "relative h-auto flex-col gap-1 rounded-none py-2 text-xs font-normal text-muted-foreground hover:bg-transparent",
              active && "font-medium text-primary"
            )}
          >
            <item.icon className="size-5" />
            {item.label}
            {item.href === "/today" && attentionCount > 0 && (
              <Badge className="absolute top-1 left-1/2 ml-2 h-4 min-w-4 px-1 text-[0.625rem]">{attentionCount}</Badge>
            )}
          </Button>
        )
      })}
    </nav>
  )
}

export function MobileSettingsButton({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Settings" className="shrink-0 md:hidden" />}>
        <SettingsIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <SettingsMenuItems email={email} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
