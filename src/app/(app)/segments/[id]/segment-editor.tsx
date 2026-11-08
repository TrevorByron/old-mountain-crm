"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { MultiSelect, type MultiSelectOption } from "@/components/multi-select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  JOURNEY_RULES,
  RULE_FIELDS,
  parseKeywords,
  type JourneyRuleKey,
  type RuleOptions,
  type SegmentRules,
} from "@/lib/segments/rules"

import { NewBroadcastDialog, type TemplateOption } from "../../broadcasts/new-broadcast-dialog"
import { addToSegment, countRuleMatches, deleteSegment, removeFromSegment, saveSegment } from "../actions"

export type SegmentPerson = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  status: string | null
  interests: string[]
  departure_window: string | null
  unsubscribed_at: string | null
  suppressed: boolean
  marketing_ok: boolean
}

const fieldsFor = (...keys: string[]) => RULE_FIELDS.filter((field) => keys.includes(field.key))

const RULE_GROUPS = [
  { key: "journey", label: "Where they are with you", journey: [...JOURNEY_RULES], fields: [] as typeof RULE_FIELDS[number][] },
  { key: "answers", label: "What they told you", journey: [], fields: fieldsFor("departure_windows", "trip_types", "group_sizes", "interests", "objections") },
  { key: "notes", label: "Your tags and notes", journey: [], fields: fieldsFor("tags") },
  { key: "airtable", label: "From Airtable", journey: [], fields: fieldsFor("statuses", "airtable_segments", "account_owners") },
]

function usedInGroup(group: (typeof RULE_GROUPS)[number], rules: SegmentRules) {
  const keys = [...group.journey.map((field) => field.key), ...group.fields.map((field) => field.key)]
  return (
    keys.filter((key) => rules[key as keyof SegmentRules].length > 0).length +
    (group.key === "notes" && rules.keywords.length > 0 ? 1 : 0)
  )
}

export function SegmentEditor({
  id,
  name: savedName,
  description: savedDescription,
  rules: savedRules,
  options,
  journeyOptions,
  templates,
  people,
  addedByHand,
  everyone,
}: {
  id: string
  name: string
  description: string | null
  rules: SegmentRules
  options: RuleOptions
  journeyOptions: Record<JourneyRuleKey, MultiSelectOption[]>
  templates: TemplateOption[]
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
  const [openGroups] = useState(() => [
    "journey",
    ...RULE_GROUPS.filter((group) => usedInGroup(group, savedRules) > 0).map((group) => group.key),
  ])

  const added = new Set(addedByHand)
  const reachable = people.filter((person) => person.email && person.marketing_ok && !person.unsubscribed_at && !person.suppressed).length
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

  // Saves as you go, so the list of people always matches the rules on screen.
  const draftKey = JSON.stringify({ name, description, rules: currentRules })
  const lastSaved = useRef(draftKey)
  useEffect(() => {
    if (draftKey === lastSaved.current || !name.trim()) return
    const timer = setTimeout(async () => {
      lastSaved.current = draftKey
      const result = await saveSegment({ id, ...JSON.parse(draftKey) })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    }, 700)
    return () => clearTimeout(timer)
  }, [draftKey, id, name, router])

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
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to segments" render={<Link href="/segments" />} nativeButton={false}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <Input
            aria-label="Segment name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 border-transparent bg-transparent px-1 font-heading text-lg font-semibold shadow-none hover:border-input"
          />
          <Input
            aria-label="Description"
            placeholder="Add a description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="h-7 border-transparent bg-transparent px-1 text-sm shadow-none hover:border-input"
          />
        </div>
        <div className="flex flex-wrap gap-2">
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
          <NewBroadcastDialog templates={templates} segmentId={id} label="Email this segment" />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who&apos;s in it</CardTitle>
            <CardDescription>
              {matchCount === null ? "Choose what people need to match." : `${matchCount} ${matchCount === 1 ? "person matches" : "people match"}.`}{" "}
              Any choice within a field counts, and every field you use has to match.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion multiple defaultValue={openGroups}>
              {RULE_GROUPS.map((group) => (
                <AccordionItem key={group.key} value={group.key}>
                  <AccordionTrigger>
                    {group.label}
                    {usedInGroup(group, currentRules) > 0 && ` (${usedInGroup(group, currentRules)})`}
                  </AccordionTrigger>
                  <AccordionContent>
                    <FieldGroup className="gap-3 pb-2">
                      {group.journey.map((field) => (
                        <Field key={field.key}>
                          <FieldLabel htmlFor={`rule-${field.key}`}>{field.label}</FieldLabel>
                          <MultiSelect
                            id={`rule-${field.key}`}
                            options={journeyOptions[field.key]}
                            value={rules[field.key]}
                            onChange={(value) => setRules({ ...rules, [field.key]: value })}
                            placeholder="Any"
                          />
                        </Field>
                      ))}
                      {group.fields.map((field) => (
                        <Field key={field.key}>
                          <FieldLabel htmlFor={`rule-${field.key}`}>{field.label}</FieldLabel>
                          <MultiSelect
                            id={`rule-${field.key}`}
                            options={options[field.key].map((value) => ({ label: value, value }))}
                            value={rules[field.key]}
                            onChange={(value) => setRules({ ...rules, [field.key]: value })}
                            placeholder="Any"
                            emptyMessage="Nobody has an answer here yet."
                          />
                        </Field>
                      ))}
                      {group.key === "notes" && (
                        <Field>
                          <FieldLabel htmlFor="rule-keywords">Words in their answers or your notes</FieldLabel>
                          <Input
                            id="rule-keywords"
                            value={keywords}
                            placeholder="family, kids"
                            onChange={(event) => setKeywords(event.target.value)}
                          />
                          <FieldDescription>Separate with commas.</FieldDescription>
                        </Field>
                      )}
                    </FieldGroup>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add people by hand</CardTitle>
              <CardDescription>
                For people the rules can&apos;t catch. You can also select people on the People page.
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
              <CardDescription>{reachable} can be emailed. This list follows your rules as you change them.</CardDescription>
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
                          <div>
                            <Link href={`/subscribers/${person.id}`} className="underline-offset-4 hover:underline">
                              {[person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "No name"}
                            </Link>
                          </div>
                          {(!person.email || !person.marketing_ok || person.unsubscribed_at || person.suppressed) && (
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
