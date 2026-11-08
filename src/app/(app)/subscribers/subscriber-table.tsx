"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table"
import { ArrowUpDownIcon, SearchIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { LIFECYCLES, lifecycleLabel } from "@/lib/pipeline/stages"

import { addToSegment } from "../segments/actions"
import { bulkChangeStatus } from "./actions"

export type Subscriber = {
  id: string
  email: string | null
  lifecycle: string
  last_touch: string | null
  tags: string[]
  about: string | null
  marketing_ok: boolean
  first_name: string | null
  last_name: string | null
  status: string | null
  source: string | null
  country: string | null
  segments: string[]
  subscribed_at: string
  unsubscribed_at: string | null
  suppressed: boolean
  suppressed_reason: string | null
  phone: string | null
  account_owner: string | null
  trip_type: string | null
  departure_window: string | null
  group_size: string | null
  interests: string[]
  interests_other: string | null
  objections: string[]
  objections_other: string | null
}

export function fullName(subscriber: Pick<Subscriber, "first_name" | "last_name">) {
  return [subscriber.first_name, subscriber.last_name].filter(Boolean).join(" ")
}

const ALL_STATUSES = "__all__"
const NO_STATUS = "__none__"
const ALL_INTERESTS = "__all__"
const ALL_STAGES = "__all__"
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { text: sortFn_text, datetime: sortFn_datetime },
})

const helper = createColumnHelper<typeof features, Subscriber>()

function SortableHeader({ label, onToggle }: { label: string; onToggle?: (event: unknown) => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5" onClick={onToggle}>
      {label}
      <ArrowUpDownIcon data-icon="inline-end" />
    </Button>
  )
}

function SubscriptionBadge({ subscriber }: { subscriber: Subscriber }) {
  if (!subscriber.email) return <Badge variant="outline">No email</Badge>
  if (!subscriber.marketing_ok && !subscriber.unsubscribed_at && !subscriber.suppressed) {
    return <Badge variant="outline">Not on the list</Badge>
  }
  if (subscriber.suppressed) return <Badge variant="destructive">Suppressed</Badge>
  if (subscriber.unsubscribed_at) return <Badge variant="outline">Unsubscribed</Badge>
  return <Badge variant="secondary">Subscribed</Badge>
}

const columns = helper.columns([
  helper.display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select person"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
        onClick={(event) => event.stopPropagation()}
      />
    ),
  }),
  helper.accessor((row) => fullName(row) || row.email || "", {
    id: "name",
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Name" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ row, getValue }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{getValue() || "No name"}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.email ?? row.original.phone ?? "No contact details"}</div>
      </div>
    ),
  }),
  helper.accessor((row) => lifecycleLabel(row.lifecycle), {
    id: "lifecycle",
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Relationship" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
  }),
  helper.display({
    id: "interests",
    header: "Tags and interests",
    cell: ({ row }) => (
      <div className="flex max-w-72 flex-wrap gap-1">
        {row.original.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
        {row.original.interests.map((interest) => (
          <Badge key={interest} variant="outline">
            {interest}
          </Badge>
        ))}
      </div>
    ),
  }),
  helper.accessor((row) => (row.last_touch ? new Date(row.last_touch) : new Date(0)), {
    id: "last_touch",
    sortFn: "datetime",
    header: ({ column }) => <SortableHeader label="Last contact" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ row }) => (row.original.last_touch ? dateFormat.format(new Date(row.original.last_touch)) : <span className="text-muted-foreground">Never</span>),
  }),
  helper.display({
    id: "subscription",
    header: "Email",
    cell: ({ row }) => <SubscriptionBadge subscriber={row.original} />,
  }),
])

// On a phone the table drops to name and relationship.
const HIDDEN_ON_SMALL: Record<string, string> = {
  select: "hidden sm:table-cell",
  interests: "hidden xl:table-cell",
  last_touch: "hidden lg:table-cell",
  subscription: "hidden md:table-cell",
}

export function SubscriberTable({
  subscribers,
  statuses,
  segments,
}: {
  subscribers: Subscriber[]
  statuses: string[]
  segments: { id: string; name: string }[]
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [interestFilter, setInterestFilter] = useState(ALL_INTERESTS)
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [bulkSegment, setBulkSegment] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState(ALL_STAGES)
  const router = useRouter()
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isPending, startTransition] = useTransition()

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_STAGES]: subscribers.length }
    for (const subscriber of subscribers) counts[subscriber.lifecycle] = (counts[subscriber.lifecycle] ?? 0) + 1
    return counts
  }, [subscribers])

  const data = useMemo(() => {
    const query = search.trim().toLowerCase()
    return subscribers.filter((subscriber) => {
      if (statusFilter === NO_STATUS && subscriber.status) return false
      if (statusFilter !== NO_STATUS && statusFilter !== ALL_STATUSES && subscriber.status !== statusFilter) {
        return false
      }
      if (interestFilter !== ALL_INTERESTS && !subscriber.interests.includes(interestFilter)) return false
      if (stageFilter !== ALL_STAGES && subscriber.lifecycle !== stageFilter) return false
      return !query || `${fullName(subscriber)} ${subscriber.email ?? ""} ${subscriber.phone ?? ""} ${subscriber.tags.join(" ")} ${subscriber.about ?? ""}`.toLowerCase().includes(query)
    })
  }, [subscribers, search, statusFilter, interestFilter, stageFilter])

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
    autoResetPageIndex: true,
  })

  const selectedIds = Object.keys(rowSelection)
  const filtersActive = Boolean(search.trim()) || statusFilter !== ALL_STATUSES || interestFilter !== ALL_INTERESTS || stageFilter !== ALL_STAGES

  function clearFilters() {
    setSearch("")
    setStatusFilter(ALL_STATUSES)
    setInterestFilter(ALL_INTERESTS)
    setStageFilter(ALL_STAGES)
  }

  const statusItems = [
    { label: "All statuses", value: ALL_STATUSES },
    ...statuses.map((status) => ({ label: status, value: status })),
    { label: "No status", value: NO_STATUS },
  ]
  const interestItems = [
    { label: "All interests", value: ALL_INTERESTS },
    ...[...new Set(subscribers.flatMap((subscriber) => subscriber.interests))]
      .sort()
      .map((interest) => ({ label: interest, value: interest })),
  ]

  function applyBulkStatus() {
    if (!bulkStatus) return
    startTransition(async () => {
      const result = await bulkChangeStatus({ ids: selectedIds, status: bulkStatus })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const count = selectedIds.length
      toast.success(`Moved ${count} ${count === 1 ? "person" : "people"} to ${bulkStatus}`, {
        description: result.warning,
      })
      setRowSelection({})
      setBulkStatus(null)
    })
  }

  function applyBulkSegment() {
    const segment = segments.find((item) => item.id === bulkSegment)
    if (!segment) return
    startTransition(async () => {
      const result = await addToSegment({ segmentId: segment.id, subscriberIds: selectedIds })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const count = selectedIds.length
      toast.success(`Added ${count} ${count === 1 ? "person" : "people"} to ${segment.name}`)
      setRowSelection({})
      setBulkSegment(null)
    })
  }

  if (subscribers.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No one here yet</EmptyTitle>
          <EmptyDescription>Preview your Airtable contacts and commit the first import to get started.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/sync" />} nativeButton={false}>
            Go to Airtable sync
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        aria-label="Filter by relationship"
        className="flex-wrap"
        value={[stageFilter]}
        onValueChange={(value: string[]) => setStageFilter(value[0] ?? ALL_STAGES)}
      >
        <ToggleGroupItem value={ALL_STAGES}>Everyone ({stageCounts[ALL_STAGES] ?? 0})</ToggleGroupItem>
        {LIFECYCLES.map((item) => (
          <ToggleGroupItem key={item.key} value={item.key}>
            {item.label}s ({stageCounts[item.key] ?? 0})
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:max-w-sm">
          <InputGroupInput
            aria-label="Search people"
            placeholder="Search name, email, phone, tag or notes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <Select
          items={statusItems}
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value ?? ALL_STATUSES)}
        >
          <SelectTrigger aria-label="Filter by status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={interestItems}
          value={interestFilter}
          onValueChange={(value) => setInterestFilter(value ?? ALL_INTERESTS)}
        >
          <SelectTrigger aria-label="Filter by interest" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {interestItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-muted-foreground tabular-nums">
            {data.length} of {subscribers.length}
          </span>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent p-2">
          <span className="px-1 text-sm font-medium">{selectedIds.length} selected</span>
            <Select
              items={statuses.map((status) => ({ label: status, value: status }))}
              value={bulkStatus}
              onValueChange={setBulkStatus}
            >
              <SelectTrigger aria-label="New status" className="w-40">
                <SelectValue placeholder="Change status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button onClick={applyBulkStatus} disabled={!bulkStatus || isPending}>
              {isPending && <Spinner data-icon="inline-start" />}
              Apply
            </Button>
            {segments.length > 0 && (
              <>
                <Select
                  items={segments.map((segment) => ({ label: segment.name, value: segment.id }))}
                  value={bulkSegment}
                  onValueChange={setBulkSegment}
                >
                  <SelectTrigger aria-label="Add to segment" className="w-48">
                    <SelectValue placeholder="Add to segment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={applyBulkSegment} disabled={!bulkSegment || isPending}>
                  Add
                </Button>
              </>
            )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRowSelection({})}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={HIDDEN_ON_SMALL[header.column.id]}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No one matches that search and filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => router.push(`/subscribers/${row.original.id}`)}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={HIDDEN_ON_SMALL[cell.column.id]}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {data.length} {data.length === 1 ? "subscriber" : "subscribers"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
