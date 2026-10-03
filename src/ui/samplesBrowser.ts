import { t } from '../i18n'

/** Ein Eintrag in public/samples/manifest.json - `file` und das optionale
 *  `video` sind Dateinamen relativ zu public/samples/ (kein Pfad-Praefix,
 *  Vite liefert alles unter public/ unveraendert unter der eigenen Basis-
 *  URL aus). Ein statischer Webserver kann kein Verzeichnis auflisten,
 *  daher muss dieses Manifest von Hand gepflegt werden, wenn Beispiele
 *  hinzukommen/wegfallen. `category` gruppiert die Eintraege im Dialog
 *  (linke Kapitel-Leiste) - Eintraege ohne `category` landen gesammelt
 *  unter samples.uncategorized. */
export interface SampleEntry {
  name: string
  category?: string
  file: string
  description?: string
  video?: string
}

export const SAMPLES_BASE = `${import.meta.env.BASE_URL}samples/`

export async function fetchSamplesManifest(): Promise<SampleEntry[]> {
  const response = await fetch(`${SAMPLES_BASE}manifest.json`)
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as SampleEntry[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Gruppiert nach `category` in der Reihenfolge ihres ERSTEN Auftretens im
 *  Manifest (kein alphabetisches Sortieren - der Autor des Manifests
 *  bestimmt damit implizit die Kapitel-Reihenfolge). */
function groupByCategory(entries: SampleEntry[]): Map<string, SampleEntry[]> {
  const groups = new Map<string, SampleEntry[]>()
  for (const entry of entries) {
    const category = entry.category ?? t('samples.uncategorized')
    const group = groups.get(category)
    if (group) group.push(entry)
    else groups.set(category, [entry])
  }
  return groups
}

export interface SamplesBrowserHandle {
  /** Baut Kapitel-Leiste + Liste komplett neu aus `entries` auf (z.B. nach
   *  erfolgreichem Laden des Manifests). */
  showEntries(entries: SampleEntry[]): void
}

/** Baut die Kapitel-Leiste (`chaptersEl`) + Eintragsliste (`listEl`) auf und
 *  verdrahtet Video-Vorschau-Toggle (zeigt/versteckt bei Klick, laedt das
 *  Video erst bei Bedarf) sowie den "Laden"-Knopf - dieser ruft nur
 *  `onLoad(entry)` auf, das eigentliche Ersetzen des aktuellen Designs
 *  entscheidet der Aufrufer (im eingebetteten Dialog direkt im selben
 *  Fenster, in der ausgelagerten Tutorials-Seite per postMessage an das
 *  Hauptfenster - siehe samplesDialog.ts/tutorialsMain.ts). Gemeinsam
 *  genutzt, damit beide Oberflaechen exakt gleich aussehen/funktionieren. */
export function mountSamplesBrowser(
  chaptersEl: HTMLElement,
  listEl: HTMLElement,
  onLoad: (entry: SampleEntry) => void,
): SamplesBrowserHandle {
  function renderEntries(entries: SampleEntry[]): void {
    listEl.innerHTML = entries
      .map(
        (entry, index) => `
          <div class="sample-item">
            <div class="sample-item-info">
              <h3 class="sample-item-name">${escapeHtml(entry.name)}</h3>
              ${entry.description ? `<p class="sample-item-description">${escapeHtml(entry.description)}</p>` : ''}
            </div>
            <div class="sample-item-actions">
              ${entry.video ? `<button type="button" class="btn btn-small sample-video-btn" data-index="${index}">${t('samples.preview')}</button>` : ''}
              <button type="button" class="btn btn-small sample-load-btn" data-index="${index}">${t('samples.load')}</button>
            </div>
            ${entry.video ? `<video class="sample-video" data-index="${index}" hidden controls></video>` : ''}
          </div>
        `,
      )
      .join('')

    listEl.querySelectorAll<HTMLButtonElement>('.sample-load-btn').forEach((btn) => {
      const entry = entries[Number(btn.dataset.index)]
      btn.addEventListener('click', () => onLoad(entry))
    })
    // Zeigt das Video NUR bei Klick an (nicht alle Videos vorab laden) und
    // versteckt es bei erneutem Klick auf denselben Knopf wieder.
    listEl.querySelectorAll<HTMLButtonElement>('.sample-video-btn').forEach((btn) => {
      const entry = entries[Number(btn.dataset.index)]
      btn.addEventListener('click', () => {
        const video = listEl.querySelector<HTMLVideoElement>(
          `video[data-index="${btn.dataset.index}"]`,
        )!
        if (video.hidden) {
          video.src = `${SAMPLES_BASE}${entry.video}`
          video.hidden = false
          void video.play()
        } else {
          video.pause()
          video.hidden = true
        }
      })
    })
  }

  function renderChapters(groups: Map<string, SampleEntry[]>): void {
    const names = [...groups.keys()]
    chaptersEl.innerHTML = names
      .map(
        (name, index) => `
          <button type="button" class="samples-chapter-btn" data-index="${index}" aria-pressed="${index === 0}">
            ${escapeHtml(name)}
          </button>
        `,
      )
      .join('')

    const buttons = chaptersEl.querySelectorAll<HTMLButtonElement>('.samples-chapter-btn')
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === btn)))
        renderEntries(groups.get(names[Number(btn.dataset.index)])!)
      })
    })

    if (names.length > 0) renderEntries(groups.get(names[0])!)
  }

  return {
    showEntries(entries: SampleEntry[]): void {
      if (entries.length === 0) {
        listEl.innerHTML = `<p class="samples-status">${t('samples.empty')}</p>`
        chaptersEl.innerHTML = ''
        return
      }
      renderChapters(groupByCategory(entries))
    },
  }
}
