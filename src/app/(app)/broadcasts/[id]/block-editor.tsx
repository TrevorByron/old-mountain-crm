"use client"

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  ImageIcon,
  LayoutPanelLeftIcon,
  LinkIcon,
  MinusIcon,
  MountainIcon,
  MoreHorizontalIcon,
  MoveVerticalIcon,
  PlusIcon,
  RectangleHorizontalIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import type { ReactElement, ReactNode, Ref } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  BLOCK_LABELS,
  COLORS,
  FONTS,
  SPACING,
  newBlock,
  type Block,
  type BlockType,
  type ColorKey,
  type EmailContent,
  type RichNode,
} from "@/lib/broadcasts/blocks"

import { PhotoPicker } from "./photo-picker"
import { RichTextEditor } from "./rich-text-editor"

const NONE = "__none__"
const SPACING_LABELS: Record<keyof typeof SPACING, string> = {
  none: "None",
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "Extra large",
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={label}
        disabled={disabled}
        value={[String(value)]}
        onValueChange={(next: string[]) => {
          const match = options.find((option) => String(option.value) === next[0])
          if (match) onChange(match.value)
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}

function Picker({
  label,
  id,
  items,
  value,
  onChange,
  disabled,
}: {
  label: string
  id: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} disabled={disabled} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
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
    </Field>
  )
}

const COLOR_ITEMS = (Object.entries(COLORS) as [ColorKey, (typeof COLORS)[ColorKey]][]).map(([value, color]) => ({
  value,
  label: color.label,
}))

const ALIGN_OPTIONS = [
  { value: "left" as const, label: "Left" },
  { value: "center" as const, label: "Center" },
  { value: "right" as const, label: "Right" },
]

function Toggle({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(Boolean(next))} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

function BlockFields({
  block,
  onChange,
  disabled,
  editorVersion,
}: {
  block: Block
  onChange: (changes: Partial<Block>) => void
  disabled?: boolean
  editorVersion: number
}) {
  const id = block.id
  const docEditor = (doc: RichNode) => (
    <RichTextEditor key={`${id}-${editorVersion}`} doc={doc} disabled={disabled} onChange={(next) => onChange({ doc: next })} />
  )

  switch (block.type) {
    case "text":
      return docEditor(block.doc)
    case "logo":
      return (
        <>
          <Choice
            label="Logo"
            disabled={disabled}
            value={block.variant}
            options={[
              { value: "lockup", label: "Full" },
              { value: "mark_gold", label: "Gold mark" },
              { value: "mark_cream", label: "Cream mark" },
            ]}
            onChange={(variant) => onChange({ variant })}
          />
          <Choice
            label="Size"
            disabled={disabled}
            value={block.size}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
            onChange={(size) => onChange({ size })}
          />
          <Choice label="Position" disabled={disabled} value={block.align} options={ALIGN_OPTIONS} onChange={(align) => onChange({ align })} />
        </>
      )
    case "image":
      return (
        <>
          <PhotoPicker photo={block} disabled={disabled} onChange={onChange} />
          <Choice
            label="Width"
            disabled={disabled}
            value={block.width}
            options={[
              { value: 100, label: "Full" },
              { value: 75, label: "3/4" },
              { value: 50, label: "Half" },
              { value: 33, label: "1/3" },
            ]}
            onChange={(width) => onChange({ width })}
          />
          <Choice label="Position" disabled={disabled} value={block.align} options={ALIGN_OPTIONS} onChange={(align) => onChange({ align })} />
          <div className="flex flex-wrap gap-4">
            <Toggle id={`${id}-bleed`} label="Edge to edge" disabled={disabled} checked={block.bleed} onChange={(bleed) => onChange({ bleed })} />
            <Toggle id={`${id}-rounded`} label="Rounded corners" disabled={disabled} checked={block.rounded} onChange={(rounded) => onChange({ rounded })} />
          </div>
          <Field>
            <FieldLabel htmlFor={`${id}-link`}>Link when clicked (optional)</FieldLabel>
            <Input
              id={`${id}-link`}
              type="url"
              placeholder="https://www.old-mountain.com"
              disabled={disabled}
              value={block.link}
              onChange={(event) => onChange({ link: event.target.value })}
            />
          </Field>
        </>
      )
    case "image_text":
      return (
        <>
          <PhotoPicker photo={block} disabled={disabled} onChange={onChange} />
          <Choice
            label="Photo side"
            disabled={disabled}
            value={block.side}
            options={[
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
            onChange={(side) => onChange({ side })}
          />
          <Toggle id={`${id}-rounded`} label="Rounded corners" disabled={disabled} checked={block.rounded} onChange={(rounded) => onChange({ rounded })} />
          {docEditor(block.doc)}
        </>
      )
    case "button":
      return (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-label`}>Label</FieldLabel>
            <Input id={`${id}-label`} placeholder="Hold my seat" disabled={disabled} value={block.label} onChange={(event) => onChange({ label: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-url`}>Link</FieldLabel>
            <Input id={`${id}-url`} type="url" placeholder="https://www.old-mountain.com" disabled={disabled} value={block.url} onChange={(event) => onChange({ url: event.target.value })} />
          </Field>
          <Choice
            label="Style"
            disabled={disabled}
            value={block.style}
            options={[
              { value: "gold", label: "Gold" },
              { value: "olive", label: "Olive" },
              { value: "dark", label: "Dark" },
              { value: "outline", label: "Outline" },
            ]}
            onChange={(style) => onChange({ style })}
          />
          <Picker
            label="Font"
            id={`${id}-font`}
            disabled={disabled}
            value={block.font}
            items={(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((key) => ({ value: key, label: FONTS[key].label }))}
            onChange={(font) => onChange({ font: font as keyof typeof FONTS })}
          />
          <Choice label="Position" disabled={disabled} value={block.align} options={ALIGN_OPTIONS} onChange={(align) => onChange({ align })} />
          <Toggle id={`${id}-full`} label="Full width" disabled={disabled} checked={block.fullWidth} onChange={(fullWidth) => onChange({ fullWidth })} />
        </>
      )
    case "divider":
      return (
        <>
          <Picker label="Color" id={`${id}-color`} disabled={disabled} value={block.color} items={COLOR_ITEMS} onChange={(color) => onChange({ color: color as ColorKey })} />
          <Choice
            label="Width"
            disabled={disabled}
            value={block.width}
            options={[
              { value: 100, label: "Full" },
              { value: 50, label: "Half" },
              { value: 25, label: "Short" },
            ]}
            onChange={(width) => onChange({ width })}
          />
        </>
      )
    case "spacer":
      return null
    case "links":
      return (
        <>
          {block.items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Link ${index + 1} label`}
                placeholder="Instagram"
                disabled={disabled}
                value={item.label}
                onChange={(event) =>
                  onChange({ items: block.items.map((other, position) => (position === index ? { ...other, label: event.target.value } : other)) })
                }
              />
              <Input
                aria-label={`Link ${index + 1} address`}
                type="url"
                placeholder="https://"
                disabled={disabled}
                value={item.url}
                onChange={(event) =>
                  onChange({ items: block.items.map((other, position) => (position === index ? { ...other, url: event.target.value } : other)) })
                }
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove link ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange({ items: block.items.filter((_, position) => position !== index) })}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          {block.items.length < 8 && (
            <div>
              <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange({ items: [...block.items, { label: "", url: "" }] })}>
                <PlusIcon data-icon="inline-start" />
                Add link
              </Button>
            </div>
          )}
          <Choice label="Position" disabled={disabled} value={block.align} options={ALIGN_OPTIONS} onChange={(align) => onChange({ align })} />
        </>
      )
  }
}

const BLOCK_ICONS: Record<BlockType, typeof TypeIcon> = {
  text: TypeIcon,
  image: ImageIcon,
  image_text: LayoutPanelLeftIcon,
  button: RectangleHorizontalIcon,
  logo: MountainIcon,
  divider: MinusIcon,
  spacer: MoveVerticalIcon,
  links: LinkIcon,
}

const ADDABLE: BlockType[] = ["text", "image", "image_text", "button", "logo", "divider", "spacer", "links"]

export function AddBlockMenu({
  onAdd,
  trigger,
  children,
}: {
  onAdd: (type: BlockType) => void
  trigger: ReactElement
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        {ADDABLE.map((type) => {
          const Icon = BLOCK_ICONS[type]
          return (
            <DropdownMenuItem key={type} onClick={() => onAdd(type)}>
              <Icon />
              <span className="flex flex-col">
                <span className="font-medium">{BLOCK_LABELS[type].label}</span>
                <span className="text-xs text-muted-foreground">{BLOCK_LABELS[type].description}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Floats over the block you clicked in the email. Text is written on the email itself, and
// its formatting tools land in the slot at the bottom of this bar.
export function BlockBar({
  block,
  position,
  total,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
  onDone,
  editorVersion,
  formattingRef,
}: {
  block: Block
  position: number
  total: number
  onChange: (changes: Partial<Block>) => void
  onMove: (delta: number) => void
  onDuplicate: () => void
  onRemove: () => void
  onAdd: (type: BlockType) => void
  onDone: () => void
  editorVersion: number
  formattingRef: Ref<HTMLDivElement>
}) {
  const label = BLOCK_LABELS[block.type].label
  const Icon = BLOCK_ICONS[block.type]
  const hasFields = block.type !== "text" && block.type !== "spacer"

  return (
    <div
      role="toolbar"
      aria-label={`${label} block`}
      className="mx-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground max-sm:hidden">
          <Icon className="size-3.5" />
          {label}
        </span>
        {hasFields && (
          <Popover>
            <PopoverTrigger render={<Button variant="secondary" size="sm" />}>Edit {label.toLowerCase()}</PopoverTrigger>
            <PopoverContent align="start" className="max-h-[70svh] w-80 overflow-y-auto">
              <FieldGroup className="gap-4">
                <BlockFields block={block} onChange={onChange} editorVersion={editorVersion} />
              </FieldGroup>
            </PopoverContent>
          </Popover>
        )}
        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="sm" />}>{block.type === "spacer" ? "Height" : "Spacing"}</PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <FieldGroup className="gap-4">
              <Picker
                label={block.type === "spacer" ? "Height" : "Space around it"}
                id={`${block.id}-spacing`}
                value={block.spacing}
                items={(Object.keys(SPACING) as (keyof typeof SPACING)[]).map((key) => ({ value: key, label: SPACING_LABELS[key] }))}
                onChange={(value) => onChange({ spacing: value as keyof typeof SPACING })}
              />
              <Picker
                label="Background"
                id={`${block.id}-background`}
                value={block.background ?? NONE}
                items={[{ value: NONE, label: "None" }, ...COLOR_ITEMS]}
                onChange={(value) => onChange({ background: value === NONE ? null : (value as ColorKey) })}
              />
            </FieldGroup>
          </PopoverContent>
        </Popover>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <AddBlockMenu onAdd={onAdd} trigger={<Button variant="ghost" size="icon-sm" aria-label="Add a block below" />}>
          <PlusIcon />
        </AddBlockMenu>
        <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={position === 0} onClick={() => onMove(-1)}>
          <ArrowUpIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={position === total - 1} onClick={() => onMove(1)}>
          <ArrowDownIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${label}`} />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onDuplicate}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
      {block.type === "text" && <div ref={formattingRef} className="border-t pt-1 empty:hidden" />}
    </div>
  )
}
