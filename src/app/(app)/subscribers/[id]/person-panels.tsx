"use client"

import { XIcon } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { parseTags } from "@/lib/people/profile"

import { updateProfile } from "../actions"

function useSave(id: string) {
  const [isPending, startTransition] = useTransition()
  function save(fields: Record<string, unknown>, success?: string) {
    startTransition(async () => {
      const result = await updateProfile({ id, ...fields })
      if (!result.ok) toast.error(result.error)
      else if (success) toast.success(success)
    })
  }
  return { save, isPending }
}

export function AboutCard({
  id,
  about,
  tags,
  referredBy,
}: {
  id: string
  about: string | null
  tags: string[]
  referredBy: string | null
}) {
  const { save } = useSave(id)
  const [aboutDraft, setAboutDraft] = useState(about ?? "")
  const [referredDraft, setReferredDraft] = useState(referredBy ?? "")
  const [tagDraft, setTagDraft] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle")
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  // Saves as you type, so notes survive a closed tab or a quick click elsewhere.
  useEffect(() => {
    const aboutChanged = aboutDraft.trim() !== (about ?? "")
    const referredChanged = referredDraft.trim() !== (referredBy ?? "")
    if (!aboutChanged && !referredChanged) return
    const timer = setTimeout(() => {
      saveRef.current({
        ...(aboutChanged ? { about: aboutDraft } : {}),
        ...(referredChanged ? { referred_by: referredDraft } : {}),
      })
      setSaveState("saved")
    }, 800)
    return () => clearTimeout(timer)
  }, [aboutDraft, referredDraft, about, referredBy])

  function addTags() {
    const added = parseTags(tagDraft)
    if (added.length === 0) return
    save({ tags: [...new Set([...tags, ...added])] })
    setTagDraft("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>About them</CardTitle>
        <CardDescription>
          What you&apos;d want to remember before calling them. {saveState === "saved" ? "Saved." : "Saves as you type."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="person-about" className="sr-only">
              About them
            </FieldLabel>
            <Textarea
              id="person-about"
              rows={5}
              placeholder="Family, work, how you know them, what they loved, what to avoid"
              value={aboutDraft}
              onChange={(event) => setAboutDraft(event.target.value)}
            />
            <FieldDescription>Keep passport and medical details out of here.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="person-tags">Tags</FieldLabel>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-4"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => save({ tags: tags.filter((item) => item !== tag) })}
                    >
                      <XIcon />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="person-tags"
                placeholder="family, birder, repeat guest"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    addTags()
                  }
                }}
              />
              <Button variant="secondary" disabled={!tagDraft.trim()} onClick={addTags}>
                Add
              </Button>
            </div>
            <FieldDescription>Use these in segments, like everyone tagged family.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="person-referred">Referred by</FieldLabel>
            <Input
              id="person-referred"
              placeholder="Who sent them your way"
              value={referredDraft}
              onChange={(event) => setReferredDraft(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

const REMINDER_PRESETS = [
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
]

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

export function FollowUpCard({ id, on, note }: { id: string; on: string | null; note: string | null }) {
  const { save, isPending } = useSave(id)
  const [date, setDate] = useState(on ?? "")
  const [draft, setDraft] = useState(note ?? "")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get back in touch</CardTitle>
        <CardDescription>A reminder that shows up on Today when it&apos;s due.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {REMINDER_PRESETS.map((preset) => (
            <Button key={preset.label} variant="outline" size="xs" onClick={() => setDate(daysFromNow(preset.days))}>
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3">
          <Field>
            <FieldLabel htmlFor="follow-up-date">When</FieldLabel>
            <Input id="follow-up-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="follow-up-note">About what</FieldLabel>
            <Input
              id="follow-up-note"
              placeholder="Ask about the 2028 departure"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!date || isPending}
            onClick={() => save({ follow_up_on: date, follow_up_note: draft }, "Reminder set")}
          >
            Set reminder
          </Button>
          {on && (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setDate("")
                setDraft("")
                save({ follow_up_on: null, follow_up_note: null }, "Marked done")
              }}
            >
              Done
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function MarketingToggle({ id, enabled, hasEmail }: { id: string; enabled: boolean; hasEmail: boolean }) {
  const { save, isPending } = useSave(id)
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="person-marketing"
        checked={enabled}
        disabled={isPending || !hasEmail}
        onCheckedChange={(checked) => save({ marketing_ok: Boolean(checked) })}
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="person-marketing">Send marketing email</Label>
        <p className="text-xs text-muted-foreground">Off for people you added yourself, until they&apos;ve said yes.</p>
      </div>
    </div>
  )
}
