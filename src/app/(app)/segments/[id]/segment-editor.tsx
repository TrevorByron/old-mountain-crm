"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { MultiSelect, type MultiSelectOption } from "@/components/multi-select"
import { PageHeader } from "@/components/page-header"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RULE_FIELDS, parseKeywords, type RuleOptions, type SegmentRules } from "@/lib/segments/rules"

import { addToSegment, countRuleMatches, deleteSegment, removeFromSegment, saveSegment } from "../actions"

export type SegmentPerson = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  status: string | null
  interests: string[]
  departure_window: string | null
  unsubscribed_at: string | null
  suppressed: boolean
}

export function SegmentEditor({
  id,
  name: savedName,
  description: savedDescription,
  rules: savedRules,
  options,
  people,
  addedByHand,
  everyone,
}: {
  id: string
  name: string
  description: string | null
  rules: SegmentRules
  options: RuleOptions
  people: SegmentPerson[]
  addedByHand: string[]
  everyone: MultiSelectOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(savedName)
  const [description, setDescription] = useState(savedDescription ?? "")
  const [rules, setRules] = useState(savedRules)
  const [keywords, setKeywords] = useState(savedRules.keywords.join(", "))
  const [toAdd, setToAdd] = useState<string[]>([])
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const added = new Set(addedByHand)
  const inSegment = new Set(people.map((person) => person.id))
  const currentRules = { ...rules, keywords: parseKeywords(keywords) }
  const rulesKey = JSON.stringify(currentRules)

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const count = await countRuleMatches(JSON.parse(rulesKey))
      if (current) setMatchCount(count)
    }, 300)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [rulesKey])

  function save() {
    startTransition(async () => {
      const result = await saveSegment({ id, name, description, rules: currentRules })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Segment saved")
      router.refresh()
    })
  }

  function addPeople() {
    startTransition(async () => {
      const result = await addToSegment({ segmentId: id, subscriberIds: toAdd })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setToAdd([])
      router.refresh()
    })
  }

  function remove(subscriberId: string) {
    startTransition(async () => {
      const result = await removeFromSegment({ segmentId: id, subscriberIds: [subscriberId] })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })
  }

  function destroy() {
    startTransition(async () => {
      const result = await deleteSegment(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push("/segments")
    })
  }

  return (
    <>
      <PageHeader title={savedName} description="Anyone who matches the rules or was added by hand is in this segment.">
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" disabled={isPending} />}>Delete</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {savedName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Nobody is unsubscribed or removed from Airtable. Scheduled campaigns using this segment will skip it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={destroy}>
                  Delete segment
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={save} disabled={isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </div>
      </PageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <CardDescription>
              {matchCount === null
                ? "Choose what people need to match."
                : `${matchCount} ${matchCount === 1 ? "person matches" : "people match"} these rules.`}{" "}
              Within a field any choice counts. Across fields, all must match.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="segment-name">Name</FieldLabel>
                <Input id="segment-name" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="segment-description">Description</FieldLabel>
                <Input
                  id="segment-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {RULE_FIELDS.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`rule-${field.key}`}>{field.label}</FieldLabel>
                  <MultiSelect
                    id={`rule-${field.key}`}
                    options={options[field.key].map((value) => ({ label: value, value }))}
                    value={rules[field.key]}
                    onChange={(value) => setRules({ ...rules, [field.key]: value })}
                    placeholder="Any"
                    emptyMessage="No contacts have an answer here yet."
                  />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="rule-keywords">Words they wrote</FieldLabel>
                <Input
                  id="rule-keywords"
                  value={keywords}
                  placeholder="family, kids"
                  onChange={(event) => setKeywords(event.target.value)}
                />
                <FieldDescription>
                  Separate with commas. Searches their written-in interests, objections and how they heard about you.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add people by hand</CardTitle>
              <CardDescription>
                For people the rules can&apos;t catch. You can also select people on the Subscribers page.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <MultiSelect
                options={everyone.filter((person) => !inSegment.has(person.value))}
                value={toAdd}
                onChange={setToAdd}
                placeholder="Search by name"
              />
              <div>
                <Button variant="secondary" onClick={addPeople} disabled={toAdd.length === 0 || isPending}>
                  Add to segment
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {people.length} {people.length === 1 ? "person" : "people"}
              </CardTitle>
              <CardDescription>As of the last save. Save to see changes to the rules here.</CardDescription>
            </CardHeader>
            <CardContent>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody yet. Add a rule or add someone by hand.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>How</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className="whitespace-normal">
                          <div>{[person.first_name, person.last_name].filter(Boolean).join(" ") || person.email}</div>
                          {(person.unsubscribed_at || person.suppressed) && (
                            <Badge variant="outline">Won&apos;t receive email</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {added.has(person.id) ? "By hand" : "Rules"}
                        </TableCell>
                        <TableCell className="text-right">
                          {added.has(person.id) && (
                            <Button variant="ghost" size="sm" onClick={() => remove(person.id)} disabled={isPending}>
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
