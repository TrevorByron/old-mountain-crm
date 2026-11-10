"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

// Buttons on the dark bar: light text, and a faint light fill on hover or while their menu is open.
export const BULK_BUTTON = "text-background hover:bg-background/10 hover:text-background aria-expanded:bg-background/10 aria-expanded:text-background"

// Flodesk's bulk actions: a dark bar floating over the bottom of the page while anything is
// selected, with the count, the actions, and a way to clear the selection.
export function BulkBar({ count, label, onClear, children }: { count: number; label: string; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto rounded-2xl bg-foreground/90 p-1.5 pl-5 text-background shadow-lg backdrop-blur [scrollbar-width:none]"
    >
      <span className="shrink-0 pr-2 text-sm whitespace-nowrap text-background/70">{count} selected</span>
      {children}
      <Separator orientation="vertical" className="mx-1 h-6 bg-background/20" />
      <Button variant="ghost" size="icon" aria-label="Clear the selection" className={BULK_BUTTON} onClick={onClear}>
        <XIcon />
      </Button>
    </div>
  )
}
