"use client"

import Image from "next/image"
import Link from "next/link"
import { MenuIcon } from "lucide-react"

import { SettingsMenuItems } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"

// The phone top bar, like Flodesk's: the menu opens the sidebar as a drawer, the logo sits in the
// middle, and your initial opens your account.
export function MobileHeader({ name, email }: { name: string | null; email: string }) {
  const { toggleSidebar } = useSidebar()

  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
      <Button variant="ghost" size="icon-lg" aria-label="Open the menu" className="-ml-2" onClick={toggleSidebar}>
        <MenuIcon className="size-5" />
      </Button>
      <Link href="/today" aria-label="Old Mountain, home">
        <Image src="/email/logo-lockup.png" alt="" width={168} height={74} className="h-auto w-24" priority />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon-lg" aria-label="Your account and settings" className="justify-self-end rounded-[0.625rem] bg-card font-normal" />}
        >
          {(name || email).trim().charAt(0).toUpperCase()}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{name || email}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <SettingsMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
