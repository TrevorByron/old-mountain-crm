import Link from "next/link"
import { ListFilterIcon } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"
import { describeRules, segmentRulesSchema } from "@/lib/segments/rules"

import { NewSegmentDialog } from "./new-segment-dialog"

export const metadata = { title: "Segments" }

export default async function SegmentsPage() {
  const { supabase } = await requireTeamMember()

  const { data: segments, error } = await supabase
    .from("segments")
    .select("id, name, description, rules")
    .order("name")
  if (error) throw new Error(error.message)

  const rows = await Promise.all(
    segments.map(async (segment) => {
      const { count, error: countError } = await supabase
        .rpc("segment_subscribers", { target: segment.id }, { count: "exact" })
        .select("id")
        .limit(1)
      if (countError) throw new Error(countError.message)
      return { ...segment, people: count ?? 0, rulesText: describeRules(segmentRulesSchema.parse(segment.rules)) }
    })
  )

  return (
    <>
      <PageHeader title="Segments" description="Saved groups of people you can send campaigns to. They update as Airtable changes.">
        <NewSegmentDialog />
      </PageHeader>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListFilterIcon />
            </EmptyMedia>
            <EmptyTitle>No segments yet</EmptyTitle>
            <EmptyDescription>
              Create one for a group you&apos;ll email more than once, like everyone interested in a 2027 safari.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewSegmentDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Who&apos;s in it</TableHead>
                  <TableHead className="text-right">People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((segment) => (
                  <TableRow key={segment.id}>
                    <TableCell>
                      <Link href={`/segments/${segment.id}`} className="font-medium underline-offset-4 hover:underline">
                        {segment.name}
                      </Link>
                      {segment.description && <p className="text-muted-foreground">{segment.description}</p>}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">
                      {segment.rulesText || "Added by hand"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{segment.people}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
