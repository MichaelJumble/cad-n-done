import { de } from './locales/de'
import { en } from './locales/en'

export type TranslationKey = keyof typeof de
export type Locale = 'de' | 'en'

export const SUPPORTED_LOCALES: readonly Locale[] = ['de', 'en']
export const DEFAULT_LOCALE: Locale = 'de'

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { de, en }

const STORAGE_KEY = 'blockscad-next:locale'

function detectInitialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isLocale(stored)) return stored
  const browserLang = navigator.language.slice(0, 2)
  return isLocale(browserLang) ? browserLang : DEFAULT_LOCALE
}

function isLocale(value: string | null): value is Locale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

const currentLocale: Locale = detectInitialLocale()

export function getLocale(): Locale {
  return currentLocale
}

/** Wechselt die Sprache dauerhaft. Blockly-Bloecke sind zur Registrierungszeit
 *  gebaut, daher wird die Seite neu geladen, damit alles konsistent neu aufbaut. */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return
  localStorage.setItem(STORAGE_KEY, locale)
  location.reload()
}

/** Uebersetzt einen Schluessel in die aktuell aktive Sprache. */
export function t(key: TranslationKey): string {
  return dictionaries[currentLocale][key]
}
