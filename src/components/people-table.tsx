"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpDownIcon, ChevronDownIcon, CircleDotIcon, ListFilterIcon } from "lucide-react"
import { toast } from "sonner"

import { addToSegment, removeFromSegment } from "@/app/(app)/segments/actions"
import { removePeople, removePerson, unsubscribePeople } from "@/app/(app)/subscribers/actions"
import { BULK_BUTTON, BulkBar } from "@/components/bulk-bar"
import { ListLayout, ToolbarMenu, ToolbarSearch } from "@/components/list-toolbar"
import { ManageMenu } from "@/components/manage-menu"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Person, SegmentTag } from "@/lib/people/load"
import { LIFECYCLES } from "@/lib/pipeline/stages"
import { segmentColorHex } from "@/lib/segments/colors"
import { EMAIL_STATUS_LABELS, emailStatus, type EmailStatus } from "@/lib/segments/people"

export function fullName(person: Pick<Person, "first_name" | "last_name">) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ")
}

const ALL = "all"
const PAGE_SIZE = 50
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "engaged", label: "Last engagement" },
]

const STATUS_ITEMS = [
  { value: ALL, label: "All statuses" },
  ...(Object.keys(EMAIL_STATUS_LABELS) as EmailStatus[]).map((key) => ({ value: key, label: EMAIL_STATUS_LABELS[key] })),
]

const STATUS_VARIANTS: Partial<Record<EmailStatus, "success" | "destructive">> = {
  active: "success",
  complained: "destructive",
}

export function SegmentTags({ segments, className }: { segments: Person["segments"]; className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-1"}>
      {segments.map((segment) => (
        <Badge key={segment.id} variant="outline" className="h-6 rounded-md border-black/5 px-2 font-normal text-neutral-900" style={{ backgroundColor: segmentColorHex(segment.color) }}>
          {segment.name}
        </Badge>
      ))}
    </div>
  )
}

// The one list of people, used wherever people are listed, laid out like Flodesk's Audience. A page
// can give it a heading, puts its tabs or title on the left of the toolbar and its own buttons on
// the right, and `membership` adds a column for a page's own detail. On phones `fab` replaces the
// buttons with a floating + button.
export function PeopleTable({
  people,
  heading,
  description,
  title,
  actions,
  fab,
  lifecycles = LIFECYCLES.map((item) => item.key),
  membership,
  empty,
  segments = [],
}: {
  people: Person[]
  heading?: string
  description?: string
  title?: React.ReactNode
  actions?: React.ReactNode
  fab?: React.ReactNode
  // Which relationships the filter offers, so the Customers tab only shows the ones it can contain.
  lifecycles?: string[]
  membership?: { header: string; cell: (person: Person) => React.ReactNode }
  empty?: React.ReactNode
  // Every segment, for adding a selection to one.
  segments?: SegmentTag[]
}) {
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState("newest")
  const [status, setStatus] = useState(ALL)
  const [lifecycle, setLifecycle] = useState(ALL)
  const [interest, setInterest] = useState(ALL)
  const [page, setPage] = useState(0)

  const interestItems = useMemo(
    () => [{ value: ALL, label: "Any interest" }, ...[...new Set(people.flatMap((person) => person.interests))].sort().map((value) => ({ value, label: value }))],
    [people]
  )
  const lifecycleItems = [{ value: ALL, label: "Any relationship" }, ...LIFECYCLES.filter((item) => lifecycles.includes(item.key)).map((item) => ({ value: item.key, label: item.label }))]
  const filterCount = (lifecycle !== ALL ? 1 : 0) + (interest !== ALL ? 1 : 0)

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = people.filter((person) => {
      if (status !== ALL && emailStatus(person) !== status) return false
      if (lifecycle !== ALL && person.lifecycle !== lifecycle) return false
      if (interest !== ALL && !person.interests.includes(interest)) return false
      return !query || `${fullName(person)} ${person.email ?? ""} ${person.phone ?? ""} ${person.tags.join(" ")} ${person.about ?? ""}`.toLowerCase().includes(query)
    })
    if (sort === "name") return matches.sort((a, b) => (fullName(a) || a.email || "").localeCompare(fullName(b) || b.email || ""))
    if (sort === "engaged") return matches.sort((a, b) => (b.last_touch ?? "").localeCompare(a.last_touch ?? ""))
    return matches
  }, [people, search, sort, status, lifecycle, interest])

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const filtered = Boolean(search.trim()) || status !== ALL || filterCount > 0

  // Anyone removed since they were picked drops out of the selection on their own.
  const selected = people.filter((person) => selectedIds.has(person.id))
  const allVisibleSelected = visible.length > 0 && visible.every((person) => selectedIds.has(person.id))
  const someVisibleSelected = visible.some((person) => selectedIds.has(person.id))

  function toggle(ids: string[], on: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function clear() {
    setSearch("")
    setStatus(ALL)
    setLifecycle(ALL)
    setInterest(ALL)
  }

  const resetPage = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(0)
  }

  const controls = (
    <>
      <ToolbarSearch label="Search people" value={search} onChange={resetPage(setSearch)} />
      <ToolbarMenu label="Sort" icon={ArrowUpDownIcon} items={SORTS} value={sort} onChange={setSort} />
      <div className="max-md:hidden">
        <ToolbarMenu label="Status" icon={CircleDotIcon} items={STATUS_ITEMS} value={status} onChange={resetPage(setStatus)} showChoice />
      </div>
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" aria-label="Filter" className="max-md:size-9 max-md:px-0" />}>
          <ListFilterIcon className="md:hidden" />
          <span className="max-md:hidden">Filter</span>
          {filterCount > 0 && <span className="max-md:hidden">({filterCount})</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <FieldGroup>
            {/* Phones have no room for the Status menu, so it lives here. */}
            <Field className="md:hidden">
              <FieldLabel htmlFor="people-status">Status</FieldLabel>
              <SimpleSelect id="people-status" items={STATUS_ITEMS} value={status} onChange={resetPage(setStatus)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="people-relationship">Relationship</FieldLabel>
              <SimpleSelect id="people-relationship" items={lifecycleItems} value={lifecycle} onChange={resetPage(setLifecycle)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="people-interest">Interest</FieldLabel>
              <SimpleSelect id="people-interest" items={interestItems} value={interest} onChange={resetPage(setInterest)} />
            </Field>
          </FieldGroup>
        </PopoverContent>
      </Popover>
    </>
  )

  return (
    <ListLayout heading={heading} description={description} tabs={title} controls={controls} actions={actions} fab={selected.length > 0 ? null : fab}>
      <PeopleBulkBar selected={selected} segments={segments} onClear={() => setSelectedIds(new Set())} />
      {people.length === 0 ? (
        (empty ?? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No one here yet</EmptyTitle>
              <EmptyDescription>Add someone, or import your contacts from Airtable.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ))
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pr-3">
                  <Checkbox
                    aria-label="Select everyone on this page"
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onCheckedChange={(checked) => toggle(visible.map((person) => person.id), Boolean(checked) && !allVisibleSelected)}
                  />
                </TableHead>
                <TableHead>Subscriber</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last engagement</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Segments</TableHead>
                {membership && <TableHead className="w-24 text-right">{membership.header}</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={membership ? 7 : 6} className="h-24 text-center text-muted-foreground">
                    No one matches that.{" "}
                    <Button variant="link" className="h-auto p-0" onClick={clear}>
                      Clear filters
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((person) => {
                  const name = fullName(person)
                  const personStatus = emailStatus(person)
                  return (
                    <TableRow key={person.id} className="relative" data-state={selectedIds.has(person.id) ? "selected" : undefined}>
                      <TableCell className="relative z-10 w-10 pr-3">
                        <Checkbox
                          aria-label={`Select ${name || person.email || "this person"}`}
                          checked={selectedIds.has(person.id)}
                          onCheckedChange={(checked) => toggle([person.id], Boolean(checked))}
                        />
                      </TableCell>
                      <TableCell className="h-[4.5rem]">
                        <Link href={`/subscribers/${person.id}`} className="font-medium after:absolute after:inset-0">
                          {person.email ?? (name || "No name")}
                        </Link>
                        {person.email && name && <p className="text-xs text-muted-foreground">{name}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[personStatus] ?? "secondary"}>{EMAIL_STATUS_LABELS[personStatus]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.last_touch ? shortDate.format(new Date(person.last_touch)) : "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <SegmentTags segments={person.segments} className="flex flex-wrap justify-end gap-1" />
                      </TableCell>
                      {membership && <TableCell className="relative z-10 text-right">{membership.cell(person)}</TableCell>}
                      <TableCell className="text-right">
                        <ManageMenu
                          label={`Manage ${name || person.email || "this person"}`}
                          actions={[
                            {
                              label: "Remove person",
                              title: "Remove this person for good?",
                              description: person.airtable_record_id
                                ? "This deletes their record and log. They're also in Airtable, so the next sync brings them back unless you delete them there too."
                                : "This deletes their record and log for good.",
                              destructive: true,
                              success: "Removed",
                              run: () => removePerson(person.id),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {filtered ? `${shown.length} of ${people.length}` : people.length} {people.length === 1 ? "person" : "people"}
              {filtered && (
                <Button variant="link" size="sm" className="h-auto px-2" onClick={clear}>
                  Clear
                </Button>
              )}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </ListLayout>
  )
}

// What can be done to everyone selected at once, in Flodesk's dark floating bar.
function PeopleBulkBar({ selected, segments, onClear }: { selected: Person[]; segments: SegmentTag[]; onClear: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ids = selected.map((person) => person.id)
  const people = selected.length === 1 ? "1 person" : `${selected.length} people`
  // Only segments someone here is in can lose them.
  const theirSegments = segments.filter((segment) => selected.some((person) => person.segments.some((tag) => tag.id === segment.id)))

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.")
        return
      }
      toast.success(success)
      onClear()
      router.refresh()
    })
  }

  return (
    <BulkBar count={selected.length} label="Selected people" onClear={onClear}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" disabled={isPending || segments.length === 0} className={BULK_BUTTON} />}>Add to segment</DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-56">
          {segments.map((segment) => (
            <DropdownMenuItem key={segment.id} onClick={() => run(() => addToSegment({ segmentId: segment.id, subscriberIds: ids }), `Added ${people} to ${segment.name}`)}>
              <span className="size-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: segmentColorHex(segment.color) }} />
              {segment.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" disabled={isPending || theirSegments.length === 0} className={BULK_BUTTON} />}>Remove from segment</DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-64">
          {theirSegments.map((segment) => (
            <DropdownMenuItem
              key={segment.id}
              onClick={() => run(() => removeFromSegment({ segmentId: segment.id, subscriberIds: ids }), `Removed from ${segment.name}. Anyone who matches its rules stays in it.`)}
            >
              <span className="size-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: segmentColorHex(segment.color) }} />
              {segment.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageMenu
        label="More for the selected people"
        className={BULK_BUTTON}
        actions={[
          {
            label: "Unsubscribe from email",
            title: `Unsubscribe ${people}?`,
            description: "They stop receiving email right away. This can't be undone from the app.",
            success: `Unsubscribed ${people}`,
            onDone: onClear,
            run: () => unsubscribePeople(ids),
          },
          {
            label: "Remove people",
            title: `Remove ${people} for good?`,
            description: "This deletes their records and logs. Anyone who's opted out or is on a trip is kept, and anyone also in Airtable comes back with the next sync unless you delete them there too.",
            destructive: true,
            success: `Removed ${people}`,
            onDone: onClear,
            run: () => removePeople(ids),
          },
        ]}
      >
        More
        <ChevronDownIcon data-icon="inline-end" />
      </ManageMenu>
    </BulkBar>
  )
}
