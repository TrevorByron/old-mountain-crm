"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { MultiSelect } from "@/components/multi-select"
import { PageHeader } from "@/components/page-header"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"
import { EMAIL_PHOTOS } from "@/lib/broadcasts/photos"
import {
  broadcastContentSchema,
  isAudienceEmpty,
  missingContent,
  type AudienceFilter,
  type LayoutKey,
} from "@/lib/broadcasts/content"

import {
  cancelBroadcast,
  countAudience,
  deleteBroadcast,
  previewBroadcast,
  queueBroadcast,
  resumeBroadcast,
  saveBroadcast,
  sendTest,
  uploadPhoto,
} from "../actions"

type Broadcast = {
  id: string
  name: string
  template_id: string | null
  subject: string | null
  preheader: string | null
  kicker: string | null
  heading: string | null
  body_markdown: string | null
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  image_alt: string | null
  audience_filter: AudienceFilter
  state: string
  scheduled_at: string | null
  sent_at: string | null
  last_error: string | null
}

type Template = { id: string; name: string; layout_key: string }

const NO_PHOTO = "__none__"
const YOUR_PHOTO = "__yours__"
const LIBRARY_ITEMS = [
  { label: "No photo", value: NO_PHOTO },
  ...EMAIL_PHOTOS.map((photo) => ({ label: photo.label, value: photo.path as string })),
]
const MAX_PHOTO_EDGE = 2400

// Phone photos are often over the upload limit, so they're shrunk before leaving the browser.
async function shrinkPhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read photo"))), "image/jpeg", 0.9)
  })
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

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
          Sent broadcasts can&apos;t be edited.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

export function BroadcastEditor({
  broadcast,
  templates,
  statuses,
  airtableSegments,
  segments,
  sentCount,
  totalCount,
  testBlockers,
  sendBlockers,
}: {
  broadcast: Broadcast
  templates: Template[]
  statuses: string[]
  airtableSegments: string[]
  segments: { id: string; name: string }[]
  sentCount: number
  totalCount: number
  testBlockers: string[]
  sendBlockers: string[]
}) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [name, setName] = useState(broadcast.name)
  const [templateId, setTemplateId] = useState(broadcast.template_id ?? templates[0]?.id)
  const [fields, setFields] = useState({
    subject: broadcast.subject ?? "",
    preheader: broadcast.preheader ?? "",
    kicker: broadcast.kicker ?? "",
    heading: broadcast.heading ?? "",
    body_markdown: broadcast.body_markdown ?? "",
    cta_label: broadcast.cta_label ?? "",
    cta_url: broadcast.cta_url ?? "",
    image_url: broadcast.image_url ?? "",
    image_alt: broadcast.image_alt ?? "",
  })
  const [isUploading, setIsUploading] = useState(false)
  const [audience, setAudience] = useState(broadcast.audience_filter)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [previewDocument, setPreviewDocument] = useState("")
  const [device, setDevice] = useState("desktop")
  const [sendMode, setSendMode] = useState("now")
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>()
  const [scheduleTime, setScheduleTime] = useState("09:00")
  const [isPending, startTransition] = useTransition()

  const readOnly = broadcast.state !== "draft"
  const hasOwnPhoto = Boolean(fields.image_url) && !EMAIL_PHOTOS.some((photo) => photo.path === fields.image_url)
  const photoItems = hasOwnPhoto ? [...LIBRARY_ITEMS, { label: "Your photo", value: YOUR_PHOTO }] : LIBRARY_ITEMS
  const layout = (templates.find((template) => template.id === templateId)?.layout_key ?? "letter") as LayoutKey
  const fieldsKey = JSON.stringify(fields)
  const audienceKey = JSON.stringify(audience)

  const parsed = broadcastContentSchema.safeParse(fields)
  const problems = parsed.success
    ? missingContent(parsed.data, layout)
    : parsed.error.issues.map((issue) => issue.message)
  if (isAudienceEmpty(audience)) problems.push("Choose who this goes to.")
  else if (audienceCount === 0) problems.push("Nobody who can receive email is in this audience.")

  const scheduledAt =
    sendMode === "schedule" && scheduleDate
      ? new Date(`${format(scheduleDate, "yyyy-MM-dd")}T${scheduleTime || "09:00"}`)
      : null
  if (sendMode === "schedule" && !scheduledAt) problems.push("Choose a date to send.")

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const html = await previewBroadcast({ layout, content: JSON.parse(fieldsKey) })
      if (current && html) setPreviewDocument(html)
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [layout, fieldsKey])

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

  function setField(key: keyof typeof fields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }))
  }

  function choosePhoto(value: string | null) {
    if (value === YOUR_PHOTO) return
    setFields((previous) => ({ ...previous, image_url: !value || value === NO_PHOTO ? "" : value, image_alt: "" }))
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.set("photo", await shrinkPhoto(file), "photo.jpg")
      const result = await uploadPhoto(formData)
      if (!result.ok) toast.error(result.error)
      else setFields((previous) => ({ ...previous, image_url: result.url, image_alt: "" }))
    } catch {
      toast.error("Couldn't read that file. Try a JPG or PNG.")
    } finally {
      input.value = ""
      setIsUploading(false)
    }
  }

  const persist = () => saveBroadcast({ id: broadcast.id, name, template_id: templateId, ...fields, audience_filter: audience })

  function save() {
    startTransition(async () => {
      const result = await persist()
      if (!result.ok) toast.error(result.error)
      else toast.success("Draft saved")
    })
  }

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
      toast.success(scheduledAt ? "Broadcast scheduled" : "Broadcast is sending")
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

  const form = (
    <div className="flex flex-col gap-4 pb-6 md:pr-4">
      <StateNotice
        broadcast={broadcast}
        sentCount={sentCount}
        totalCount={totalCount}
        onCancel={cancel}
        onResume={resume}
        disabled={isPending}
      />
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="broadcast-name">Internal name</FieldLabel>
              <Input id="broadcast-name" value={name} disabled={readOnly} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-layout">Layout</FieldLabel>
              <Select
                items={templates.map((template) => ({ label: template.name, value: template.id }))}
                value={templateId}
                disabled={readOnly}
                onValueChange={(value) => value && setTemplateId(value)}
              >
                <SelectTrigger id="broadcast-layout" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-subject">Subject</FieldLabel>
              <Input
                id="broadcast-subject"
                value={fields.subject}
                placeholder="October 2027: 12 seats, 11 days, 4 regions"
                disabled={readOnly}
                onChange={(event) => setField("subject", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-preheader">Preview text</FieldLabel>
              <Input
                id="broadcast-preheader"
                value={fields.preheader}
                disabled={readOnly}
                onChange={(event) => setField("preheader", event.target.value)}
              />
              <FieldDescription>Shows after the subject in most inboxes.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-kicker">Label</FieldLabel>
              <Input
                id="broadcast-kicker"
                value={fields.kicker}
                placeholder="November newsletter"
                disabled={readOnly}
                onChange={(event) => setField("kicker", event.target.value)}
              />
              <FieldDescription>The small gold line above the headline.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-heading">Heading</FieldLabel>
              <Input
                id="broadcast-heading"
                value={fields.heading}
                disabled={readOnly}
                onChange={(event) => setField("heading", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-photo">Photo</FieldLabel>
              <Select
                items={photoItems}
                value={hasOwnPhoto ? YOUR_PHOTO : fields.image_url || NO_PHOTO}
                disabled={readOnly}
                onValueChange={choosePhoto}
              >
                <SelectTrigger id="broadcast-photo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {photoItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {!readOnly && (
              <Field>
                <FieldLabel htmlFor="broadcast-photo-upload">Or upload your own</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="broadcast-photo-upload"
                    type="file"
                    accept="image/*"
                    disabled={isUploading}
                    onChange={upload}
                  />
                  {isUploading && <Spinner />}
                </div>
                <FieldDescription>
                  JPG or PNG. Tall photos are cropped around the middle, and location data is removed.
                </FieldDescription>
              </Field>
            )}
            {hasOwnPhoto && (
              <Field>
                <FieldLabel htmlFor="broadcast-image-alt">Photo description</FieldLabel>
                <Input
                  id="broadcast-image-alt"
                  value={fields.image_alt}
                  placeholder="Elephants crossing a dry riverbed"
                  disabled={readOnly}
                  onChange={(event) => setField("image_alt", event.target.value)}
                />
                <FieldDescription>Shown if images are off, and read aloud by screen readers.</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="broadcast-body">Body</FieldLabel>
              <Textarea
                id="broadcast-body"
                rows={10}
                value={fields.body_markdown}
                disabled={readOnly}
                onChange={(event) => setField("body_markdown", event.target.value)}
              />
              <FieldDescription>Markdown works: **bold**, [links](https://www.old-mountain.com), - lists.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-cta-label">Button label</FieldLabel>
              <Input
                id="broadcast-cta-label"
                value={fields.cta_label}
                disabled={readOnly}
                onChange={(event) => setField("cta_label", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="broadcast-cta-url">Button link</FieldLabel>
              <Input
                id="broadcast-cta-url"
                type="url"
                value={fields.cta_url}
                placeholder="https://www.old-mountain.com/..."
                disabled={readOnly}
                onChange={(event) => setField("cta_url", event.target.value)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
          <CardDescription>
            {audienceCount === null
              ? "Counting..."
              : `${audienceCount} ${audienceCount === 1 ? "person" : "people"} will receive this.`}{" "}
            Anyone matching at least one choice is included, and unsubscribed or suppressed people never are.
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
          </FieldGroup>
        </CardContent>
      </Card>

      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle>Send</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sendBlockers.length > 0 && (
              <Alert>
                <AlertTitle>Before this can go to subscribers</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {sendBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
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
            {problems.length > 0 && <p className="text-sm text-muted-foreground">{problems[0]}</p>}
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button disabled={problems.length > 0 || sendBlockers.length > 0 || isPending || !audienceCount} />}
                >
                  {sendMode === "schedule" ? "Review and schedule" : "Review and send"}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {scheduledAt ? "Schedule" : "Send"} to {audienceCount} {audienceCount === 1 ? "person" : "people"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      &ldquo;{fields.subject}&rdquo; goes {scheduledAt ? `out ${dateTimeFormat.format(scheduledAt)}` : "out right away"}.
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
          </CardContent>
        </Card>
      )}
    </div>
  )

  const preview = (
    <div className="flex h-full flex-col gap-2 md:pl-4">
      <ToggleGroup
        variant="outline"
        aria-label="Preview width"
        value={[device]}
        onValueChange={(value: string[]) => value[0] && setDevice(value[0])}
      >
        <ToggleGroupItem value="desktop">Desktop</ToggleGroupItem>
        <ToggleGroupItem value="mobile">Mobile</ToggleGroupItem>
      </ToggleGroup>
      <iframe
        title="Email preview"
        sandbox="allow-same-origin"
        srcDoc={previewDocument}
        className="mx-auto h-[640px] w-full min-h-0 flex-1 rounded-lg border bg-white md:h-auto"
        style={{ maxWidth: device === "mobile" ? 375 : undefined }}
      />
    </div>
  )

  return (
    <>
      <PageHeader title={broadcast.name} description="Write on the left, and the preview follows on the right.">
        {!readOnly && (
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" disabled={isPending} />}>Delete</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                  <AlertDialogDescription>Nothing has been sent. This removes the draft for good.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={destroy}>
                    Delete draft
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={save} disabled={isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Save draft
            </Button>
          </div>
        )}
      </PageHeader>
      {isMobile ? (
        <div className="flex flex-col gap-4">
          {form}
          {preview}
        </div>
      ) : (
        <div className="h-[calc(100svh-10rem)] min-h-[32rem]">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="50%" minSize="30%" className="overflow-y-auto">
              {form}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%" minSize="30%">
              {preview}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </>
  )
}
