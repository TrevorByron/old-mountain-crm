"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { SimpleSelect, type SimpleOption } from "@/components/simple-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatMoney, parseMoney } from "@/lib/pipeline/stages"
import { cn } from "@/lib/utils"

type SaveResult = { ok: boolean; error?: string } | void

// Looks like plain text until you point at it. The value on the page is the field.
const BARE =
  "h-auto min-h-7 rounded-md border-transparent bg-transparent px-1 py-0.5 shadow-none hover:border-input dark:bg-transparent md:text-[length:inherit]"
const SAVED = "border-chart-2"

function useSaver() {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function run(action: () => Promise<SaveResult>, revert: () => void) {
    startTransition(async () => {
      const result = await action()
      if (result && !result.ok) {
        toast.error(result.error ?? "Couldn't save that.")
        revert()
        return
      }
      setSaved(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 1200)
    })
  }
  return { run, isPending, saved }
}

// Saves when you leave the field or press Enter. Escape puts the old value back.
export function InlineText({
  value,
  onSave,
  label,
  placeholder,
  type,
  multiline,
  rows = 2,
  format,
  required,
  debounce,
  className,
}: {
  value: string | null
  onSave: (value: string) => Promise<SaveResult>
  label: string
  placeholder?: string
  type?: string
  multiline?: boolean
  rows?: number
  format?: (value: string) => string
  required?: boolean
  debounce?: number
  className?: string
}) {
  const current = value ?? ""
  const [draft, setDraft] = useState(current)
  const [known, setKnown] = useState(current)
  const [focused, setFocused] = useState(false)
  const { run, saved } = useSaver()

  // Another save can change this value, such as a deposit filling in the total.
  if (known !== current) {
    setKnown(current)
    if (!focused) setDraft(current)
  }

  const lastSent = useRef(current)
  function save(next: string) {
    const trimmed = next.trim()
    if (trimmed === lastSent.current || trimmed === current) return
    if (required && !trimmed) {
      toast.error(`${label} can't be empty.`)
      setDraft(current)
      return
    }
    lastSent.current = trimmed
    run(
      () => onSave(trimmed),
      () => {
        lastSent.current = current
        setDraft(current)
      }
    )
  }

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    if (!debounce || !focused || draft.trim() === current) return
    const wait = setTimeout(() => saveRef.current(draft), debounce)
    return () => clearTimeout(wait)
  }, [draft, debounce, focused, current])

  const shown = !focused && format && current ? format(current) : draft
  const classes = cn(BARE, saved && SAVED, className)
  const shared = {
    "aria-label": label,
    placeholder,
    value: shown,
    onFocus: (event: React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      lastSent.current = current
      setFocused(true)
      // A formatted value like $2,000 swaps to 2000 here. Selecting it means typing replaces
      // the amount, where a stray caret would turn 2000 into 20002500.
      if (format) {
        const field = event.target
        requestAnimationFrame(() => field.select())
      }
    },
    onBlur: () => {
      setFocused(false)
      save(draft)
    },
  }

  if (multiline) {
    return <Textarea {...shared} rows={rows} className={cn(classes, "field-sizing-content resize-none")} onChange={(event) => setDraft(event.target.value)} />
  }

  return (
    <Input
      {...shared}
      className={classes}
      type={type}
      onChange={(event) => {
        setDraft(event.target.value)
        // A date picker has no typing to wait for, so a finished date saves straight away.
        if (type === "date" && event.target.value) save(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setDraft(current)
          lastSent.current = current
          requestAnimationFrame(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
        }
      }}
    />
  )
}

export function InlineMoney({
  value,
  onSave,
  label,
  placeholder = "Add amount",
  className,
}: {
  value: number | string | null
  onSave: (value: number | null) => Promise<SaveResult>
  label: string
  placeholder?: string
  className?: string
}) {
  return (
    <InlineText
      value={value === null ? null : String(Number(value))}
      label={label}
      placeholder={placeholder}
      format={formatMoney}
      className={cn("tabular-nums", className)}
      onSave={async (text) => {
        const parsed = parseMoney(text)
        if (Number.isNaN(parsed)) return { ok: false, error: "Enter an amount, like 3000." }
        return onSave(parsed)
      }}
    />
  )
}

export function InlineSelect({
  value,
  items,
  onSave,
  label,
  placeholder,
  className,
}: {
  value: string | null
  items: SimpleOption[]
  onSave: (value: string) => Promise<SaveResult>
  label: string
  placeholder?: string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const [known, setKnown] = useState(value)
  const { run, saved } = useSaver()

  if (known !== value) {
    setKnown(value)
    setShown(value)
  }

  return (
    <SimpleSelect
      label={label}
      items={items}
      value={shown}
      placeholder={placeholder}
      onChange={(next) => {
        setShown(next)
        run(
          () => onSave(next),
          () => setShown(value)
        )
      }}
      className={cn("h-7 w-fit max-w-full border-transparent bg-transparent px-1 shadow-none hover:border-input dark:bg-transparent", saved && SAVED, className)}
    />
  )
}

// Ticks straight away, so nobody clicks twice while the save is on its way.
export function InlineCheckbox({
  id,
  checked,
  onSave,
  label,
  disabled,
}: {
  id?: string
  checked: boolean
  onSave: (checked: boolean) => Promise<SaveResult>
  label?: string
  disabled?: boolean
}) {
  const [shown, setShown] = useState(checked)
  const [known, setKnown] = useState(checked)
  const { run } = useSaver()

  if (known !== checked) {
    setKnown(checked)
    setShown(checked)
  }

  return (
    <Checkbox
      id={id}
      aria-label={label}
      checked={shown}
      disabled={disabled}
      onCheckedChange={(next) => {
        setShown(Boolean(next))
        run(
          () => onSave(Boolean(next)),
          () => setShown(checked)
        )
      }}
    />
  )
}
