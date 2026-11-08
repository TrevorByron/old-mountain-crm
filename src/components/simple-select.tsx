"use client"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type SimpleOption = { value: string; label: string }

// The shadcn Select in the one shape most forms need.
export function SimpleSelect({
  id,
  label,
  items,
  value,
  onChange,
  placeholder,
  disabled,
  className = "w-full",
}: {
  id?: string
  label?: string
  items: SimpleOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Select items={items} value={value} disabled={disabled} onValueChange={(next) => next !== null && onChange(next)}>
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
