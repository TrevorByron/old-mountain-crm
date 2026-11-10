"use client"

import { ArrowUpDownIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ListLayout, ToolbarMenu, ToolbarSearch, ViewSwitch } from "@/components/list-toolbar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { segmentColorHex } from "@/lib/segments/colors"

import { SegmentColorButton } from "./segment-color-picker"
import { SegmentRowDescription, SegmentRowMenu } from "./segment-row"

export type SegmentItem = {
  id: string
  name: string
  description: string | null
  rules: unknown
  color: string
  people: number
  rulesText: string
  updatedAt: string
}

const SORTS = [
  { value: "name", label: "Name" },
  { value: "people", label: "Most people" },
  { value: "edited", label: "Recently edited" },
]

const peopleLabel = (count: number) => `${count} ${count === 1 ? "person" : "people"}`

function sortItems(items: SegmentItem[], sort: string) {
  const sorted = [...items]
  if (sort === "people") return sorted.sort((a, b) => b.people - a.people || a.name.localeCompare(b.name))
  if (sort === "edited") return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sorted.sort((a, b) => a.name.localeCompare(b.name))
}

function SegmentCard({ item }: { item: SegmentItem }) {
  return (
    <Card className="relative gap-0 pt-0 transition-shadow hover:shadow-md">
      <div className="flex h-32 items-center justify-center px-6 text-center sm:h-52" style={{ backgroundColor: segmentColorHex(item.color) }}>
        <Link href={`/segments/${item.id}`} className="font-heading text-base font-medium text-neutral-900 after:absolute after:inset-0">
          {item.name}
        </Link>
      </div>
      <CardContent className="pt-3">
        <p className="truncate text-sm text-muted-foreground">{item.rulesText || "People added by hand"}</p>
      </CardContent>
      <CardFooter className="flex items-center gap-2 border-t-0 bg-transparent pt-3">
        <Badge variant="outline">{peopleLabel(item.people)}</Badge>
        <div className="ml-auto flex items-center">
          <SegmentColorButton id={item.id} color={item.color} appearance="icon" className="relative z-10" />
          <SegmentRowMenu id={item.id} name={item.name} />
        </div>
      </CardFooter>
    </Card>
  )
}

function SegmentTable({ items }: { items: SegmentItem[] }) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Who&apos;s in it</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="relative">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: segmentColorHex(item.color) }} />
                    <Link href={`/segments/${item.id}`} className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline">
                      {item.name}
                    </Link>
                  </div>
                  <SegmentRowDescription id={item.id} name={item.name} description={item.description} rules={item.rules} />
                </TableCell>
                <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{item.rulesText || "Added by hand"}</TableCell>
                <TableCell className="text-right tabular-nums">{item.people}</TableCell>
                <TableCell className="w-20 text-right">
                  <div className="flex items-center justify-end">
                    <SegmentColorButton id={item.id} color={item.color} appearance="icon" className="relative z-10" />
                    <SegmentRowMenu id={item.id} name={item.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// Laid out like Flodesk's Segments: the Audience heading and tabs, then search, sort and the grid
// or list switch.
export function SegmentsBrowser({
  items,
  heading,
  description,
  tabs,
  actions,
  fab,
}: {
  items: SegmentItem[]
  heading: string
  description?: string
  tabs?: React.ReactNode
  actions?: React.ReactNode
  fab?: React.ReactNode
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("name")
  const [view, setView] = useState("grid")

  const needle = query.trim().toLowerCase()
  const shown = sortItems(
    items.filter((item) => !needle || item.name.toLowerCase().includes(needle) || (item.description ?? "").toLowerCase().includes(needle)),
    sort
  )

  return (
    <ListLayout
      heading={heading}
      description={description}
      tabs={tabs}
      controls={
        <>
          <ToolbarSearch label="Search segments" value={query} onChange={setQuery} />
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
            <EmptyTitle>No segments match</EmptyTitle>
            <EmptyDescription>Try another search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "grid" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:gap-9 2xl:grid-cols-3">
          {shown.map((item) => (
            <SegmentCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <SegmentTable items={shown} />
      )}
    </ListLayout>
  )
}
