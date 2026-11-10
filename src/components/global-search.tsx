"use client"

import { SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { searchPeople, type PersonHit } from "@/app/(app)/subscribers/actions"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { lifecycleLabel } from "@/lib/pipeline/stages"

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PersonHit[]>([])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const found = query.trim() ? await searchPeople(query) : []
      if (current) setResults(found)
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  function go(id: string) {
    setOpen(false)
    setQuery("")
    router.push(`/subscribers/${id}`)
  }

  return (
    <>
      <Button variant="outline" className="w-full min-w-0 max-w-xs shrink justify-start text-muted-foreground" onClick={() => setOpen(true)}>
        <SearchIcon data-icon="inline-start" />
        Find a person
        <CommandShortcut className="hidden md:inline">⌘K</CommandShortcut>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Find a person" description="Search by name, email, phone or tag.">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name, email, phone or tag" value={query} onValueChange={setQuery} />
          <CommandList>
            {query.trim() && <CommandEmpty>Nobody matches that.</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup heading="People">
                {results.map((person) => (
                  <CommandItem key={person.id} value={person.id} onSelect={() => go(person.id)}>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{person.name}</span>
                      {person.email && <span className="text-muted-foreground"> · {person.email}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{lifecycleLabel(person.lifecycle)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
