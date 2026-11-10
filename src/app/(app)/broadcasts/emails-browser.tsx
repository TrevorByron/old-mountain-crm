"use client"

import { ArrowUpDownIcon, ChartColumnIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ListLayout, ToolbarMenu, ToolbarPills, ToolbarSearch, ViewSwitch } from "@/components/list-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

// Flodesk's status pills: gray while it's being worked on, green once it's out.
const STATE_VARIANTS: Record<string, "secondary" | "success" | "destructive"> = {
  draft: "secondary",
  scheduled: "secondary",
  sending: "secondary",
  sent: "success",
  failed: "destructive",
  cancelled: "secondary",
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
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
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
    // Flodesk's email card: the preview with its menu floating on top, then the name and a status pill.
    <Card className="relative gap-0 pt-0 transition-shadow hover:shadow-lg">
      <EmailThumbnail html={item.html} title={`Preview of ${item.name}`} />
      <CampaignRowMenu
        id={item.id}
        name={item.name}
        isDraft={item.state === "draft"}
        className="absolute! top-3 right-3 size-9 rounded-full bg-card shadow-sm hover:bg-card"
      />
      <CardContent className="pt-5">
        <CardTitle className="truncate text-sm">
          <Link href={`/broadcasts/${item.id}`} className="after:absolute after:inset-0">
            {item.name}
          </Link>
        </CardTitle>
      </CardContent>
      <CardFooter className="flex items-center gap-2 border-t-0 pt-3">
        <Badge variant={STATE_VARIANTS[item.state] ?? "secondary"} className="min-w-0 truncate">
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
                    <Badge variant={STATE_VARIANTS[item.state] ?? "secondary"}>{statusLabel(item)}</Badge>
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

// Flodesk's Emails page: the heading, status pills on the left, then search, sort and the grid or
// list switch on the right.
export function EmailsBrowser({
  items,
  heading,
  description,
  actions,
  fab,
}: {
  items: EmailItem[]
  heading: string
  description?: string
  actions?: React.ReactNode
  fab?: React.ReactNode
}) {
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
    <ListLayout
      heading={heading}
      description={description}
      tabs={<ToolbarPills label="Show" items={STATUS_FILTERS} value={status} onChange={setStatus} />}
      controls={
        <>
          <ToolbarSearch label="Search emails" placeholder="Name or subject" value={query} onChange={setQuery} />
          <ToolbarMenu label="Sort" icon={ArrowUpDownIcon} items={SORTS} value={sort} onChange={setSort} />
          <ViewSwitch view={view} onChange={setView} />
        </>
      }
      actions={actions}
      fab={fab}
    >
      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No emails match</EmptyTitle>
            <EmptyDescription>Try another search or status.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "grid" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:gap-9 2xl:grid-cols-3">
          {shown.map((item) => (
            <EmailCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmailTable items={shown} />
      )}
    </ListLayout>
  )
}
