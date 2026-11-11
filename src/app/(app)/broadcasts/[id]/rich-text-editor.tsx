"use client"

import TextAlign from "@tiptap/extension-text-align"
import { TextStyleKit } from "@tiptap/extension-text-style"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { EditorContent, Extension, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PaletteIcon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UserRoundIcon,
} from "lucide-react"
import { useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { COLORS, FONTS, FONT_SIZES, type RichNode } from "@/lib/broadcasts/blocks"

// Shows {{first_name|there}} as a highlighted token rather than as code to get right.
const MergeTagHighlight = Extension.create({
  name: "mergeTagHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, position) => {
              if (!node.isText) return
              for (const match of (node.text ?? "").matchAll(/\{\{[^}]*\}\}/g)) {
                const start = position + match.index
                decorations.push(
                  Decoration.inline(start, start + match[0].length, { class: "rounded bg-accent px-1 font-mono text-xs" })
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

const TEXT_STYLES = [
  { value: "paragraph", label: "Paragraph" },
  { value: "1", label: "Title" },
  { value: "2", label: "Heading" },
  { value: "3", label: "Gold label" },
]
const DEFAULT = "__default__"
const FONT_ITEMS = [
  { value: DEFAULT, label: "Font" },
  ...Object.values(FONTS).map((font) => ({ value: font.stack as string, label: font.label })),
]
const SIZE_ITEMS = [
  { value: DEFAULT, label: "Size" },
  ...FONT_SIZES.map((size) => ({ value: size as string, label: size.replace("px", "") })),
]

function ToolbarSelect({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className: string
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger size="sm" aria-label={label} className={className}>
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
  )
}

function MarkToggle({
  label,
  pressed,
  onPressed,
  children,
}: {
  label: string
  pressed: boolean
  onPressed: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Toggle size="sm" aria-label={label} pressed={pressed} onPressedChange={onPressed} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function LinkPopover({ editor, active }: { editor: Editor; active: boolean }) {
  const [url, setUrl] = useState("")

  function apply() {
    const trimmed = url.trim()
    if (!trimmed) return
    const href = /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) setUrl((editor.getAttributes("link").href as string | undefined) ?? "")
      }}
    >
      <PopoverTrigger render={<Toggle size="sm" aria-label="Link" pressed={active} />}>
        <LinkIcon />
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2">
        <Input
          aria-label="Link address"
          placeholder="https://www.old-mountain.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              apply()
            }
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={apply}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().unsetLink().run()}>
            Remove link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ColorPopover({ editor, current }: { editor: Editor; current: string }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Text color" />}>
        <PaletteIcon style={current ? { color: current } : undefined} />
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col gap-2">
        <div className="grid grid-cols-7 gap-1">
          {Object.values(COLORS).map((color) => (
            <Tooltip key={color.value}>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={color.label}
                    style={{ backgroundColor: color.value }}
                    onClick={() => editor.chain().focus().setColor(color.value).run()}
                  />
                }
              />
              <TooltipContent>{color.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().unsetColor().run()}>
          Automatic color
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function FirstNamePopover({ editor }: { editor: Editor }) {
  const [fallback, setFallback] = useState("there")
  const [open, setOpen] = useState(false)

  function insert() {
    const words = fallback.replace(/[{}|]/g, "").trim() || "there"
    editor.chain().focus().insertContent(`{{first_name|${words}}}`).run()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <UserRoundIcon data-icon="inline-start" />
        First name
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2">
        <Label htmlFor="first-name-fallback">If we don&apos;t have their name, say:</Label>
        <Input
          id="first-name-fallback"
          value={fallback}
          onChange={(event) => setFallback(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              insert()
            }
          }}
        />
        <div>
          <Button size="sm" onClick={insert}>
            Insert first name
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({ editor, className = "flex flex-col gap-1 border-b p-1" }: { editor: Editor; className?: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const level = [1, 2, 3].find((value) => current.isActive("heading", { level: value }))
      const style = current.getAttributes("textStyle")
      return {
        block: level ? String(level) : "paragraph",
        font: (style.fontFamily as string | undefined) ?? DEFAULT,
        size: (style.fontSize as string | undefined) ?? DEFAULT,
        color: (style.color as string | undefined) ?? "",
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        link: current.isActive("link"),
        bullets: current.isActive("bulletList"),
        numbers: current.isActive("orderedList"),
        align: (["center", "right"] as const).find((value) => current.isActive({ textAlign: value })) ?? "left",
      }
    },
  })

  const chain = () => editor.chain().focus()

  function setBlock(value: string) {
    if (value === "paragraph") chain().setParagraph().run()
    else chain().setHeading({ level: Number(value) as 1 | 2 | 3 }).run()
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarSelect label="Text style" items={TEXT_STYLES} value={state.block} onChange={setBlock} className="w-28" />
        <ToolbarSelect
          label="Font"
          items={FONT_ITEMS}
          value={state.font}
          className="w-24"
          onChange={(value) => (value === DEFAULT ? chain().unsetFontFamily().run() : chain().setFontFamily(value).run())}
        />
        <ToolbarSelect
          label="Text size"
          items={SIZE_ITEMS}
          value={state.size}
          className="w-20"
          onChange={(value) => (value === DEFAULT ? chain().unsetFontSize().run() : chain().setFontSize(value).run())}
        />
        <FirstNamePopover editor={editor} />
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <MarkToggle label="Bold" pressed={state.bold} onPressed={() => chain().toggleBold().run()}>
          <BoldIcon />
        </MarkToggle>
        <MarkToggle label="Italic" pressed={state.italic} onPressed={() => chain().toggleItalic().run()}>
          <ItalicIcon />
        </MarkToggle>
        <MarkToggle label="Underline" pressed={state.underline} onPressed={() => chain().toggleUnderline().run()}>
          <UnderlineIcon />
        </MarkToggle>
        <MarkToggle label="Strikethrough" pressed={state.strike} onPressed={() => chain().toggleStrike().run()}>
          <StrikethroughIcon />
        </MarkToggle>
        <ColorPopover editor={editor} current={state.color} />
        <LinkPopover editor={editor} active={state.link} />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <MarkToggle label="Align left" pressed={state.align === "left"} onPressed={() => chain().setTextAlign("left").run()}>
          <AlignLeftIcon />
        </MarkToggle>
        <MarkToggle label="Align center" pressed={state.align === "center"} onPressed={() => chain().setTextAlign("center").run()}>
          <AlignCenterIcon />
        </MarkToggle>
        <MarkToggle label="Align right" pressed={state.align === "right"} onPressed={() => chain().setTextAlign("right").run()}>
          <AlignRightIcon />
        </MarkToggle>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <MarkToggle label="Bulleted list" pressed={state.bullets} onPressed={() => chain().toggleBulletList().run()}>
          <ListIcon />
        </MarkToggle>
        <MarkToggle label="Numbered list" pressed={state.numbers} onPressed={() => chain().toggleOrderedList().run()}>
          <ListOrderedIcon />
        </MarkToggle>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear formatting"
                onClick={() => chain().unsetAllMarks().setParagraph().run()}
              />
            }
          >
            <RemoveFormattingIcon />
          </TooltipTrigger>
          <TooltipContent>Clear formatting</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

// Written straight onto the email: the same fonts and spacing as the email's own text,
// so the words don't move when the preview catches up.
const INLINE_CLASS =
  "outline-none [font-family:var(--email-body)] text-[17px] leading-[27px] [&_a]:font-bold [&_a]:underline [&_h1]:mb-4 [&_h1]:[font-family:var(--email-heading)] [&_h1]:text-[36px] [&_h1]:leading-[42px] [&_h2]:mb-4 [&_h2]:[font-family:var(--email-heading)] [&_h2]:text-[24px] [&_h2]:leading-[30px] [&_h3]:mb-2.5 [&_h3]:[font-family:var(--email-kicker)] [&_h3]:text-[13px] [&_h3]:leading-5 [&_h3]:font-bold [&_h3]:tracking-[0.18em] [&_h3]:text-(--email-label) [&_h3]:uppercase [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_p]:min-h-[27px] [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6"

export function RichTextEditor({
  doc,
  onChange,
  disabled,
  inline = false,
  toolbarTarget,
  autoFocus = false,
}: {
  doc: RichNode
  onChange: (doc: RichNode) => void
  disabled?: boolean
  inline?: boolean
  toolbarTarget?: HTMLElement | null
  autoFocus?: boolean
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      MergeTagHighlight,
    ],
    content: doc,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        "aria-label": "Text",
        class: inline
          ? INLINE_CLASS
          : "min-h-24 p-3 text-sm outline-none [&_a]:underline [&_h1]:text-2xl [&_h1]:font-serif [&_h2]:text-lg [&_h2]:font-serif [&_h3]:font-mono [&_h3]:text-xs [&_h3]:font-bold [&_h3]:tracking-widest [&_h3]:text-chart-4 [&_h3]:uppercase [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    // A plain copy, because the editor's own objects can't be sent to a server action.
    onUpdate: ({ editor: current }) => onChange(JSON.parse(JSON.stringify(current.getJSON())) as RichNode),
  })

  if (inline) {
    return (
      <>
        {editor && !disabled && toolbarTarget && createPortal(<Toolbar editor={editor} className="flex flex-col gap-1" />, toolbarTarget)}
        <EditorContent editor={editor} />
      </>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      {editor && !disabled && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
