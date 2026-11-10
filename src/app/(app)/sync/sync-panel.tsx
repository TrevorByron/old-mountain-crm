"use client"

import { useState, useTransition } from "react"
import { RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SkipReason } from "@/lib/airtable/sync-plan"

import { commitSync, loadPreview, type SyncPreview } from "./actions"

export type SyncRun = {
  id: string
  trigger: string
  started_at: string
  finished_at: string | null
  created_count: number | null
  updated_count: number | null
  error: string | null
}

const FIELD_MAPPING = [
  { airtable: "Name", app: "First name, last name (split at the first space)" },
  { airtable: "Email", app: "Email (deduped, case-insensitive)" },
  { airtable: "Status", app: "Status, for new contacts only. After that the app owns it." },
  { airtable: "Segment", app: "Segments (read-only, email addresses dropped)" },
  { airtable: "How did you hear about Old Mountain?", app: "Source" },
  { airtable: "Record created time", app: "Signup date" },
  { airtable: "Phone", app: "Phone (read-only)" },
  { airtable: "Account Owner", app: "Account owner (read-only)" },
  { airtable: "Trip Type", app: "Trip type (read-only)" },
  { airtable: "Which departure window interests you?", app: "Departure window (read-only)" },
  { airtable: "Group Size", app: "Group size (read-only)" },
  { airtable: "What excites you about the idea of Tanzania?", app: "Interests (read-only)" },
  { airtable: "Client entered excitement", app: "Interests, in their words (read-only)" },
  { airtable: "Objections", app: "Objections (read-only)" },
  { airtable: "Objections - Other", app: "Objections, in their words (read-only)" },
]

const SKIP_LABELS: Record<SkipReason, string> = {
  no_email: "No email",
  invalid_email: "Invalid email",
  duplicate_email: "Duplicate email",
  pending_app_change: "App edit waiting to reach Airtable",
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })

function RunStatus({ run }: { run: SyncRun }) {
  if (run.error) return <Badge variant="destructive">Failed</Badge>
  if (!run.finished_at) return <Badge variant="outline">Running</Badge>
  return <Badge variant="secondary">Finished</Badge>
}

export function SyncPanel({ runs }: { runs: SyncRun[] }) {
  const [preview, setPreview] = useState<SyncPreview | null>(null)
  const [isLoading, startLoading] = useTransition()
  const [isSyncing, startSyncing] = useTransition()
  const isFirstImport = !runs.some((run) => run.finished_at && !run.error)
  const plan = preview?.plan

  function runPreview() {
    startLoading(async () => {
      const result = await loadPreview()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPreview(result.preview)
    })
  }

  function runCommit() {
    startSyncing(async () => {
      const response = await commitSync()
      if (!response.ok) {
        toast.error(response.error)
        return
      }
      if (!response.result.skippedRun) {
        toast.success(`Added ${response.result.created_count}, updated ${response.result.updated_count}`)
      }
      setPreview(null)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{isFirstImport ? "First import" : "Sync now"}</CardTitle>
          <CardDescription>
            {isFirstImport
              ? "Preview what will come across from Airtable. Nothing is saved until you commit it."
              : "Preview the changes waiting in Airtable, then apply them without waiting for the schedule."}
          </CardDescription>
        </CardHeader>
        {plan && preview && (
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Records in Airtable</TableCell>
                  <TableCell className="text-right tabular-nums">{preview.total}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>New people</TableCell>
                  <TableCell className="text-right tabular-nums">{plan.creates.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Updates</TableCell>
                  <TableCell className="text-right tabular-nums">{plan.updates.length}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Already up to date</TableCell>
                  <TableCell className="text-right tabular-nums">{plan.unchanged}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Skipped</TableCell>
                  <TableCell className="text-right tabular-nums">{plan.skipped.length}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {plan.unknownStatuses.length > 0 && (
              <Alert>
                <AlertTitle>Statuses this app doesn&apos;t know yet</AlertTitle>
                <AlertDescription>
                  {plan.unknownStatuses.join(", ")}. Contacts with these keep their current status until the value is
                  added.
                </AlertDescription>
              </Alert>
            )}
            {plan.skipped.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skipped contact</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.skipped.map((contact) => (
                    <TableRow key={contact.recordId}>
                      <TableCell>{contact.name || contact.email || contact.recordId}</TableCell>
                      <TableCell>{SKIP_LABELS[contact.reason]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
        <CardFooter className="flex flex-wrap gap-2">
          <Button variant={plan ? "outline" : "default"} onClick={runPreview} disabled={isLoading || isSyncing}>
            {isLoading ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            {plan ? "Refresh preview" : "Preview from Airtable"}
          </Button>
          {plan && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button disabled={isLoading || isSyncing} />}>
                {isSyncing && <Spinner data-icon="inline-start" />}
                {isFirstImport ? "Commit import" : "Apply changes"}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Add {plan.creates.length} and update {plan.updates.length}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Opt-outs stay as they are. {plan.skipped.length} skipped{" "}
                    {plan.skipped.length === 1 ? "contact stays" : "contacts stay"} in Airtable only.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runCommit}>
                    {isFirstImport ? "Commit import" : "Apply changes"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No syncs yet. Your first import will show up here.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Added</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-normal">{dateTimeFormat.format(new Date(run.started_at))}</TableCell>
                    <TableCell>
                      <RunStatus run={run} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{run.created_count ?? "-"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{run.updated_count ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Field mapping</CardTitle>
          <CardDescription>
            Only these fields are copied. Phone, objections and trip notes stay in Airtable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Airtable</TableHead>
                <TableHead>This app</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FIELD_MAPPING.map((row) => (
                <TableRow key={row.airtable}>
                  <TableCell className="whitespace-normal">{row.airtable}</TableCell>
                  <TableCell className="whitespace-normal">{row.app}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
