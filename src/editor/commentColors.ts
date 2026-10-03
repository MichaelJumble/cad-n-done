import * as Blockly from 'blockly'
import { t, type TranslationKey } from '../i18n'

/** Eigener Top-Level-Key im gespeicherten Workspace-Zustand (Autosave UND
 *  Datei-Export/-Import, siehe workspace.ts/saveProject.ts) fuer die
 *  gewaehlte Zonenfarbe je Kommentar - Blockly kennt selbst keine Farbe pro
 *  Kommentar (siehe applyColor() unten), daher hier als Seitenkanal
 *  gespeichert, aehnlich projectMetadata.ts. Unbekannte Top-Level-Keys
 *  ignoriert Blocklys Loader, der zusaetzliche Key stoert also nicht. */
export const COMMENT_COLORS_KEY = 'cadiumCommentColors'

// Attribut auf dem Kommentar-SVG-Root, in dem der gewaehlte Farbschluessel
// steht - dient gleichzeitig als Quelle beim Sammeln fuer den Save (siehe
// collectCommentColors()) und ist im DOM-Inspector leicht nachvollziehbar.
const COLOR_ATTR = 'data-cadium-zone-color'

interface ZoneColor {
  key: string
  fill: string
  border: string
  labelKey: TranslationKey
}

// "default" setzt keine eigene Farbe, sondern entfernt eine evtl. vorher
// gesetzte Ueberschreibung wieder - dann greift Blocklys normale, vom
// aktuellen Theme abhaengige Kommentarfarbe (siehe applyColor()).
const ZONE_COLORS: ZoneColor[] = [
  { key: 'default', fill: '', border: '', labelKey: 'zone_color.default' },
  { key: 'green', fill: '#D9F2D9', border: '#8FC98F', labelKey: 'zone_color.green' },
  { key: 'blue', fill: '#D6E8FA', border: '#8FBEEA', labelKey: 'zone_color.blue' },
  { key: 'pink', fill: '#FADCE8', border: '#E894BB', labelKey: 'zone_color.pink' },
  { key: 'orange', fill: '#FCE3C7', border: '#EBAE5C', labelKey: 'zone_color.orange' },
  { key: 'purple', fill: '#E6DCF5', border: '#B48FE0', labelKey: 'zone_color.purple' },
  { key: 'gray', fill: '#E4E4E4', border: '#B0B0B0', labelKey: 'zone_color.gray' },
]

/** Ueberschreibt Blocklys eigene, workspace-weite CSS-Variablen
 *  (--commentFillColour/--commentBorderColour, siehe Blocklys eingebautes
 *  Stylesheet) gezielt fuer DIESEN einen Kommentar, indem sie als Inline-
 *  Style auf seinem SVG-Root-Element gesetzt werden - CSS-Variablen kaskadieren
 *  auf Nachfahren, die zugehoerigen Regeln (Titelleiste UND Textarea-
 *  Hintergrund, letztere trotz foreignObject-Grenze) greifen so automatisch,
 *  ganz ohne Blocklys eigene Elemente/Farbwahl direkt anzufassen. */
function applyColor(
  comment: Blockly.comments.RenderedWorkspaceComment,
  zoneColor: ZoneColor,
): void {
  const svgRoot = comment.getSvgRoot()
  if (zoneColor.key === 'default') {
    svgRoot.style.removeProperty('--commentFillColour')
    svgRoot.style.removeProperty('--commentBorderColour')
    svgRoot.removeAttribute(COLOR_ATTR)
  } else {
    svgRoot.style.setProperty('--commentFillColour', zoneColor.fill)
    svgRoot.style.setProperty('--commentBorderColour', zoneColor.border)
    svgRoot.setAttribute(COLOR_ATTR, zoneColor.key)
  }
}

/** Sammelt die aktuell gesetzten Zonenfarben aller Kommentare (aus dem
 *  COLOR_ATTR ausgelesen) - vor jedem Speichern (Autosave UND Datei-Export)
 *  aufzurufen, um sie als COMMENT_COLORS_KEY im Zustand mitzuspeichern. */
export function collectCommentColors(workspace: Blockly.WorkspaceSvg): Record<string, string> {
  const result: Record<string, string> = {}
  for (const comment of workspace.getTopComments(false)) {
    const key = comment.getSvgRoot().getAttribute(COLOR_ATTR)
    if (key) result[comment.id] = key
  }
  return result
}

/** Stellt Zonenfarben aus einem geladenen Zustand wieder her - NACH
 *  Blockly.serialization.workspaces.load() aufzurufen, da die Kommentare
 *  vorher noch gar nicht existieren. */
export function restoreCommentColors(workspace: Blockly.WorkspaceSvg, state: object): void {
  const map = (state as Record<string, unknown>)[COMMENT_COLORS_KEY]
  if (!map || typeof map !== 'object') return
  for (const [id, key] of Object.entries(map as Record<string, unknown>)) {
    if (typeof key !== 'string') continue
    const zoneColor = ZONE_COLORS.find((c) => c.key === key)
    const comment = workspace.getCommentById(id)
    if (zoneColor && comment) applyColor(comment, zoneColor)
  }
}

function buildLabel(zoneColor: ZoneColor): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.style.display = 'inline-flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.gap = '6px'
  if (zoneColor.key !== 'default') {
    const swatch = document.createElement('span')
    swatch.style.width = '10px'
    swatch.style.height = '10px'
    swatch.style.borderRadius = '2px'
    swatch.style.background = zoneColor.fill
    swatch.style.border = `1px solid ${zoneColor.border}`
    swatch.style.flexShrink = '0'
    wrapper.appendChild(swatch)
  }
  wrapper.appendChild(document.createTextNode(t(zoneColor.labelKey)))
  return wrapper
}

let registered = false

/** Registriert einen Eintrag pro Palettenfarbe im Rechtsklick-Kontextmenue
 *  EINES Kommentars (ScopeType.COMMENT) - Blockly kennt selbst keine
 *  Untermenues in der ContextMenuRegistry, daher hier bewusst als flache
 *  Liste statt eines einzelnen Menues mit Farbauswahl-Popup. Nur einmal pro
 *  Seitenaufruf noetig (die Registry ist global, ein zweiter Aufruf wuerde
 *  mit "ID existiert bereits" fehlschlagen). */
export function registerZoneColorMenu(): void {
  if (registered) return
  registered = true
  ZONE_COLORS.forEach((zoneColor, index) => {
    Blockly.ContextMenuRegistry.registry.register({
      displayText: () => buildLabel(zoneColor),
      preconditionFn: (scope) => (scope.comment ? 'enabled' : 'hidden'),
      callback: (scope) => {
        if (scope.comment) applyColor(scope.comment, zoneColor)
      },
      scopeType: Blockly.ContextMenuRegistry.ScopeType.COMMENT,
      id: `zoneColor_${zoneColor.key}`,
      weight: 10 + index,
    })
  })
}
