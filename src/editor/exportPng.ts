import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { t } from '../i18n'

// Hi-DPI-Faktor fuer den Export: das Original-SVG hat keine eigene
// Aufloesung ueber seine Container-Groesse hinaus, aber da es Vektorgrafik
// ist, laesst sich beim Rasterisieren verlustfrei hochskalieren.
const EXPORT_SCALE = 3

// Chrome-Elemente des Blockly-Workspace-SVGs, die nicht zum eigentlichen
// Design gehoeren und daher aus dem Export entfernt werden.
const CHROME_SELECTORS = [
  '.blocklyScrollbarHorizontal',
  '.blocklyScrollbarVertical',
  '.blocklyScrollbarBackground',
  '.blocklyFlyout',
  '.blocklyTrash',
  '.blocklyZoom',
]

function sanitizeFilenamePart(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return cleaned || t('project.default_name')
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Sammelt alle aktuell geladenen CSS-Regeln als Text: das serialisierte SVG
// wird ausserhalb des Dokuments (per <img>) geladen und kennt daher das
// externe Stylesheet nicht (Blockly stylt Blocktexte etc. teils ueber
// CSS-Klassen statt Inline-Attribute) - ohne das wuerde z.B. die Schrift
// falsch dargestellt.
function collectStylesheetCss(): string {
  let css = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (!sheet.cssRules) continue
      for (const rule of Array.from(sheet.cssRules)) css += `${rule.cssText}\n`
    } catch {
      // Cross-Origin-Stylesheet, nicht auslesbar - fuer den Export irrelevant.
    }
  }
  return css
}

// Blockly setzt Gitter-/Filter-Referenzen (--blocklyGridPattern, etc.) als
// Custom Properties inline auf dem injectionDiv, nicht auf dem SVG selbst
// oder in einem Stylesheet - beim Klonen des reinen SVGs gehen sie verloren
// und Elemente wie der Workspace-Hintergrund (fill: var(--blocklyGridPattern))
// fallen ohne sie auf Schwarz zurueck. Ausserdem stecken Renderer/Theme-
// Klassen ("geras-renderer classic-theme") ebenfalls auf dem injectionDiv,
// nicht auf dem SVG - viele Blockly-Regeln sind aber genau darauf verankert
// (z.B. ".classic-theme .blocklyEditableField > rect"), ohne sie rendern
// z.B. Eingabefelder ebenfalls schwarz statt in Theme-Farben. Beides muss
// daher explizit auf den Klon uebertragen werden.
function copyInjectionDivContext(injectionDiv: HTMLElement, target: SVGSVGElement): void {
  const style = injectionDiv.style
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i)
    if (prop.startsWith('--')) target.style.setProperty(prop, style.getPropertyValue(prop))
  }
  target.setAttribute(
    'class',
    `${target.getAttribute('class') ?? ''} ${injectionDiv.className}`.trim(),
  )
}

function buildExportSvg(workspace: WorkspaceSvg): {
  svg: SVGSVGElement
  width: number
  height: number
} {
  const source = workspace.getParentSvg()
  const width = source.clientWidth
  const height = source.clientHeight

  const clone = source.cloneNode(true) as SVGSVGElement
  copyInjectionDivContext(workspace.getInjectionDiv(), clone)
  for (const selector of CHROME_SELECTORS) {
    clone.querySelectorAll(selector).forEach((el) => el.remove())
  }

  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('width', String(width * EXPORT_SCALE))
  clone.setAttribute('height', String(height * EXPORT_SCALE))

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = collectStylesheetCss()
  clone.insertBefore(style, clone.firstChild)

  return { svg: clone, width: width * EXPORT_SCALE, height: height * EXPORT_SCALE }
}

/** Exportiert den aktuellen Blockly-Workspace als PNG-Datei (Screenshot des
 *  Block-Designs, keine 3D-Geometrie). Zoomt vorher auf den kompletten
 *  Entwurf, da sonst nur der aktuell sichtbare Ausschnitt exportiert wuerde. */
export async function exportWorkspacePng(
  workspace: WorkspaceSvg,
  projectName: string,
  counterValue: string,
): Promise<void> {
  workspace.zoomToFit()
  await Blockly.renderManagement.finishQueuedRenders()

  const { svg, width, height } = buildExportSvg(workspace)
  const svgText = new XMLSerializer().serializeToString(svg)
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`

  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('SVG-Bild konnte nicht geladen werden'))
    image.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas-Kontext nicht verfuegbar')
  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG-Export fehlgeschlagen'))),
      'image/png',
    )
  })

  downloadBlob(blob, `${sanitizeFilenamePart(projectName)}_${counterValue}.png`)
}
