"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { bulkChangeStatus } from "./actions"
import { SubscriberSheet } from "./subscriber-sheet"

export type Subscriber = {
  id: string
  email: string
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
}

export function fullName(subscriber: Pick<Subscriber, "first_name" | "last_name">) {
  return [subscriber.first_name, subscriber.last_name].filter(Boolean).join(" ")
}

const ALL_STATUSES = "__all__"
const NO_STATUS = "__none__"
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
        aria-label="Select subscriber"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
        onClick={(event) => event.stopPropagation()}
      />
    ),
  }),
  helper.accessor((row) => fullName(row), {
    id: "name",
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Name" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">No name</span>,
  }),
  helper.accessor("email", {
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Email" onToggle={column.getToggleSortingHandler()} />,
  }),
  helper.accessor((row) => row.status ?? "", {
    id: "status",
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Status" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ row }) =>
      row.original.status ? (
        <Badge variant="secondary">{row.original.status}</Badge>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  }),
  helper.display({
    id: "subscription",
    header: "Subscription",
    cell: ({ row }) => <SubscriptionBadge subscriber={row.original} />,
  }),
  helper.accessor((row) => row.source ?? "", {
    id: "source",
    sortFn: "text",
    header: ({ column }) => <SortableHeader label="Source" onToggle={column.getToggleSortingHandler()} />,
  }),
  helper.accessor((row) => new Date(row.subscribed_at), {
    id: "subscribed_at",
    sortFn: "datetime",
    header: ({ column }) => <SortableHeader label="Signed up" onToggle={column.getToggleSortingHandler()} />,
    cell: ({ row }) => dateFormat.format(new Date(row.original.subscribed_at)),
  }),
])

// The table stays usable on a phone by dropping to name, status and subscription state.
const HIDDEN_ON_SMALL: Record<string, string> = {
  email: "hidden md:table-cell",
  source: "hidden lg:table-cell",
  subscribed_at: "hidden lg:table-cell",
}

export function SubscriberTable({ subscribers, statuses }: { subscribers: Subscriber[]; statuses: string[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isPending, startTransition] = useTransition()

  const data = useMemo(() => {
    const query = search.trim().toLowerCase()
    return subscribers.filter((subscriber) => {
      if (statusFilter === NO_STATUS && subscriber.status) return false
      if (statusFilter !== NO_STATUS && statusFilter !== ALL_STATUSES && subscriber.status !== statusFilter) {
        return false
      }
      return !query || `${fullName(subscriber)} ${subscriber.email}`.toLowerCase().includes(query)
    })
  }, [subscribers, search, statusFilter])

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
  const editing = subscribers.find((subscriber) => subscriber.id === editingId) ?? null
  const statusItems = [
    { label: "All statuses", value: ALL_STATUSES },
    ...statuses.map((status) => ({ label: status, value: status })),
    { label: "No status", value: NO_STATUS },
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
      toast.success(`Moved ${count} ${count === 1 ? "subscriber" : "subscribers"} to ${bulkStatus}`, {
        description: result.warning,
      })
      setRowSelection({})
      setBulkStatus(null)
    })
  }

  if (subscribers.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No subscribers yet</EmptyTitle>
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
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:max-w-xs">
          <InputGroupInput
            aria-label="Search by name or email"
            placeholder="Search name or email"
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
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
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
          </div>
        )}
      </div>

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
                  No subscribers match that search and filter.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => setEditingId(row.original.id)}
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

      <SubscriberSheet subscriber={editing} statuses={statuses} onClose={() => setEditingId(null)} />
    </div>
  )
}
