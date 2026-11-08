"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { addNote, deleteNote, updateNote } from "@/app/(app)/pipeline/actions"
import { InlineText } from "@/components/inline-edit"
import { SimpleSelect } from "@/components/simple-select"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { TimelineEntry } from "@/lib/pipeline/display"

const KINDS = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
]

const whenFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

export function NoteComposer({ subscriberId = null, planId = null }: { subscriberId?: string | null; planId?: string | null }) {
  const [kind, setKind] = useState("note")
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await addNote({ subscriberId, planId, kind, body })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBody("")
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label="Add to the log"
        placeholder="What happened? What did they say?"
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {body.trim() && (
        <div className="flex items-center gap-2">
          <SimpleSelect label="Kind of entry" items={KINDS} value={kind} onChange={setKind} className="w-32" />
          <Button onClick={save} disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            Add to log
          </Button>
        </div>
      )}
    </div>
  )
}

const RECENT_ENTRIES = 12

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [isPending, startTransition] = useTransition()
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? entries : entries.slice(0, RECENT_ENTRIES)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
    <ol className="flex flex-col gap-4">
      {shown.map((entry) => (
        <li key={entry.id} className="border-l-2 pl-3 text-sm">
          <div className="font-medium">
            {entry.href ? (
              <Link href={entry.href} className="underline-offset-4 hover:underline">
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </div>
          {entry.detail &&
            (entry.deletable ? (
              <InlineText label="Edit note" multiline rows={1} required value={entry.detail} className="-ml-1" onSave={(body) => updateNote({ id: entry.id, body })} />
            ) : (
              <p className="whitespace-pre-wrap">{entry.detail}</p>
            ))}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {whenFormat.format(new Date(entry.when))}
            {entry.author ? ` · ${entry.author}` : ""}
            {entry.deletable && (
              <Button
                variant="link"
                size="xs"
                className="h-auto p-0 text-xs text-muted-foreground"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteNote(entry.id)
                    if (!result.ok) toast.error(result.error)
                  })
                }
              >
                Remove
              </Button>
            )}
          </p>
        </li>
      ))}
    </ol>
    {entries.length > shown.length && (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show {entries.length - shown.length} older
        </Button>
      </div>
    )}
    </div>
  )
}
