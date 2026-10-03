import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { t } from '../i18n'

const COLLAPSED_CLASS = 'bsn-toolbox-collapsed'
// Muessen zu den width-Werten/der Transition-Dauer in layout.css passen.
const TRANSITION_MS = 220
const EXPANDED_WIDTH = 208
const COLLAPSED_WIDTH = 56
const BUTTON_SIZE = 28
const BUTTON_MARGIN = 8

/** Fuegt einen Ein-/Ausklapp-Knopf oben rechts an der Toolbox hinzu: klappt
 *  sie auf einen schmalen Streifen mit nur noch Farbe + Icon je Kategorie
 *  zusammen (Pfeil zeigt dann nach rechts zum Wiederaufklappen) oder zeigt
 *  wieder die vollen Zeilen mit Namen (Pfeil zeigt nach links zum
 *  Einklappen). */
export function setupToolboxCollapse(workspace: WorkspaceSvg): void {
  const injectionDiv = workspace.getInjectionDiv()
  const toolboxEl = injectionDiv.querySelector<HTMLElement>('.blocklyToolbox')
  if (!toolboxEl) return

  const btn = document.createElement('div')
  btn.className = 'bsn-zoom-btn bsn-toolbox-toggle'
  btn.setAttribute('role', 'button')
  btn.setAttribute('tabindex', '0')
  injectionDiv.appendChild(btn)

  let collapsed = false

  function updateButton(): void {
    btn.textContent = collapsed ? '›' : '‹'
    const label = collapsed ? t('toolbox.expand') : t('toolbox.collapse')
    btn.title = label
    btn.setAttribute('aria-label', label)
  }

  // "left" bewusst aus der BEKANNTEN Ziel-Breite berechnet statt per
  // getBoundingClientRect() live gemessen: waehrend die width-Transition
  // laeuft, wuerde eine Live-Messung noch (fast) den alten Wert liefern,
  // der Knopf haette also nichts zum Hin-Animieren und wuerde erst am Ende
  // sichtbar zur neuen Stelle springen -- mit dem bekannten Zielwert kann
  // die CSS-transition (siehe .bsn-toolbox-toggle) sofort synchron mit der
  // Toolbox-Breite mitlaufen. "top" bleibt gemessen, da sich die Toolbox
  // dort nie bewegt.
  function position(): void {
    const injectionRect = injectionDiv.getBoundingClientRect()
    const toolboxTop = toolboxEl!.getBoundingClientRect().top
    const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
    btn.style.top = `${toolboxTop - injectionRect.top + BUTTON_MARGIN}px`
    btn.style.left = `${width - BUTTON_SIZE - BUTTON_MARGIN}px`
  }

  function toggle(): void {
    collapsed = !collapsed
    toolboxEl!.classList.toggle(COLLAPSED_CLASS, collapsed)
    updateButton()
    position()
    Blockly.svgResize(workspace)
    // Waehrend/nach der CSS-Breiten-Animation nochmal vermessen, damit
    // Blockly die Arbeitsflaechen-Metriken auf die neue Toolbox-Breite
    // aktualisiert (sonst bleibt z.B. der sichtbare Scroll-Bereich falsch).
    setTimeout(() => {
      position()
      Blockly.svgResize(workspace)
    }, TRANSITION_MS)
  }

  btn.addEventListener('click', toggle)
  btn.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  })

  updateButton()
  position()
  new ResizeObserver(() => position()).observe(injectionDiv)
}
