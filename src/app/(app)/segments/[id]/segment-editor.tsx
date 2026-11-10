"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeftIcon, ListFilterIcon, XIcon, PlusIcon } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ManageMenu } from "@/components/manage-menu"
import { PeopleTable } from "@/components/people-table"
import { MultiSelect, type MultiSelectOption } from "@/components/multi-select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Fab } from "@/components/fab"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import type { Person } from "@/lib/people/load"
import {
  JOURNEY_RULES,
  RULE_FIELDS,
  parseKeywords,
  type JourneyRuleKey,
  type RuleOptions,
  type SegmentRules,
  segmentRulesSchema,
} from "@/lib/segments/rules"

import { NewBroadcastDialog, type TemplateOption } from "../../broadcasts/new-broadcast-dialog"
import { addToSegment, countRuleMatches, deleteSegment, removeFromSegment, saveSegment } from "../actions"
import { SegmentColorButton } from "../segment-color-picker"

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

const personLabel = (person: Person) => [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email || "them"

function AddPeopleDialog({ id, candidates, fab = false }: { id: string; candidates: MultiSelectOption[]; fab?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [toAdd, setToAdd] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      const result = await addToSegment({ segmentId: id, subscriberIds: toAdd })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Added ${toAdd.length} ${toAdd.length === 1 ? "person" : "people"}`)
      setToAdd([])
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={fab ? <Fab aria-label="Add people" /> : <Button />}>{fab ? <PlusIcon /> : <><PlusIcon data-icon="inline-start" />Add people</>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people to this segment</DialogTitle>
          <DialogDescription>They stay in it whatever the rules say, until you take them out.</DialogDescription>
        </DialogHeader>
        <MultiSelect options={candidates} value={toAdd} onChange={setToAdd} placeholder="Search by name or email" />
        <DialogFooter>
          <Button onClick={add} disabled={toAdd.length === 0 || isPending}>
            {isPending && <Spinner data-icon="inline-start" />}
            Add {toAdd.length > 0 ? toAdd.length : ""} to segment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SegmentEditor({
  id,
  name: savedName,
  description: savedDescription,
  color: savedColor,
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
  color: string
  rules: SegmentRules
  options: RuleOptions
  journeyOptions: Record<JourneyRuleKey, MultiSelectOption[]>
  templates: TemplateOption[]
  people: Person[]
  addedByHand: string[]
  everyone: MultiSelectOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(savedName)
  const [description, setDescription] = useState(savedDescription ?? "")
  const [rules, setRules] = useState(savedRules)
  const [keywords, setKeywords] = useState(savedRules.keywords.join(", "))
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [openGroups] = useState(() => [
    "journey",
    ...RULE_GROUPS.filter((group) => usedInGroup(group, savedRules) > 0).map((group) => group.key),
  ])

  const added = new Set(addedByHand)
  const inSegment = new Set(people.map((person) => person.id))
  const currentRules = { ...rules, keywords: parseKeywords(keywords) }
  const rulesKey = JSON.stringify(currentRules)
  const ruleCount = RULE_GROUPS.reduce((sum, group) => sum + usedInGroup(group, currentRules), 0)

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

  function remove(subscriberId: string) {
    startTransition(async () => {
      const result = await removeFromSegment({ segmentId: id, subscriberIds: [subscriberId] })
      if (!result.ok) toast.error(result.error)
      else router.refresh()
    })
  }

  const rulesPanel = (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <ListFilterIcon data-icon="inline-start" />
        Rules{ruleCount > 0 && ` (${ruleCount})`}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Who&apos;s in it</SheetTitle>
          <SheetDescription>
            {matchCount === null ? "Choose what people need to match." : `${matchCount} ${matchCount === 1 ? "person matches" : "people match"}.`}{" "}
            Any choice within a field counts, and every field you use has to match. Changes save as you go.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
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
                        <Input id="rule-keywords" value={keywords} placeholder="family, kids" onChange={(event) => setKeywords(event.target.value)} />
                        <FieldDescription>Separate with commas.</FieldDescription>
                      </Field>
                    )}
                  </FieldGroup>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  )

  const title = (
    <div className="flex items-start gap-3">
      <SegmentColorButton id={id} color={savedColor} className="mt-1.5" />
      <div className="flex min-w-56 flex-col">
        <Input
          aria-label="Segment name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-11 border-transparent bg-transparent px-1 font-heading text-2xl font-semibold shadow-none hover:border-input md:text-2xl"
        />
        <Input
          aria-label="Description"
          placeholder="Add a description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="h-7 border-transparent bg-transparent px-1 text-sm text-muted-foreground shadow-none hover:border-input"
        />
      </div>
    </div>
  )

  const actions = (
    <>
      {rulesPanel}
      <ManageMenu
        label="Manage this segment"
        actions={[
          {
            label: "Reset rules",
            title: "Clear this segment's rules?",
            description: "Removes every rule. People you added by hand stay in it.",
            success: "Rules cleared",
            run: async () => {
              setRules(segmentRulesSchema.parse({}))
              setKeywords("")
              return { ok: true }
            },
          },
          {
            label: "Remove segment",
            title: `Remove ${savedName}?`,
            description: "Nobody is unsubscribed or removed from Airtable. Scheduled emails using this segment will skip it.",
            destructive: true,
            success: "Segment removed",
            redirectTo: "/segments",
            run: () => deleteSegment(id),
          },
        ]}
      />
      <NewBroadcastDialog templates={templates} segmentId={id} label="Email this segment" variant="outline" />
      <AddPeopleDialog id={id} candidates={everyone.filter((person) => !inSegment.has(person.value))} />
    </>
  )

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 self-start" render={<Link href="/segments" />} nativeButton={false}>
        <ChevronLeftIcon data-icon="inline-start" />
        All segments
      </Button>

      <PeopleTable
        people={people}
        title={title}
        actions={actions}
        empty={
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>This segment is empty</EmptyTitle>
              <EmptyDescription>Add people by hand, or set rules so it fills itself.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              {rulesPanel}
              <AddPeopleDialog id={id} candidates={everyone} />
            </EmptyContent>
          </Empty>
        }
        membership={{
          header: "How",
          cell: (person) =>
            added.has(person.id) ? (
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Take ${personLabel(person)} out of this segment`}
                onClick={() => remove(person.id)}
                disabled={isPending}
              >
                By hand
                <XIcon data-icon="inline-end" />
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Rules</span>
            ),
        }}
      />
    </>
  )
}
