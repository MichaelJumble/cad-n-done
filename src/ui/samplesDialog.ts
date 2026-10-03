import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { t } from '../i18n'
import { mountConfirmDialog } from './confirmDialog'
import { mountMessageDialog } from './messageDialog'
import { rerenderAllBlocks } from '../editor'
import { readProjectMetadata, type ProjectMetadata } from './projectMetadata'
import { restoreCommentColors } from '../editor/commentColors'
import {
  SAMPLES_BASE,
  fetchSamplesManifest,
  mountSamplesBrowser,
  type SampleEntry,
} from './samplesBrowser'

// Gleiches Icon wie der Vorschau-Popout-Knopf im Viewer (siehe
// viewerPanel.ts::POPOUT_ICON_SVG) - Unicode-Kandidaten sind auch hier das
// bekannte Tofu-Risiko in manchen Umgebungen.
const POPOUT_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M9 2h5v5"/><path d="M14 2L7 9"/></svg>'

export interface SamplesDialogHandle {
  open(): void
}

/** Baut den "Tutorials"-Dialog: Liste laedt sich beim ersten Oeffnen einmalig
 *  aus manifest.json (siehe samplesBrowser.ts fuer die gemeinsame Kapitel-
 *  Leiste/Listen-Logik, geteilt mit der ausgelagerten Seite tutorials.html).
 *  Jeder Eintrag hat einen "Laden"-Knopf (ersetzt das aktuelle Design, daher
 *  wie beim normalen "Oeffnen" erst eine Bestaetigung).
 *
 *  Der Popout-Knopf im Header navigiert zu einer ECHTEN, eigenstaendigen
 *  Seite (tutorials.html) statt wie der Viewer-Popout (siehe popout.ts)
 *  DOM-Knoten in ein leeres about:blank-Fenster zu verschieben - dieser
 *  Dialog haengt an mehreren VERSCHACHTELTEN <dialog>-Elementen
 *  (confirmReplace/loadErrorDialog), deren method="dialog"-Formulare
 *  ausserhalb eines <dialog> nicht mehr sinnvoll funktionieren wuerden, und
 *  ein about:blank-Fenster bekommt ausserdem nie eine echte Adresse/Favicon
 *  im Tab. Die eigenstaendige Seite fragt Ladewuensche per postMessage beim
 *  Hauptfenster an (siehe der "message"-Listener unten) - das eigentliche
 *  Ersetzen des Designs (inkl. Bestaetigung) bleibt bewusst im Hauptfenster,
 *  da es dessen Workspace betrifft. */
export function mountSamplesDialog(
  workspace: WorkspaceSvg,
  onMetadata: (metadata: ProjectMetadata) => void,
): SamplesDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog samples-dialog'
  dialog.innerHTML = `
    <div class="samples-dialog-header">
      <h2>${t('samples.title')}</h2>
      <button type="button" class="btn btn-icon" id="samples-popout-btn" title="${t('samples.popout')}" aria-label="${t('samples.popout')}">${POPOUT_ICON_SVG}</button>
    </div>
    <div class="samples-body">
      <div class="samples-chapters" id="samples-chapters"></div>
      <div class="samples-list" id="samples-list">
        <p class="samples-status">${t('samples.loading')}</p>
      </div>
    </div>
    <form method="dialog" class="samples-dialog-actions">
      <button type="submit" class="btn">${t('samples.close')}</button>
    </form>
  `
  document.body.appendChild(dialog)
  const popoutBtn = dialog.querySelector<HTMLButtonElement>('#samples-popout-btn')!
  const chapters = dialog.querySelector<HTMLDivElement>('#samples-chapters')!
  const list = dialog.querySelector<HTMLDivElement>('#samples-list')!

  const loadErrorDialog = mountMessageDialog(
    t('load_error.title'),
    t('samples.load_error'),
    t('load_error.close'),
  )

  // EIN gemeinsamer Bestaetigungsdialog fuer alle Eintraege (egal ob aus dem
  // eingebetteten Dialog oder von der ausgelagerten Seite angefragt) - welches
  // Beispiel tatsaechlich geladen wird, entscheidet `pendingEntry`, das vor
  // jedem confirmReplace.open() neu gesetzt wird (analog zum Datei-Picker in
  // loadProject.ts, dort gibt es aber nur EINE moegliche Aktion).
  let pendingEntry: SampleEntry | null = null
  const confirmReplace = mountConfirmDialog(
    {
      title: t('load_dialog.title'),
      message: t('load_dialog.message'),
      cancelLabel: t('load_dialog.cancel'),
      confirmLabel: t('samples.confirm_load'),
      danger: true,
    },
    () => {
      if (pendingEntry) void loadSample(pendingEntry)
    },
  )

  function requestLoad(entry: SampleEntry): void {
    pendingEntry = entry
    confirmReplace.open()
  }

  async function loadSample(entry: SampleEntry): Promise<void> {
    try {
      const response = await fetch(`${SAMPLES_BASE}${entry.file}`)
      if (!response.ok) throw new Error(String(response.status))
      const state = (await response.json()) as object
      workspace.clear()
      Blockly.serialization.workspaces.load(state, workspace)
      rerenderAllBlocks(workspace)
      restoreCommentColors(workspace, state)
      const metadata = readProjectMetadata(state)
      if (metadata) onMetadata(metadata)
      dialog.close()
    } catch (err) {
      console.warn('[samplesDialog] Beispiel konnte nicht geladen werden:', err)
      loadErrorDialog.open()
    }
  }

  // Ladewunsch von der ausgelagerten Tutorials-Seite (siehe tutorialsMain.ts) -
  // Ursprung wird geprueft, da "message" grundsaetzlich von ueberall kommen
  // koennte; die Seite ist aber ohnehin same-origin (gleiche Vite-App).
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { type?: string; entry?: SampleEntry }
    if (data?.type === 'cadium:load-sample' && data.entry) requestLoad(data.entry)
  })

  const browser = mountSamplesBrowser(chapters, list, requestLoad)

  // Nur EINMAL beim ersten Oeffnen laden, nicht bei jedem erneuten Oeffnen -
  // das Manifest aendert sich waehrend einer laufenden Sitzung ohnehin nicht.
  let manifestRequested = false
  async function ensureManifestLoaded(): Promise<void> {
    if (manifestRequested) return
    manifestRequested = true
    try {
      browser.showEntries(await fetchSamplesManifest())
    } catch (err) {
      console.warn('[samplesDialog] Manifest konnte nicht geladen werden:', err)
      manifestRequested = false
      list.innerHTML = `<p class="samples-status">${t('samples.error')}</p>`
    }
  }

  let popupWindow: Window | null = null
  function openPopout(): void {
    if (popupWindow) {
      popupWindow.focus()
      return
    }
    const win = window.open(
      `${import.meta.env.BASE_URL}tutorials.html`,
      'cadium-tutorials-popout',
      'width=900,height=650',
    )
    if (!win) return
    popupWindow = win
    // Man befindet sich ja schon im eigenen Fenster - der Knopf, es
    // auszulagern, waere dort ohne weiteren Effekt/Sinn.
    popoutBtn.hidden = true
    dialog.close()
    win.addEventListener('pagehide', () => {
      popupWindow = null
      popoutBtn.hidden = false
    })
  }
  popoutBtn.addEventListener('click', () => openPopout())
  window.addEventListener('beforeunload', () => popupWindow?.close())

  return {
    open(): void {
      // Waehrend die Tutorials-Seite ausgelagert ist, dorthin fokussieren
      // statt einen (dann redundanten) eingebetteten Dialog zu zeigen.
      if (popupWindow) {
        popupWindow.focus()
        return
      }
      dialog.showModal()
      void ensureManifestLoaded()
    },
  }
}
