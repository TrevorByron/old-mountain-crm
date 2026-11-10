"use client"

import { MailIcon, PhoneIcon, XIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { InlineCheckbox, InlineSelect, InlineText } from "@/components/inline-edit"
import { ManageMenu } from "@/components/manage-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parseTags } from "@/lib/people/profile"
import { OWNERS } from "@/lib/pipeline/stages"

import { markUnsubscribed, removePerson, resetProfile, updateProfile, updateSubscriber } from "../actions"

const NOBODY = "__none__"
const NO_STATUS = "__none__"

type HeaderPerson = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  unsubscribed_at: string | null
  suppressed: boolean
  airtable_record_id: string | null
}

// The centered heading of a person's page, like Flodesk's: their name, then how to reach them.
// Everything here edits in place.
export function PersonHeader({ person }: { person: HeaderPerson }) {
  const save = (fields: Record<string, unknown>) => updateSubscriber({ id: person.id, ...fields })

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="flex flex-wrap justify-center font-heading text-[1.875rem] leading-tight font-normal tracking-tight">
        <InlineText label="First name" value={person.first_name} placeholder="First name" className="field-sizing-content w-auto min-w-16 text-center text-[length:inherit]" onSave={(first_name) => save({ first_name })} />
        <InlineText label="Last name" value={person.last_name} placeholder="Last name" className="field-sizing-content w-auto min-w-16 text-center text-[length:inherit]" onSave={(last_name) => save({ last_name })} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 text-sm text-muted-foreground">
        <InlineText label="Email" type="email" value={person.email} placeholder="Add email" className="field-sizing-content w-auto min-w-24 text-center" onSave={(email) => save({ email })} />
        <InlineText label="Phone" type="tel" value={person.phone} placeholder="Add phone" className="field-sizing-content w-auto min-w-24 text-center" onSave={(phone) => save({ phone })} />
      </div>
    </div>
  )
}

// Email and Call, for reaching them in one tap.
export function ContactButtons({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email && !phone) return null
  return (
    <div className="flex justify-center gap-2">
      {email && (
        <Button variant="outline" size="sm" render={<a href={`mailto:${email}`} />} nativeButton={false}>
          <MailIcon data-icon="inline-start" />
          Email
        </Button>
      )}
      {phone && (
        <Button variant="outline" size="sm" render={<a href={`tel:${phone}`} />} nativeButton={false}>
          <PhoneIcon data-icon="inline-start" />
          Call
        </Button>
      )}
    </div>
  )
}

export function PersonMenu({ person }: { person: HeaderPerson }) {
  const { id } = person
  const optedOut = Boolean(person.unsubscribed_at) || person.suppressed
  return (
    <ManageMenu
      label="Manage this person"
      actions={[
        {
          label: "Unsubscribe from email",
          title: `Unsubscribe ${person.email}?`,
          description: "They stop receiving email right away. This can't be undone from the app.",
          success: "Unsubscribed",
          hidden: !person.email || optedOut,
          run: () => markUnsubscribed(id),
        },
        {
          label: "Reset profile",
          title: "Clear what you've written about them?",
          description: "Clears their about notes, tags, referral and reminder. Contact details, trips and the log stay.",
          success: "Profile reset",
          run: () => resetProfile(id),
        },
        {
          label: "Remove person",
          title: "Remove this person for good?",
          description: person.airtable_record_id
            ? "This deletes their record and log. They're also in Airtable, so the next sync brings them back unless you delete them there too."
            : "This deletes their record and log for good.",
          destructive: true,
          success: "Removed",
          redirectTo: "/subscribers",
          run: () => removePerson(id),
        },
      ]}
    />
  )
}

const REMINDER_PRESETS = [
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
]

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

// A label on the left and its value on the right, with a line between rows, like Flodesk's
// "Segments & data". Phones stack the label over the value.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-14 items-center gap-x-4 border-b py-2 text-sm last:border-0 max-sm:gap-1 sm:grid-cols-[9rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ProfileCards({
  person,
  statuses,
}: {
  person: {
    id: string
    email: string | null
    about: string | null
    tags: string[]
    referred_by: string | null
    follow_up_on: string | null
    follow_up_note: string | null
    account_owner: string | null
    status: string | null
    source: string | null
    country: string | null
    marketing_ok: boolean
    unsubscribed_at: string | null
    suppressed: boolean
  }
  statuses: string[]
}) {
  const { id, tags } = person
  const [tagDraft, setTagDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const profile = (fields: Record<string, unknown>) => updateProfile({ id, ...fields })
  const details = (fields: Record<string, unknown>) => updateSubscriber({ id, ...fields })
  const optedOut = Boolean(person.unsubscribed_at) || person.suppressed

  function change(fields: Record<string, unknown>) {
    startTransition(async () => {
      const result = await profile(fields)
      if (!result.ok) toast.error(result.error)
    })
  }

  function addTags() {
    const added = parseTags(tagDraft)
    if (added.length === 0) return
    change({ tags: [...new Set([...tags, ...added])] })
    setTagDraft("")
  }

  // Three cards: what to know about them, when to get back to them, and their details.
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>About them</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InlineText
            label="About them"
            multiline
            rows={3}
            debounce={800}
            value={person.about}
            placeholder="What to remember before calling them. Keep passport and medical details out."
            onSave={(about) => profile({ about })}
          />

          <div className="flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-4"
                  aria-label={`Remove tag ${tag}`}
                  disabled={isPending}
                  onClick={() => change({ tags: tags.filter((item) => item !== tag) })}
                >
                  <XIcon />
                </Button>
              </Badge>
            ))}
            <Input
              aria-label="Add tags"
              placeholder="Add a tag"
              value={tagDraft}
              className="h-7 w-28 border-transparent bg-transparent px-1 text-sm shadow-none hover:border-input dark:bg-transparent"
              onChange={(event) => setTagDraft(event.target.value)}
              onBlur={addTags}
              onKeyDown={(event) => {
                if (event.key === "Enter") addTags()
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="Remind me">
            <div className="flex flex-wrap items-center gap-1">
              <InlineText
                label="Reminder date"
                type="date"
                className="w-auto"
                value={person.follow_up_on}
                onSave={(follow_up_on) => profile({ follow_up_on: follow_up_on || null })}
              />
              {REMINDER_PRESETS.map((preset) => (
                <Button key={preset.label} variant="ghost" size="xs" disabled={isPending} onClick={() => change({ follow_up_on: daysFromNow(preset.days) })}>
                  {preset.label}
                </Button>
              ))}
              {person.follow_up_on && (
                <Button variant="ghost" size="xs" disabled={isPending} onClick={() => change({ follow_up_on: null, follow_up_note: null })}>
                  Done
                </Button>
              )}
            </div>
          </Row>
          <Row label="About what">
            <InlineText label="Reminder note" value={person.follow_up_note} placeholder="Ask about the 2028 departure" onSave={(follow_up_note) => profile({ follow_up_note })} />
          </Row>
          <Row label="Owner">
            <InlineSelect
              label="Owner"
              value={person.account_owner ?? NOBODY}
              items={[{ value: NOBODY, label: "Nobody yet" }, ...[...new Set([...OWNERS, ...(person.account_owner ? [person.account_owner] : [])])].map((name) => ({ value: name, label: name }))]}
              onSave={(owner) => details({ account_owner: owner === NOBODY ? "" : owner })}
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="Status">
            <InlineSelect
              label="Status"
              value={person.status ?? NO_STATUS}
              items={[{ value: NO_STATUS, label: "No status" }, ...statuses.map((status) => ({ value: status, label: status }))]}
              onSave={(status) => details({ status: status === NO_STATUS ? null : status })}
            />
          </Row>
          <Row label="Referred by">
            <InlineText label="Referred by" value={person.referred_by} placeholder="Who sent them your way" onSave={(referred_by) => profile({ referred_by })} />
          </Row>
          <Row label="Heard about you">
            <InlineText label="Heard about you" value={person.source} placeholder="Add source" onSave={(source) => details({ source })} />
          </Row>
          <Row label="Country">
            <InlineText label="Country" value={person.country} placeholder="Add country" onSave={(country) => details({ country })} />
          </Row>
          <Row label="Marketing email">
            <div className="flex items-center gap-2">
              <InlineCheckbox
                id="person-marketing"
                checked={person.marketing_ok && !optedOut}
                disabled={!person.email || optedOut}
                onSave={(marketing_ok) => profile({ marketing_ok })}
              />
              <Label htmlFor="person-marketing" className="font-normal">
                {optedOut ? "Opted out" : "Send it to them"}
              </Label>
            </div>
          </Row>
        </CardContent>
      </Card>
    </>
  )
}
