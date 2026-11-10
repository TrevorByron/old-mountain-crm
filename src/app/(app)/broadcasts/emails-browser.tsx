"use client"

import { ChartColumnIcon, LayoutGridIcon, ListIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { SimpleSelect } from "@/components/simple-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { CampaignRowMenu } from "./campaign-row"
import { EmailThumbnail } from "./email-thumbnail"

export type EmailItem = {
  id: string
  name: string
  subject: string | null
  state: string
  sentAt: string | null
  scheduledAt: string | null
  updatedAt: string
  recipients: number
  opened: string | null
  clicked: string | null
  html: string
}

const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })

const STATE_VARIANTS: Record<string, "secondary" | "outline" | "destructive" | "default"> = {
  draft: "outline",
  scheduled: "secondary",
  sending: "secondary",
  sent: "default",
  failed: "destructive",
  cancelled: "outline",
}

// One line that says where an email stands, like "Sent to 47 on Jul 23".
function statusLabel(item: EmailItem) {
  switch (item.state) {
    case "sent":
      return `Sent to ${item.recipients}${item.sentAt ? ` on ${shortDate.format(new Date(item.sentAt))}` : ""}`
    case "scheduled":
      return item.scheduledAt ? `Scheduled for ${shortDate.format(new Date(item.scheduledAt))}` : "Scheduled"
    case "sending":
      return "Sending"
    case "failed":
      return "Stopped"
    default:
      return `Draft, edited ${shortDate.format(new Date(item.updatedAt))}`
  }
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled or sending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Stopped" },
]

const SORTS = [
  { value: "edited", label: "Recently edited" },
  { value: "sent", label: "Recently sent" },
  { value: "name", label: "Name" },
]

function matchesStatus(item: EmailItem, status: string) {
  if (status === "all") return true
  if (status === "scheduled") return item.state === "scheduled" || item.state === "sending"
  return item.state === status
}

function sortItems(items: EmailItem[], sort: string) {
  const sorted = [...items]
  if (sort === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === "sent") {
    // Sent ones first, newest first. Everything not sent yet follows, most recently edited first.
    return sorted.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || b.updatedAt.localeCompare(a.updatedAt))
  }
  return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function EmailCard({ item }: { item: EmailItem }) {
  return (
    <Card className="relative gap-0 pt-0 transition-shadow hover:shadow-md">
      <EmailThumbnail html={item.html} title={`Preview of ${item.name}`} />
      <CardContent className="flex flex-col gap-1 border-t pt-4">
        <CardTitle className="truncate">
          <Link href={`/broadcasts/${item.id}`} className="after:absolute after:inset-0">
            {item.name}
          </Link>
        </CardTitle>
        {item.subject && <p className="truncate text-sm text-muted-foreground">{item.subject}</p>}
      </CardContent>
      <CardFooter className="flex items-center gap-2 border-t-0 bg-transparent pt-3">
        <Badge variant={STATE_VARIANTS[item.state] ?? "outline"} className="min-w-0 truncate">
          {statusLabel(item)}
        </Badge>
        {item.state === "sent" && item.opened && (
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {item.opened} opened · {item.clicked} clicked
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          {item.state === "sent" && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10"
              aria-label={`Results for ${item.name}`}
              render={<Link href={`/broadcasts/${item.id}`} />}
              nativeButton={false}
            >
              <ChartColumnIcon />
            </Button>
          )}
          <CampaignRowMenu id={item.id} name={item.name} isDraft={item.state === "draft"} />
        </div>
      </CardFooter>
    </Card>
  )
}

function EmailTable({ items }: { items: EmailItem[] }) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">When (Eastern)</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Opened</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Clicked</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const when = item.sentAt ?? item.scheduledAt
              return (
                <TableRow key={item.id} className="relative">
                  <TableCell className="whitespace-normal">
                    <Link href={`/broadcasts/${item.id}`} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
                      {item.name}
                    </Link>
                    {item.subject && <p className="text-muted-foreground">{item.subject}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATE_VARIANTS[item.state] ?? "outline"}>{statusLabel(item)}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{when ? longDate.format(new Date(when)) : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.recipients}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{item.opened ?? "-"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{item.clicked ?? "-"}</TableCell>
                  <TableCell className="w-10 text-right">
                    <CampaignRowMenu id={item.id} name={item.name} isDraft={item.state === "draft"} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function EmailsBrowser({ items }: { items: EmailItem[] }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("edited")
  const [status, setStatus] = useState("all")
  const [view, setView] = useState("grid")

  const needle = query.trim().toLowerCase()
  const shown = sortItems(
    items.filter(
      (item) =>
        matchesStatus(item, status) &&
        (!needle || item.name.toLowerCase().includes(needle) || (item.subject ?? "").toLowerCase().includes(needle))
    ),
    sort
  )

  return (
    <>
      {/* On phones: search and the view switch share a row, then the two dropdowns split the next. */}
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search emails" placeholder="Search by name or subject" value={query} onChange={(event) => setQuery(event.target.value)} />
        </InputGroup>
        <SimpleSelect label="Sort" items={SORTS} value={sort} onChange={setSort} className="w-[calc(50%-0.25rem)] max-sm:order-1 sm:w-44" />
        <SimpleSelect label="Status" items={STATUS_FILTERS} value={status} onChange={setStatus} className="w-[calc(50%-0.25rem)] max-sm:order-1 sm:w-48" />
        <ToggleGroup
          variant="outline"
          aria-label="View"
          className="ml-auto"
          value={[view]}
          onValueChange={(next: string[]) => next[0] && setView(next[0])}
        >
          <ToggleGroupItem value="grid" aria-label="Show as cards">
            <LayoutGridIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="Show as a list">
            <ListIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No emails match</EmptyTitle>
            <EmptyDescription>Try another search or status.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((item) => (
            <EmailCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmailTable items={shown} />
      )}
    </>
  )
}
