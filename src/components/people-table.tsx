"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ListFilterIcon, SearchIcon } from "lucide-react"

import { removePerson } from "@/app/(app)/subscribers/actions"
import { ManageMenu } from "@/components/manage-menu"
import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Person } from "@/lib/people/load"
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

const STATUS_VARIANTS: Partial<Record<EmailStatus, "secondary" | "destructive">> = {
  active: "secondary",
  bounced: "destructive",
  complained: "destructive",
}

export function SegmentTags({ segments, className }: { segments: Person["segments"]; className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-1"}>
      {segments.map((segment) => (
        <Badge key={segment.id} variant="outline" className="border-black/10 text-neutral-900" style={{ backgroundColor: segmentColorHex(segment.color) }}>
          {segment.name}
        </Badge>
      ))}
    </div>
  )
}

// The one list of people, used wherever people are listed. A page puts its title on the left and
// its own buttons on the right, and `membership` adds a column for a page's own detail.
export function PeopleTable({
  people,
  title,
  actions,
  lifecycles = LIFECYCLES.map((item) => item.key),
  membership,
  empty,
}: {
  people: Person[]
  title?: React.ReactNode
  actions?: React.ReactNode
  // Which relationships the filter offers, so the Customers tab only shows the ones it can contain.
  lifecycles?: string[]
  membership?: { header: string; cell: (person: Person) => React.ReactNode }
  empty?: React.ReactNode
}) {
  const [search, setSearch] = useState("")
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

  return (
    <div className="flex flex-col gap-4">
      {/* On phones the title and the page's buttons come first, then search, then the filters in one row. */}
      <div className="flex flex-wrap items-center gap-2">
        {title && <div className="mr-auto min-w-0">{title}</div>}
        <InputGroup className="w-full max-sm:order-1 sm:w-44">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search people" placeholder="Search" value={search} onChange={(event) => resetPage(setSearch)(event.target.value)} />
        </InputGroup>
        <SimpleSelect label="Sort" items={SORTS} value={sort} onChange={setSort} className="max-sm:order-1 sm:w-36" />
        <SimpleSelect label="Status" items={STATUS_ITEMS} value={status} onChange={resetPage(setStatus)} className="min-w-0 flex-1 max-sm:order-1 sm:w-36 sm:flex-none" />
        <Popover>
          <PopoverTrigger render={<Button variant="outline" aria-label="Filter" className="max-sm:order-1" />}>
            <ListFilterIcon data-icon="inline-start" />
            <span className="max-sm:hidden">Filter</span>
            {filterCount > 0 && ` (${filterCount})`}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <FieldGroup>
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
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

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
                <TableHead>Subscriber</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Last engagement</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Segments</TableHead>
                {membership && <TableHead className="w-24 text-right">{membership.header}</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={membership ? 6 : 5} className="h-24 text-center text-muted-foreground">
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
                    <TableRow key={person.id} className="relative">
                      {/* On phones this column takes the spare width and long emails trim to one line. */}
                      <TableCell className="py-3 whitespace-normal max-sm:w-full max-sm:max-w-0">
                        <Link
                          href={`/subscribers/${person.id}`}
                          className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline max-sm:block max-sm:truncate"
                        >
                          {person.email ?? (name || "No name")}
                        </Link>
                        {person.email && name && <p className="text-sm text-muted-foreground max-sm:truncate">{name}</p>}
                        {/* Phones have no room for the Status column, so the badge sits under the name. */}
                        <div className="mt-1 sm:hidden">
                          <Badge variant={STATUS_VARIANTS[personStatus] ?? "outline"}>{EMAIL_STATUS_LABELS[personStatus]}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={STATUS_VARIANTS[personStatus] ?? "outline"}>{EMAIL_STATUS_LABELS[personStatus]}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
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
    </div>
  )
}
