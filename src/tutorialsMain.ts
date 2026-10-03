import './ui/layout.css'
import { t } from './i18n'
import { fetchSamplesManifest, mountSamplesBrowser, type SampleEntry } from './ui/samplesBrowser'

/** Eigenstaendige Seite fuer den Tutorials-Popout (siehe samplesDialog.ts fuer
 *  die Begruendung, warum das eine echte Seite statt eines about:blank-
 *  Fensters ist). Nutzt dieselbe Kapitel-Leiste/Listen-Logik wie der
 *  eingebettete Dialog (samplesBrowser.ts), fragt "Laden"-Klicks aber nur per
 *  postMessage beim OEFFNENDEN Fenster an - das eigentliche Ersetzen des
 *  Designs (inkl. Bestaetigungsdialog) passiert dort, da es dessen Workspace
 *  betrifft, den diese Seite gar nicht kennt. */

document.title = t('samples.popout_title')

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <div class="samples-page">
    <h1 class="samples-page-title">${t('samples.title')}</h1>
    <div class="samples-body">
      <div class="samples-chapters" id="samples-chapters"></div>
      <div class="samples-list" id="samples-list">
        <p class="samples-status">${t('samples.loading')}</p>
      </div>
    </div>
  </div>
`
const chapters = root.querySelector<HTMLDivElement>('#samples-chapters')!
const list = root.querySelector<HTMLDivElement>('#samples-list')!

function requestLoad(entry: SampleEntry): void {
  window.opener?.postMessage({ type: 'cadium:load-sample', entry }, window.location.origin)
}

const browser = mountSamplesBrowser(chapters, list, requestLoad)

fetchSamplesManifest()
  .then((entries) => browser.showEntries(entries))
  .catch((err: unknown) => {
    console.warn('[tutorialsMain] Manifest konnte nicht geladen werden:', err)
    list.innerHTML = `<p class="samples-status">${t('samples.error')}</p>`
  })
