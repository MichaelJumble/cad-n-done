export type ThemeName = 'default' | 'dark' | 'contrast'

export const SUPPORTED_THEMES: readonly ThemeName[] = ['default', 'dark', 'contrast']
export const DEFAULT_THEME: ThemeName = 'default'

const STORAGE_KEY = 'blockscad-next:theme'

type ThemeListener = (theme: ThemeName) => void
const listeners = new Set<ThemeListener>()

function isTheme(value: string | null): value is ThemeName {
  return value != null && (SUPPORTED_THEMES as readonly string[]).includes(value)
}

export function getTheme(): ThemeName {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : DEFAULT_THEME
}

function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

/** Wechselt das Farbdesign live (kein Reload noetig) und benachrichtigt Listener
 *  (z.B. den Editor, um Blocklys eigenes Theme mitzuziehen). */
export function setTheme(theme: ThemeName): void {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
  listeners.forEach((listener) => listener(theme))
}

export function onThemeChange(listener: ThemeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** So frueh wie moeglich aufrufen (vor dem ersten Render), um FOUC zu vermeiden. */
export function initTheme(): void {
  applyTheme(getTheme())
}
