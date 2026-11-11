"use client"

import { format } from "date-fns"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  PlusIcon,
  Redo2Icon,
  TriangleAlertIcon,
  Undo2Icon,
  UserRoundIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react"
import { toast } from "sonner"

import { MultiSelect } from "@/components/multi-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSidebar } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { COLORS, isDarkColor, newBlock, type Block, type BlockType, type ColorKey, type EmailContent } from "@/lib/broadcasts/blocks"
import { LIFECYCLES } from "@/lib/pipeline/stages"
import { checkBroadcast, isAudienceEmpty, type AudienceFilter, type BroadcastIssue } from "@/lib/broadcasts/content"
import { brand, fontFamily } from "@/theme/tokens"

import {
  cancelBroadcast,
  countAudience,
  deleteBroadcast,
  duplicateBroadcast,
  previewBroadcast,
  queueBroadcast,
  resumeBroadcast,
  saveAsTemplate,
  saveBroadcast,
  sendTest,
  resetBroadcast,
} from "../actions"
import { ManageMenu } from "@/components/manage-menu"
import { AddBlockMenu, BlockBar } from "./block-editor"
import { EmailPreview } from "./email-preview"
import { RichTextEditor } from "./rich-text-editor"

type Broadcast = {
  id: string
  name: string
  subject: string | null
  preheader: string | null
  content: EmailContent
  audience_filter: AudienceFilter
  state: string
  scheduled_at: string | null
  sent_at: string | null
  last_error: string | null
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })
const AUTOSAVE_MS = 1200
const HISTORY_GROUP_MS = 800
const HISTORY_LIMIT = 100
const DELETED_TOAST = "block-deleted"
const COLOR_ITEMS = (Object.keys(COLORS) as ColorKey[]).map((value) => ({ value, label: COLORS[value].label }))

function StateNotice({
  broadcast,
  sentCount,
  totalCount,
  onCancel,
  onResume,
  disabled,
}: {
  broadcast: Broadcast
  sentCount: number
  totalCount: number
  onCancel: () => void
  onResume: () => void
  disabled: boolean
}) {
  if (broadcast.state === "scheduled") {
    return (
      <Alert>
        <AlertTitle>Scheduled for {dateTimeFormat.format(new Date(broadcast.scheduled_at as string))}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          Cancel it to make changes. It goes back to being a draft.
          <Button variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
            Cancel send
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (broadcast.state === "sending") {
    return (
      <Alert>
        <AlertTitle>Sending</AlertTitle>
        <AlertDescription>
          {sentCount} of {totalCount} sent so far. Refresh to update.
        </AlertDescription>
      </Alert>
    )
  }
  if (broadcast.state === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          Stopped after {sentCount} of {totalCount}
        </AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {broadcast.last_error}
          <Button variant="outline" size="sm" onClick={onResume} disabled={disabled}>
            Resume sending
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  if (broadcast.state === "sent") {
    return (
      <Alert>
        <AlertTitle>Sent to {sentCount} people</AlertTitle>
        <AlertDescription>
          {broadcast.sent_at && `Finished ${dateTimeFormat.format(new Date(broadcast.sent_at))}. `}
          Sent emails can&apos;t be edited.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

function ColorSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: ColorKey
  disabled: boolean
  onChange: (value: ColorKey) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={COLOR_ITEMS} value={value} disabled={disabled} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {COLOR_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="size-3 rounded-full border" style={{ backgroundColor: COLORS[item.value].value }} />
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function ChecklistRow({
  tone,
  message,
  onFix,
}: {
  tone: "done" | "error" | "warning"
  message: string
  onFix?: () => void
}) {
  const Icon = tone === "done" ? CheckCircle2Icon : tone === "error" ? CircleAlertIcon : TriangleAlertIcon
  const color = tone === "done" ? "text-chart-1" : tone === "error" ? "text-destructive" : "text-chart-4"
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <span className="min-w-0 flex-1">{message}</span>
      {onFix && (
        <Button variant="link" size="xs" className="h-auto p-0" onClick={onFix}>
          Fix
        </Button>
      )}
    </li>
  )
}

function SaveTemplateDialog({ content }: { content: EmailContent }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await saveAsTemplate({ name: formData.get("name"), content })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Saved. It's now an option when you start a new email.")
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Save as template</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription>Keep these blocks to start future emails from. The subject and audience aren&apos;t included.</DialogDescription>
        </DialogHeader>
        <form action={save} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="template-name">Template name</FieldLabel>
            <Input id="template-name" name="name" placeholder="Monthly newsletter" required />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BroadcastEditor({
  broadcast,
  statuses,
  airtableSegments,
  segments,
  sentCount,
  totalCount,
  testBlockers,
  sendBlockers,
}: {
  broadcast: Broadcast
  statuses: string[]
  airtableSegments: string[]
  segments: { id: string; name: string }[]
  sentCount: number
  totalCount: number
  testBlockers: string[]
  sendBlockers: string[]
}) {
  const router = useRouter()
  const [name, setName] = useState(broadcast.name)
  const [subject, setSubject] = useState(broadcast.subject ?? "")
  const [preheader, setPreheader] = useState(broadcast.preheader ?? "")
  const [content, setContentState] = useState(broadcast.content)
  const [audience, setAudience] = useState(broadcast.audience_filter)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: EmailContent[]; future: EmailContent[] }>({ past: [], future: [] })
  const [editorVersion, setEditorVersion] = useState(0)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [preview, setPreview] = useState({ html: "", bytes: 0 })
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tab, setTab] = useState("design")
  const [formattingSlot, setFormattingSlot] = useState<HTMLDivElement | null>(null)
  const [sendMode, setSendMode] = useState("now")
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>()
  const [scheduleTime, setScheduleTime] = useState("09:00")
  const [isPending, startTransition] = useTransition()
  const lastHistoryAt = useRef(0)
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const sidebarWasOpen = useRef(sidebarOpen)
  const setSidebarOpenRef = useRef(setSidebarOpen)

  const readOnly = broadcast.state !== "draft"
  const contentKey = JSON.stringify(content)
  const audienceKey = JSON.stringify(audience)
  const draftKey = JSON.stringify({ name, subject, preheader, content, audience })
  const [savedKey, setSavedKey] = useState(draftKey)

  const scheduledAt =
    sendMode === "schedule" && scheduleDate
      ? new Date(`${format(scheduleDate, "yyyy-MM-dd")}T${scheduleTime || "09:00"}`)
      : null

  const checks = checkBroadcast({ subject, preheader, content }, preview.bytes)
  const audienceProblem = isAudienceEmpty(audience)
    ? "Choose who this goes to."
    : audienceCount === 0
      ? "Nobody who can receive email is in this audience."
      : null
  const scheduleProblem = sendMode === "schedule" && !scheduledAt ? "Choose a date to send." : null
  const canSend =
    checks.errors.length === 0 && !audienceProblem && !scheduleProblem && sendBlockers.length === 0 && Boolean(audienceCount)
  const errorCount = checks.errors.length + (audienceProblem ? 1 : 0) + sendBlockers.length

  // Typing groups into one undo step. Adding, moving and deleting are always their own.
  function setContent(next: EmailContent, { checkpoint = false }: { checkpoint?: boolean } = {}) {
    const now = Date.now()
    if (checkpoint || now - lastHistoryAt.current > HISTORY_GROUP_MS) {
      setHistory(({ past }) => ({ past: [...past.slice(-HISTORY_LIMIT), content], future: [] }))
    }
    lastHistoryAt.current = now
    setContentState(next)
  }

  function undo() {
    const previous = history.past.at(-1)
    if (!previous) return
    toast.dismiss(DELETED_TOAST)
    setHistory({ past: history.past.slice(0, -1), future: [content, ...history.future] })
    setContentState(previous)
    setEditorVersion((version) => version + 1)
    lastHistoryAt.current = 0
  }

  function redo() {
    const [next, ...future] = history.future
    if (!next) return
    setHistory({ past: [...history.past, content], future })
    setContentState(next)
    setEditorVersion((version) => version + 1)
    lastHistoryAt.current = 0
  }

  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  useEffect(() => {
    undoRef.current = undo
    redoRef.current = redo
    setSidebarOpenRef.current = setSidebarOpen
  })

  // The builder needs the width, so the sidebar steps aside until you leave.
  useEffect(() => {
    const restore = sidebarWasOpen.current
    setSidebarOpenRef.current(false)
    return () => setSidebarOpenRef.current(restore)
  }, [])

  // Undo for blocks, whenever you're not typing in a field that has its own undo.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable=true]")) return
      event.preventDefault()
      if (event.shiftKey) redoRef.current()
      else undoRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function jumpTo(issue: Pick<BroadcastIssue, "target">) {
    setTab("design")
    if (issue.target === "subject" || issue.target === "preheader") {
      const id = issue.target === "subject" ? "broadcast-subject" : "broadcast-preheader"
      setTimeout(() => document.getElementById(id)?.focus(), 50)
    } else if (issue.target) {
      setSelectedId(issue.target.blockId)
    }
  }

  function addFirstNameToSubject() {
    setSubject((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}{{first_name|there}}`)
    setTimeout(() => document.getElementById("broadcast-subject")?.focus(), 0)
  }

  const persist = async () => {
    const result = await saveBroadcast({
      id: broadcast.id,
      name: name.trim() || "Untitled email",
      subject,
      preheader,
      content,
      audience_filter: audience,
    })
    if (result.ok) {
      setSavedKey(draftKey)
      setSaveState("saved")
      setSaveError(null)
    } else {
      setSaveState("error")
      setSaveError(result.error)
    }
    return result
  }
  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  })

  // Autosave, so a closed tab never costs more than a second or two of work.
  useEffect(() => {
    if (readOnly || draftKey === savedKey) return
    const timer = setTimeout(() => {
      setSaveState("saving")
      void persistRef.current()
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [draftKey, savedKey, readOnly])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const result = await previewBroadcast({ preheader, content: JSON.parse(contentKey) })
      if (current && result) setPreview(result)
    }, 250)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [contentKey, preheader])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const count = await countAudience(JSON.parse(audienceKey))
      if (current) setAudienceCount(count)
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [audienceKey])

  function test() {
    startTransition(async () => {
      const saved = await persist()
      if (!saved.ok) {
        toast.error(saved.error)
        return
      }
      const result = await sendTest(broadcast.id)
      if (!result.ok) toast.error(result.error)
      else toast.success(`Test sent to ${result.sentTo}`)
    })
  }

  function send() {
    startTransition(async () => {
      const saved = await persist()
      if (!saved.ok) {
        toast.error(saved.error)
        return
      }
      const result = await queueBroadcast({
        id: broadcast.id,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        expectedCount: audienceCount,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(scheduledAt ? "Email scheduled" : "Email is sending")
      router.refresh()
    })
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelBroadcast(broadcast.id)
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })
  }

  function resume() {
    startTransition(async () => {
      const result = await resumeBroadcast(broadcast.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast.success("Sending resumed")
        router.refresh()
      }
    })
  }

  function destroy() {
    startTransition(async () => {
      const result = await deleteBroadcast(broadcast.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push("/broadcasts")
    })
  }

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateBroadcast(broadcast.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push(`/broadcasts/${result.id}`)
    })
  }

  const selectedIndex = content.blocks.findIndex((block) => block.id === selectedId)
  const selectedBlock = selectedIndex >= 0 ? content.blocks[selectedIndex] : null

  function restructure(blocks: Block[]) {
    setContent({ ...content, blocks }, { checkpoint: true })
  }

  function addBlock(type: BlockType, index: number) {
    const block = newBlock(type)
    restructure([...content.blocks.slice(0, index), block, ...content.blocks.slice(index)])
    setSelectedId(block.id)
  }

  function changeBlock(id: string, changes: Partial<Block>) {
    setContent({ ...content, blocks: content.blocks.map((block) => (block.id === id ? ({ ...block, ...changes } as Block) : block)) })
  }

  function moveBlock(index: number, delta: number) {
    const blocks = [...content.blocks]
    const [block] = blocks.splice(index, 1)
    blocks.splice(index + delta, 0, block)
    restructure(blocks)
  }

  function duplicateBlock(index: number) {
    const copy = { ...content.blocks[index], id: crypto.randomUUID() }
    restructure([...content.blocks.slice(0, index + 1), copy, ...content.blocks.slice(index + 1)])
    setSelectedId(copy.id)
  }

  function removeBlock(id: string) {
    restructure(content.blocks.filter((block) => block.id !== id))
    setSelectedId(null)
    toast("Block deleted", { id: DELETED_TOAST, action: { label: "Undo", onClick: () => undoRef.current() } })
  }

  // Text is written on the email itself, in the email's own fonts and colors.
  const writeOnBlock =
    selectedBlock?.type === "text" && !readOnly
      ? () => (
          <div
            style={
              {
                "--email-body": fontFamily.emailStack,
                "--email-heading": fontFamily.emailHeadingStack,
                "--email-kicker": fontFamily.emailKickerStack,
                "--email-label": brand.gold,
                color: isDarkColor(selectedBlock.background ?? content.paper) ? brand.cream : brand.textDark,
              } as CSSProperties
            }
          >
            <RichTextEditor
              key={`${selectedBlock.id}-${editorVersion}`}
              inline
              autoFocus
              doc={selectedBlock.doc}
              toolbarTarget={formattingSlot}
              onChange={(doc) => changeBlock(selectedBlock.id, { doc })}
            />
          </div>
        )
      : undefined

  const designView = (
    // Clicking the space around the email puts the tools away.
    <div
      className="mx-auto flex w-full max-w-[42rem] flex-col gap-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) setSelectedId(null)
      }}
    >
      <Card size="sm">
        <CardContent className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">How it shows in the inbox</p>
          <div className="flex items-center gap-2">
            <Input
              id="broadcast-subject"
              aria-label="Subject"
              value={subject}
              placeholder="Write a subject"
              disabled={readOnly}
              onChange={(event) => setSubject(event.target.value)}
              className="-mx-2 h-10 min-w-0 flex-1 border-transparent bg-transparent px-2 text-lg font-semibold shadow-none hover:border-input"
            />
            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={addFirstNameToSubject}>
                <UserRoundIcon data-icon="inline-start" />
                First name
              </Button>
            )}
          </div>
          <Input
            id="broadcast-preheader"
            aria-label="Preview text"
            value={preheader}
            placeholder="Add preview text, the grey line after the subject"
            disabled={readOnly}
            onChange={(event) => setPreheader(event.target.value)}
            className="-mx-2 h-8 border-transparent bg-transparent px-2 text-sm text-muted-foreground shadow-none hover:border-input"
          />
          {subject.length > 60 && (
            <p className="text-xs text-muted-foreground">{subject.length} characters. Phones usually show about 60.</p>
          )}
        </CardContent>
      </Card>

      <EmailPreview
        html={preview.html}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onBlock={writeOnBlock}
        toolbar={
          selectedBlock && !readOnly ? (
            <BlockBar
              block={selectedBlock}
              position={selectedIndex}
              total={content.blocks.length}
              editorVersion={editorVersion}
              formattingRef={setFormattingSlot}
              onChange={(changes) => changeBlock(selectedBlock.id, changes)}
              onMove={(delta) => moveBlock(selectedIndex, delta)}
              onDuplicate={() => duplicateBlock(selectedIndex)}
              onRemove={() => removeBlock(selectedBlock.id)}
              onAdd={(type) => addBlock(type, selectedIndex + 1)}
              onDone={() => setSelectedId(null)}
            />
          ) : undefined
        }
      />

      {!readOnly && (
        <div className="flex justify-center">
          <AddBlockMenu onAdd={(type) => addBlock(type, content.blocks.length)} trigger={<Button variant="outline" />}>
            <PlusIcon data-icon="inline-start" />
            Add a block
          </AddBlockMenu>
        </div>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Whole email</CardTitle>
          <CardDescription>Your address and unsubscribe link are always added at the bottom.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <ColorSelect
              id="email-page"
              label="Around the email"
              value={content.page}
              disabled={readOnly}
              onChange={(page) => setContent({ ...content, page }, { checkpoint: true })}
            />
            <ColorSelect
              id="email-paper"
              label="Behind the content"
              value={content.paper}
              disabled={readOnly}
              onChange={(paper) => setContent({ ...content, paper }, { checkpoint: true })}
            />
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Undo" disabled={history.past.length === 0} onClick={undo}>
                <Undo2Icon />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Redo" disabled={history.future.length === 0} onClick={redo}>
                <Redo2Icon />
              </Button>
              <div className="ml-auto">
                <SaveTemplateDialog content={content} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!readOnly && (
        <Button onClick={() => setTab("send")}>
          Next: audience and send
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      )}
    </div>
  )

  const sendTab = (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Who gets this</CardTitle>
          <CardDescription>
            {audienceCount === null
              ? "Counting..."
              : `${audienceCount} ${audienceCount === 1 ? "person" : "people"} will receive this.`}{" "}
            Anyone matching at least one choice is included. Unsubscribed people never are.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="audience-segments">Saved segments</FieldLabel>
              <MultiSelect
                id="audience-segments"
                options={segments.map((segment) => ({ label: segment.name, value: segment.id }))}
                value={audience.segment_ids}
                disabled={readOnly}
                onChange={(segment_ids) => setAudience({ ...audience, segment_ids })}
                placeholder="Choose segments"
                emptyMessage="No segments match."
              />
              {segments.length === 0 && (
                <FieldDescription>
                  None yet. <Link href="/segments">Create a segment</Link> to reach a specific group.
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="audience-statuses">Statuses</FieldLabel>
              <MultiSelect
                id="audience-statuses"
                options={statuses.map((value) => ({ label: value, value }))}
                value={audience.statuses}
                disabled={readOnly}
                onChange={(value) => setAudience({ ...audience, statuses: value })}
                placeholder="Choose statuses"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audience-airtable">Airtable segments</FieldLabel>
              <MultiSelect
                id="audience-airtable"
                options={airtableSegments.map((value) => ({ label: value, value }))}
                value={audience.airtable_segments}
                disabled={readOnly}
                onChange={(airtable_segments) => setAudience({ ...audience, airtable_segments })}
                placeholder="Choose Airtable segments"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="audience-exclude-stage">Leave out people who are</FieldLabel>
              <MultiSelect
                id="audience-exclude-stage"
                options={LIFECYCLES.map((item) => ({ label: item.label, value: item.key }))}
                value={audience.exclude_lifecycles}
                disabled={readOnly}
                onChange={(exclude_lifecycles) => setAudience({ ...audience, exclude_lifecycles })}
                placeholder="Nobody left out"
              />
              <FieldDescription>Leave out Customers so people who&apos;ve booked don&apos;t get a sales email.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="audience-exclude-segments">Leave out saved segments</FieldLabel>
              <MultiSelect
                id="audience-exclude-segments"
                options={segments.map((segment) => ({ label: segment.name, value: segment.id }))}
                value={audience.exclude_segment_ids}
                disabled={readOnly}
                onChange={(exclude_segment_ids) => setAudience({ ...audience, exclude_segment_ids })}
                placeholder="Nobody left out"
                emptyMessage="No segments match."
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {!readOnly && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{errorCount === 0 ? "Ready to send" : `${errorCount} ${errorCount === 1 ? "thing" : "things"} to fix first`}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {checks.issues
                  .filter((issue) => issue.severity === "error")
                  .map((issue) => (
                    <ChecklistRow
                      key={issue.message}
                      tone="error"
                      message={issue.message}
                      onFix={issue.target ? () => jumpTo(issue) : undefined}
                    />
                  ))}
                {audienceProblem && <ChecklistRow tone="error" message={audienceProblem} />}
                {checks.issues
                  .filter((issue) => issue.severity === "warning")
                  .map((issue) => (
                    <ChecklistRow
                      key={issue.message}
                      tone="warning"
                      message={issue.message}
                      onFix={issue.target ? () => jumpTo(issue) : undefined}
                    />
                  ))}
                {checks.errors.length === 0 && <ChecklistRow tone="done" message="The email is complete." />}
                {!audienceProblem && <ChecklistRow tone="done" message={`Going to ${audienceCount ?? 0} people.`} />}
              </ul>
              {sendBlockers.length > 0 && (
                <>
                  <p className="mt-4 mb-2 text-sm font-medium">One-time setup</p>
                  <ul className="flex flex-col gap-2">
                    {sendBlockers.map((blocker) => (
                      <ChecklistRow key={blocker} tone="error" message={blocker} />
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Tabs value={sendMode} onValueChange={setSendMode}>
                <TabsList>
                  <TabsTrigger value="now">Send now</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                </TabsList>
                <TabsContent value="now" />
                <TabsContent value="schedule" className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    <Popover>
                      <PopoverTrigger render={<Button variant="outline" />}>
                        <CalendarIcon data-icon="inline-start" />
                        {scheduleDate ? format(scheduleDate, "MMM d, yyyy") : "Pick a date"}
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduleDate}
                          onSelect={setScheduleDate}
                          disabled={{ before: new Date() }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      aria-label="Send time, in your time zone"
                      type="time"
                      className="w-32"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger render={<Button disabled={!canSend || isPending} />}>
                    {sendMode === "schedule" ? "Review and schedule" : "Review and send"}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {scheduledAt ? "Schedule" : "Send"} to {audienceCount} {audienceCount === 1 ? "person" : "people"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        &ldquo;{subject}&rdquo; goes {scheduledAt ? `out ${dateTimeFormat.format(scheduledAt)}` : "out right away"}.
                        {!scheduledAt && " This can't be undone."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Not yet</AlertDialogCancel>
                      <AlertDialogAction onClick={send}>
                        {scheduledAt ? "Schedule" : "Send"} to {audienceCount}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="secondary" onClick={test} disabled={testBlockers.length > 0 || isPending}>
                  {isPending && <Spinner data-icon="inline-start" />}
                  Send test to me
                </Button>
              </div>
              {testBlockers.length > 0 && (
                <p className="text-sm text-muted-foreground">Test sends need setup first: {testBlockers[0]}</p>
              )}
              {scheduleProblem && <p className="text-sm text-muted-foreground">{scheduleProblem}</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )

  const saveStatus = readOnly
    ? "Not editable"
    : saveState === "saving"
      ? "Saving..."
      : saveState === "error"
        ? `Not saved: ${saveError}`
        : draftKey === savedKey
          ? "Saved"
          : "Saving soon..."

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Back to emails" render={<Link href="/broadcasts" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <Input
          aria-label="Internal name, only your team sees this"
          value={name}
          placeholder="Untitled email"
          disabled={readOnly}
          onChange={(event) => setName(event.target.value)}
          className="h-9 max-w-md min-w-0 flex-1 border-transparent bg-transparent font-heading text-lg font-semibold shadow-none hover:border-input"
        />
        <span className="ml-1 shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {saveStatus}
        </span>
        <TabsList className="order-last w-full md:order-none md:ml-auto md:w-auto">
          <TabsTrigger value="design">1. Design</TabsTrigger>
          <TabsTrigger value="send">2. Audience and send</TabsTrigger>
        </TabsList>
        <div className="ml-auto md:ml-2">
          <ManageMenu
            label="More actions"
            actions={[
              {
                label: "Duplicate",
                run: async () => {
                  duplicate()
                  return { ok: true }
                },
              },
              {
                label: "Reset to template",
                title: "Start this draft over?",
                description: "Clears your writing and photos and puts the template back.",
                hidden: readOnly,
                run: async () => {
                  const result = await resetBroadcast(broadcast.id)
                  if (result.ok) window.location.reload()
                  return result
                },
              },
              {
                label: "Remove draft",
                title: "Remove this draft?",
                description: "Nothing has been sent. This removes the draft for good.",
                destructive: true,
                hidden: readOnly,
                run: async () => {
                  destroy()
                  return { ok: true }
                },
              },
            ]}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[42rem] empty:hidden">
        <StateNotice
          broadcast={broadcast}
          sentCount={sentCount}
          totalCount={totalCount}
          onCancel={cancel}
          onResume={resume}
          disabled={isPending}
        />
      </div>
      <TabsContent value="design">{designView}</TabsContent>
      <TabsContent value="send">
        <div className="mx-auto w-full max-w-[42rem]">{sendTab}</div>
      </TabsContent>
    </Tabs>
  )
}
