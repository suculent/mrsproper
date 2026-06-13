// Country picker — flag glyph + dial code trigger, searchable dropdown.
// Uses libphonenumber-js for the country/dial-code list.
// Selecting a country never clears the typed national number (D-07).

import React, { useState, useMemo } from 'react'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@renderer/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'

// Flag emoji from country code (Unicode regional indicator symbols)
function getFlagEmoji(code: CountryCode): string {
  const codePoints = [...code].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

interface CountryOption {
  code: CountryCode
  name: string
  dialCode: string
  flag: string
}

// WR-04 (Phase 8 review): country display names follow the active UI language.
// Built per language (not once at module load) so a language switch re-localizes
// both the visible names and the search filter ("Německo" must match in Czech).
function buildCountryOptions(lang: string): CountryOption[] {
  let regionNames: Intl.DisplayNames
  try {
    regionNames = new Intl.DisplayNames([lang], { type: 'region' })
  } catch {
    // Unknown/invalid locale tag — fall back to English names
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  }
  const getCountryName = (code: CountryCode): string => {
    try {
      return regionNames.of(code) ?? code
    } catch {
      return code
    }
  }
  return getCountries()
    .map((code) => ({
      code,
      name: getCountryName(code),
      dialCode: `+${getCountryCallingCode(code)}`,
      flag: getFlagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, lang))
}

// English baseline list — exported for module-level consumers that only use
// code/dialCode lookups (TargetInput locale guess, DEFAULT_COUNTRY).
const COUNTRY_OPTIONS: CountryOption[] = buildCountryOptions('en')

// Default to CZ (Czech Republic, +420)
const DEFAULT_COUNTRY = COUNTRY_OPTIONS.find((c) => c.code === 'CZ') ?? COUNTRY_OPTIONS[0]

interface CountryPickerProps {
  value: CountryOption
  onChange: (country: CountryOption) => void
  disabled?: boolean
}

export { type CountryOption, DEFAULT_COUNTRY, COUNTRY_OPTIONS }

export default function CountryPicker({ value, onChange, disabled }: CountryPickerProps): React.JSX.Element {
  const { t, i18n } = useTranslation('auth')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // WR-04: rebuild (and re-sort) the option list when the UI language changes
  const options = useMemo(
    () => (i18n.language === 'en' ? COUNTRY_OPTIONS : buildCountryOptions(i18n.language)),
    [i18n.language]
  )

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q)
    )
  }, [search, options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t('countryPicker.aria')}
          disabled={disabled}
          className="min-w-[110px] justify-between font-normal"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">{value.flag}</span>
            <span className="text-label">{value.dialCode}</span>
          </span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('countryPicker.placeholder')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{t('countryPicker.empty')}</CommandEmpty>
            <CommandGroup>
              {filtered.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={() => {
                    onChange(country)
                    setSearch('')
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden="true">{country.flag}</span>
                  <span className="flex-1 text-sm">{country.name}</span>
                  <span className="text-muted-foreground text-sm font-mono">{country.dialCode}</span>
                  <Check
                    className={cn('h-4 w-4', value.code === country.code ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
