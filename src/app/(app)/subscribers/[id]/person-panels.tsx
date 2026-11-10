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

export function PersonHeader({ person }: { person: HeaderPerson }) {
  const { id } = person
  const optedOut = Boolean(person.unsubscribed_at) || person.suppressed
  const save = (fields: Record<string, unknown>) => updateSubscriber({ id, ...fields })

  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap font-heading text-xl font-semibold">
          <InlineText label="First name" value={person.first_name} placeholder="First name" className="field-sizing-content w-auto min-w-16" onSave={(first_name) => save({ first_name })} />
          <InlineText label="Last name" value={person.last_name} placeholder="Last name" className="field-sizing-content w-auto min-w-16" onSave={(last_name) => save({ last_name })} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="flex items-center">
            {person.email && (
              <Button variant="ghost" size="icon-xs" aria-label={`Email ${person.email}`} render={<a href={`mailto:${person.email}`} />} nativeButton={false}>
                <MailIcon />
              </Button>
            )}
            <InlineText label="Email" type="email" value={person.email} placeholder="Add email" className="field-sizing-content w-auto min-w-24" onSave={(email) => save({ email })} />
          </span>
          <span className="flex items-center">
            {person.phone && (
              <Button variant="ghost" size="icon-xs" aria-label={`Call ${person.phone}`} render={<a href={`tel:${person.phone}`} />} nativeButton={false}>
                <PhoneIcon />
              </Button>
            )}
            <InlineText label="Phone" type="tel" value={person.phone} placeholder="Add phone" className="field-sizing-content w-auto min-w-24" onSave={(phone) => save({ phone })} />
          </span>
        </div>
      </div>
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
    </div>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Phones stack the label over the field so the field gets the full width.
    <div className="grid items-center gap-x-2 text-sm max-sm:gap-0.5 sm:grid-cols-[6.5rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ProfileCard({
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
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
        <div className="flex items-center gap-2 text-sm">
          <InlineCheckbox
            id="person-marketing"
            checked={person.marketing_ok && !optedOut}
            disabled={!person.email || optedOut}
            onSave={(marketing_ok) => profile({ marketing_ok })}
          />
          <Label htmlFor="person-marketing">{optedOut ? "Opted out of marketing email" : "Send marketing email"}</Label>
        </div>
      </CardContent>
    </Card>
  )
}
