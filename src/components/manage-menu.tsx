"use client"

import { MoreHorizontalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type ManageAction = {
  label: string
  run: () => Promise<{ ok: boolean; error?: string }>
  // With a description it asks first. Reset and remove always should.
  title?: string
  description?: string
  destructive?: boolean
  success?: string
  redirectTo?: string
  hidden?: boolean
}

// The one place reset and remove live, so they're found the same way on every screen.
export function ManageMenu({ label, actions, className }: { label: string; actions: ManageAction[]; className?: string }) {
  const router = useRouter()
  const [active, setActive] = useState<ManageAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const shown = actions.filter((action) => !action.hidden)
  const plain = shown.filter((action) => !action.destructive)
  const destructive = shown.filter((action) => action.destructive)

  function execute(action: ManageAction) {
    startTransition(async () => {
      const result = await action.run()
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.")
        return
      }
      if (action.success) toast.success(action.success)
      if (action.redirectTo) router.push(action.redirectTo)
    })
  }

  const choose = (action: ManageAction) => (action.description ? setActive(action) : execute(action))
  const row = (action: ManageAction) => (
    <DropdownMenuItem key={action.label} variant={action.destructive ? "destructive" : "default"} disabled={isPending} onClick={() => choose(action)}>
      {action.label}
    </DropdownMenuItem>
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} className={cn("relative z-10", className)} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {plain.map(row)}
          {plain.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map(row)}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active?.title ?? `${active?.label}?`}</AlertDialogTitle>
            <AlertDialogDescription>{active?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant={active?.destructive ? "destructive" : "default"}
              onClick={() => {
                if (active) execute(active)
                setActive(null)
              }}
            >
              {active?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
