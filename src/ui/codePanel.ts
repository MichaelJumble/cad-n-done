import type { Workspace } from 'blockly'
import { generateCode, collectSvgAssets, collectStlAssets } from '../codegen'
import { getProjectName } from './projectName'
import { t } from '../i18n'

const UPDATE_DEBOUNCE_MS = 150
const COPIED_FEEDBACK_MS = 1500

// Unicode-Glyphen fuer "Kopieren" (⧉, ⎘, ...) rendern in manchen Umgebungen
// als Tofu-Box (Font-Support-Luecke, siehe Icon-Recherche im Viewer-Toolbar-
// Umbau) — deshalb hier ein Inline-SVG statt eines Textzeichens; nur der
// Haekchen-Text (✓) fuers Kopiert-Feedback ist als weit verbreitetes Zeichen
// unproblematisch.
const COPY_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 10.5V3a1 1 0 0 1 1-1h7"/></svg>'
const COPIED_TEXT = '✓'
const DOWNLOAD_SVGS_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M8 2v8"/><path d="M4.5 6.5 8 10l3.5-3.5"/><path d="M3 13h10"/></svg>'

/** Loest einen Browser-Download fuer `content` unter `filename` aus (gleiches
 *  Muster wie viewer/exporter.ts fuer STL/GLB-Export, hier lokal gehalten da
 *  kein Object3D-Bezug noetig ist). Nimmt sowohl Text (SVG) als auch
 *  Binaerdaten (STL) entgegen. */
function sanitizeFilenamePart(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return cleaned || t('project.default_name')
}

function downloadFile(content: string | Uint8Array, filename: string, mimeType: string): void {
  const part: BlobPart = typeof content === 'string' ? content : new Uint8Array(content)
  const blob = new Blob([part], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Kopiert `text` in die Zwischenablage — bevorzugt die Clipboard-API, mit
 *  Fallback auf ein unsichtbares Textfeld + execCommand (z.B. fuer
 *  Nicht-HTTPS-Kontexte, in denen navigator.clipboard fehlt). */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/** Zeigt den aus dem Workspace generierten OpenSCAD-Code live (read-only) an,
 *  mit einem am rechten Rand schwebenden Button zum Kopieren in die
 *  Zwischenablage. */
export function mountCodePanel(root: HTMLElement, workspace: Workspace): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'code-panel-inner'

  const actions = document.createElement('div')
  actions.className = 'code-panel-actions'

  const downloadAssetsBtn = document.createElement('button')
  downloadAssetsBtn.type = 'button'
  downloadAssetsBtn.className = 'btn btn-icon'
  downloadAssetsBtn.title = t('code.download_assets')
  downloadAssetsBtn.setAttribute('aria-label', t('code.download_assets'))
  downloadAssetsBtn.innerHTML = DOWNLOAD_SVGS_ICON_SVG
  downloadAssetsBtn.hidden = true

  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.className = 'btn btn-icon'
  copyBtn.title = t('code.copy')
  copyBtn.setAttribute('aria-label', t('code.copy'))
  copyBtn.innerHTML = COPY_ICON_SVG

  actions.append(downloadAssetsBtn, copyBtn)

  const pre = document.createElement('pre')
  pre.className = 'code-preview'

  wrapper.append(actions, pre)
  root.appendChild(wrapper)

  let currentCode = ''
  let feedbackTimeout: ReturnType<typeof setTimeout> | undefined

  copyBtn.addEventListener('click', () => {
    void copyToClipboard(currentCode).then(() => {
      copyBtn.textContent = COPIED_TEXT
      copyBtn.title = t('code.copied')
      clearTimeout(feedbackTimeout)
      feedbackTimeout = setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON_SVG
        copyBtn.title = t('code.copy')
      }, COPIED_FEEDBACK_MS)
    })
  })

  // Der generierte Code referenziert importierte SVG-/STL-Dateien nur unter
  // einem internen Dateinamen (siehe codegen/svgAssets.ts, codegen/
  // stlAssets.ts) — ohne die eigentliche Datei findet z.B. echtes Desktop-
  // OpenSCAD sie nicht, wenn der Code aus Cadium herauskopiert wird. Dieser
  // Button liefert exakt die Dateien mit exakt denselben Namen, die im Code
  // stehen.
  downloadAssetsBtn.addEventListener('click', () => {
    for (const asset of collectSvgAssets(workspace)) {
      downloadFile(asset.svg, asset.filename, 'image/svg+xml')
    }
    for (const asset of collectStlAssets(workspace)) {
      downloadFile(asset.data, asset.filename, 'model/stl')
    }
    const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
    const scadFilename = `${sanitizeFilenamePart(getProjectName())}_${counterValue}.scad`
    downloadFile(currentCode, scadFilename, 'text/plain')
  })

  function hasDownloadableAssets(): boolean {
    return collectSvgAssets(workspace).length > 0 || collectStlAssets(workspace).length > 0
  }

  function update(): void {
    const { code } = generateCode(workspace)
    currentCode = code
    pre.textContent = code
    downloadAssetsBtn.hidden = !hasDownloadableAssets()
  }

  update()

  let updateTimeout: ReturnType<typeof setTimeout> | undefined
  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return
    clearTimeout(updateTimeout)
    updateTimeout = setTimeout(update, UPDATE_DEBOUNCE_MS)
  })
}
