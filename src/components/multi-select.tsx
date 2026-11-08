"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"

export type MultiSelectOption = { label: string; value: string }

export function MultiSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyMessage = "Nothing matches that.",
  disabled,
}: {
  id?: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  emptyMessage?: string
  disabled?: boolean
}) {
  const anchor = useComboboxAnchor()
  const labels = new Map(options.map((option) => [option.value, option.label]))

  return (
    <Combobox
      multiple
      items={options.map((option) => option.value)}
      itemToStringLabel={(item: string) => labels.get(item) ?? item}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(selected: string[]) => (
            <>
              {selected.map((item) => (
                <ComboboxChip key={item}>{labels.get(item) ?? item}</ComboboxChip>
              ))}
              <ComboboxChipsInput id={id} placeholder={selected.length === 0 ? placeholder : undefined} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
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
