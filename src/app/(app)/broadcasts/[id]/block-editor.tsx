"use client"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  GripVerticalIcon,
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
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

function blockSummary(block: Block) {
  if (block.type === "text" || block.type === "image_text") {
    const words = (node: RichNode): string => node.text ?? (node.content ?? []).map(words).join(" ")
    const text = words(block.doc).replace(/\{\{[^}]*\}\}/g, "(name)").trim()
    return text || "Empty"
  }
  if (block.type === "image") return block.src ? block.alt || "No description yet" : "No photo yet"
  if (block.type === "button") return block.label || "No label yet"
  if (block.type === "logo") return { lockup: "Full logo", mark_gold: "Gold mountain", mark_cream: "Cream mountain" }[block.variant]
  if (block.type === "links") return block.items.map((item) => item.label).filter(Boolean).join(" · ") || "No links yet"
  if (block.type === "spacer") return SPACING_LABELS[block.spacing]
  return ""
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

function SortableBlock({
  block,
  position,
  total,
  selected,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  disabled,
  editorVersion,
}: {
  block: Block
  position: number
  total: number
  selected: boolean
  onSelect: () => void
  onChange: (changes: Partial<Block>) => void
  onMove: (delta: number) => void
  onDuplicate: () => void
  onRemove: () => void
  disabled?: boolean
  editorVersion: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled })
  const label = BLOCK_LABELS[block.type].label
  const Icon = BLOCK_ICONS[block.type]
  const row = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected])

  return (
    <div
      ref={(element) => {
        setNodeRef(element)
        row.current = element
      }}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
    >
      <Card size="sm" className={selected ? "gap-2 pt-1 pb-3 ring-2 ring-ring" : "gap-0 py-1"}>
        <div className="flex items-center gap-1 px-1">
          {!disabled && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-grab touch-none text-muted-foreground"
              aria-label={`Drag ${label} block`}
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-start gap-2 py-1.5 text-left"
            aria-expanded={selected}
            onClick={onSelect}
          >
            <Icon data-icon="inline-start" />
            <span className="min-w-0">
              <span className="block text-xs font-normal text-muted-foreground">{label}</span>
              <span className="block truncate font-medium">{blockSummary(block) || label}</span>
            </span>
          </Button>
          {!disabled && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${label}`} />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem disabled={position === 0} onClick={() => onMove(-1)}>
                  <ArrowUpIcon />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={position === total - 1} onClick={() => onMove(1)}>
                  <ArrowDownIcon />
                  Move down
                </DropdownMenuItem>
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
          )}
        </div>
        {selected && (
          <CardContent>
            <FieldGroup className="gap-4">
              <BlockFields block={block} onChange={onChange} disabled={disabled} editorVersion={editorVersion} />
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <Picker
                  label="Background"
                  id={`${block.id}-background`}
                  disabled={disabled}
                  value={block.background ?? NONE}
                  items={[{ value: NONE, label: "None" }, ...COLOR_ITEMS]}
                  onChange={(value) => onChange({ background: value === NONE ? null : (value as ColorKey) })}
                />
                <Picker
                  label={block.type === "spacer" ? "Height" : "Spacing"}
                  id={`${block.id}-spacing`}
                  disabled={disabled}
                  value={block.spacing}
                  items={(Object.keys(SPACING) as (keyof typeof SPACING)[]).map((key) => ({ value: key, label: SPACING_LABELS[key] }))}
                  onChange={(value) => onChange({ spacing: value as keyof typeof SPACING })}
                />
              </div>
            </FieldGroup>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

const ADDABLE: BlockType[] = ["text", "image", "image_text", "button", "logo", "divider", "spacer", "links"]

function AddBlockMenu({ onAdd, between }: { onAdd: (type: BlockType) => void; between?: boolean }) {
  return (
    <DropdownMenu>
      {between ? (
        <div className="group/add flex h-3 items-center justify-center">
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Add a block here"
                className="opacity-0 transition-opacity group-hover/add:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
              />
            }
          >
            <PlusIcon />
          </DropdownMenuTrigger>
        </div>
      ) : (
        <DropdownMenuTrigger render={<Button variant="outline" className="w-full" />}>
          <PlusIcon data-icon="inline-start" />
          Add a block
        </DropdownMenuTrigger>
      )}
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

export function BlockEditor({
  content,
  onChange,
  onStructureChange,
  onRemoved,
  selectedId,
  onSelect,
  disabled,
  editorVersion,
}: {
  content: EmailContent
  onChange: (content: EmailContent) => void
  onStructureChange: (content: EmailContent) => void
  onRemoved: () => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  disabled?: boolean
  editorVersion: number
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const { blocks } = content
  const setBlocks = (next: Block[]) => onChange({ ...content, blocks: next })
  const restructure = (next: Block[]) => onStructureChange({ ...content, blocks: next })

  function add(type: BlockType, index: number) {
    const block = newBlock(type)
    restructure([...blocks.slice(0, index), block, ...blocks.slice(index)])
    onSelect(block.id)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    restructure(
      arrayMove(
        blocks,
        blocks.findIndex((item) => item.id === active.id),
        blocks.findIndex((item) => item.id === over.id)
      )
    )
  }

  return (
    <div className="flex flex-col">
      <DndContext id="email-blocks" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block, index) => (
            <div key={block.id}>
              <SortableBlock
                block={block}
                position={index}
                total={blocks.length}
                disabled={disabled}
                editorVersion={editorVersion}
                selected={selectedId === block.id}
                onSelect={() => onSelect(selectedId === block.id ? null : block.id)}
                onChange={(changes) =>
                  setBlocks(blocks.map((item) => (item.id === block.id ? ({ ...item, ...changes } as Block) : item)))
                }
                onMove={(delta) => restructure(arrayMove(blocks, index, index + delta))}
                onDuplicate={() => {
                  const copy = { ...block, id: crypto.randomUUID() }
                  restructure([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)])
                  onSelect(copy.id)
                }}
                onRemove={() => {
                  restructure(blocks.filter((item) => item.id !== block.id))
                  if (selectedId === block.id) onSelect(null)
                  onRemoved()
                }}
              />
              {!disabled && index < blocks.length - 1 && <AddBlockMenu between onAdd={(type) => add(type, index + 1)} />}
            </div>
          ))}
        </SortableContext>
      </DndContext>
      {!disabled && (
        <div className="mt-3">
          <AddBlockMenu onAdd={(type) => add(type, blocks.length)} />
        </div>
      )}
    </div>
  )
}
