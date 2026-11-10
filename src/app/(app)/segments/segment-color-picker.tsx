"use client"

import { CheckIcon, PaletteIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SEGMENT_COLORS, segmentColorHex, type SegmentColor } from "@/lib/segments/colors"
import { cn } from "@/lib/utils"

import { updateSegmentColor } from "./actions"

export function SegmentColorPicker({
  value,
  onChange,
  disabled,
  className = "grid-cols-5 sm:grid-cols-10",
}: {
  value: SegmentColor
  onChange: (color: SegmentColor) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label="Color"
      className={cn("grid w-full gap-2", className)}
      spacing={2}
      disabled={disabled}
      value={[value]}
      onValueChange={(next: string[]) => next[0] && onChange(next[0] as SegmentColor)}
    >
      {SEGMENT_COLORS.map((color) => (
        <ToggleGroupItem
          key={color.key}
          value={color.key}
          aria-label={color.label}
          title={color.label}
          className="aspect-square h-auto w-full min-w-0 rounded-lg border border-black/10 text-neutral-900 hover:opacity-90 data-[pressed]:ring-2 data-[pressed]:ring-ring data-[pressed]:ring-offset-2 data-[pressed]:ring-offset-background"
          style={{ backgroundColor: color.hex }}
        >
          {value === color.key && <CheckIcon />}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// Changes a saved segment's color. As a swatch it shows the color itself; as an icon it sits in a toolbar.
export function SegmentColorButton({
  id,
  color: savedColor,
  appearance = "swatch",
  className,
}: {
  id: string
  color: string
  appearance?: "swatch" | "icon"
  className?: string
}) {
  const router = useRouter()
  const [color, setColor] = useState(savedColor as SegmentColor)
  const [known, setKnown] = useState(savedColor)
  const [isPending, startTransition] = useTransition()

  if (known !== savedColor) {
    setKnown(savedColor)
    setColor(savedColor as SegmentColor)
  }

  function change(next: SegmentColor) {
    const previous = color
    setColor(next)
    startTransition(async () => {
      const result = await updateSegmentColor({ id, color: next })
      if (!result.ok) {
        toast.error(result.error)
        setColor(previous)
        return
      }
      router.refresh()
    })
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          appearance === "swatch" ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Change color"
              title="Change color"
              className={cn("border-black/10 text-neutral-900/60 hover:text-neutral-900", className)}
              style={{ backgroundColor: segmentColorHex(color) }}
            />
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Change color" title="Change color" className={className} />
          )
        }
      >
        <PaletteIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Color</PopoverTitle>
        </PopoverHeader>
        <SegmentColorPicker value={color} onChange={change} disabled={isPending} className="grid-cols-5" />
      </PopoverContent>
    </Popover>
  )
}
