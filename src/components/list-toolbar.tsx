"use client"

import { useState } from "react"
import { ChevronDownIcon, LayoutGridIcon, ListIcon, SearchIcon, XIcon, type LucideIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import type { SimpleOption } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

// The pieces of a Flodesk-style list page. On phones each control shows as just its icon.

// The page heading (with the controls beside it on phones), then a toolbar row with tabs on the
// left and the controls and buttons on the right. On phones `fab` replaces the buttons with a
// floating + button. Without a heading, the controls stay in the toolbar row on phones too.
export function ListLayout({
  heading,
  description,
  tabs,
  controls,
  actions,
  fab,
  children,
}: {
  heading?: string
  description?: string
  tabs?: React.ReactNode
  controls: React.ReactNode
  actions?: React.ReactNode
  fab?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      {heading && (
        <div className="relative">
          <PageHeader title={heading} description={description}>
            <div className="flex items-center gap-1 md:hidden">{controls}</div>
          </PageHeader>
        </div>
      )}
      <div className="relative flex flex-wrap items-center gap-2">
        {tabs && <div className="mr-auto min-w-0 [scrollbar-width:none] max-md:-mx-4 max-md:overflow-x-auto max-md:px-4">{tabs}</div>}
        <div className={`flex items-center gap-1 ${heading ? "max-md:hidden" : ""} ${tabs ? "" : "ml-auto"}`}>{controls}</div>
        {actions && <div className={`flex flex-wrap items-center gap-2 ${fab ? "max-md:hidden" : ""}`}>{actions}</div>}
      </div>
      {fab}
      {children}
    </div>
  )
}

// Flodesk's grid or list switch: two icons in a gray tray, the chosen one on white. Phones always
// get the grid, so it hides there.
export function ViewSwitch({ view, onChange }: { view: string; onChange: (view: string) => void }) {
  return (
    <ToggleGroup aria-label="View" value={[view]} onValueChange={(next: string[]) => next[0] && onChange(next[0])} className="ml-1 rounded-xl bg-secondary p-0.5 max-md:hidden">
      <ToggleGroupItem value="grid" aria-label="Show as cards" className="h-8 w-10 rounded-[10px] aria-pressed:bg-card aria-pressed:shadow-sm">
        <LayoutGridIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="Show as a list" className="h-8 w-10 rounded-[10px] aria-pressed:bg-card aria-pressed:shadow-sm">
        <ListIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

// Pills that pick one view of a list, like Flodesk's "Overview" and "Folders".
export function ToolbarPills({ label, items, value, onChange }: { label: string; items: SimpleOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(String(next))}>
      <TabsList aria-label={label}>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value} className="flex-none">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// A search icon that opens into a search box. On phones the box covers the row it sits in, so the
// row needs `relative`.
export function ToolbarSearch({ label, placeholder = "Search", value, onChange }: { label: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)

  if (!open && !value) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} onClick={() => setOpen(true)}>
        <SearchIcon />
      </Button>
    )
  }

  function close() {
    onChange("")
    setOpen(false)
  }

  return (
    <InputGroup className="w-52 bg-card max-md:absolute max-md:inset-x-0 max-md:z-10 max-md:w-auto">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && close()}
        onBlur={() => !value && setOpen(false)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Close search" onClick={close}>
          <XIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

// "Sort ▾" or "Status ▾": a quiet button that opens a list to pick one from. Once something other
// than the first choice is picked, the button shows it.
export function ToolbarMenu({
  label,
  icon: Icon,
  items,
  value,
  onChange,
  showChoice = false,
}: {
  label: string
  icon: LucideIcon
  items: SimpleOption[]
  value: string
  onChange: (value: string) => void
  showChoice?: boolean
}) {
  const chosen = showChoice && value !== items[0]?.value ? items.find((item) => item.value === value)?.label : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" aria-label={label} className="max-md:size-9 max-md:px-0" />}>
        <Icon className="md:hidden" />
        <span className="max-md:hidden">{chosen ?? label}</span>
        <ChevronDownIcon data-icon="inline-end" className="max-md:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(String(next))}>
          {items.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value}>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
