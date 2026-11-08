"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

export type PersonOption = { value: string; label: string }

export function PersonPicker({
  id,
  people,
  value,
  onChange,
  placeholder = "Search by name or email",
}: {
  id?: string
  people: PersonOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
}) {
  const labels = new Map(people.map((person) => [person.value, person.label]))

  return (
    <Combobox
      items={people.map((person) => person.value)}
      itemToStringLabel={(item: string) => labels.get(item) ?? item}
      value={value}
      onValueChange={onChange}
    >
      <ComboboxInput id={id} placeholder={placeholder} showClear={Boolean(value)} className="w-full" />
      <ComboboxContent>
        <ComboboxEmpty>Nobody by that name.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {labels.get(item) ?? item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
