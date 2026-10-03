import type { WorkspaceSvg } from 'blockly'
import { collectCustomizerModules, type CustomizerCallField } from '../editor/customizer'
import { t } from '../i18n'

/** Baut den Inhalt des Customizer-Overlays im Viewer (siehe viewerPanel.ts). */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Bei Zahl-Feldern haengt der Gueltigkeitsbereich direkt sichtbar hinter
 *  den Namen an (z.B. "Groesse (1-10)") - ohne dieses Feld muesste man erst
 *  den Regler bewegen, um Min/Max ueberhaupt zu erfahren. */
function fieldLabelHtml(field: CustomizerCallField): string {
  const name = escapeHtml(field.description || field.paramName)
  if (field.type !== 'NUMBER') return name
  return `${name} (${field.min}-${field.max})`
}

function fieldControlHtml(field: CustomizerCallField): string {
  const id = field.literalBlockId!
  if (field.type === 'NUMBER') {
    const value = typeof field.currentValue === 'number' ? field.currentValue : (field.min ?? 0)
    // Regler bleibt bei step=1 (fuer grobes Ziehen mit ganzen Schritten),
    // das Zahlenfeld ist bewusst type="text" statt type="number": Ein
    // natives <input type="number"> akzeptiert als Dezimaltrennzeichen NUR
    // "." (unabhaengig von Betriebssystem-/Browser-Sprache) und verwirft
    // ein eingegebenes "," komplett - im Deutschen die uebliche Schreibweise.
    // Die Normalisierung von "," auf "." passiert stattdessen in JS (siehe
    // wireCustomizerBody()).
    return `
      <input type="range" class="customizer-range" data-block-id="${id}" data-kind="number"
        min="${field.min}" max="${field.max}" step="1" value="${Math.round(value)}" />
      <input type="text" inputmode="decimal" class="customizer-number" data-block-id="${id}" data-kind="number"
        min="${field.min}" max="${field.max}" value="${value}" />
    `
  }
  if (field.type === 'TEXT') {
    const value = typeof field.currentValue === 'string' ? field.currentValue : ''
    return `<input type="text" class="customizer-text" data-block-id="${id}" data-kind="text" value="${escapeHtml(value)}" />`
  }
  const checked = field.currentValue === true ? 'checked' : ''
  return `<input type="checkbox" class="customizer-checkbox" data-block-id="${id}" data-kind="boolean" ${checked} />`
}

/** Baut den HTML-Inhalt (Modul/Aufruf/Regler-Struktur) frisch aus dem
 *  aktuellen Workspace-Stand - vom Aufrufer bei jedem Anzeigen (Oeffnen des
 *  Dialogs bzw. Einblenden des Overlays) neu aufzurufen, damit Aenderungen
 *  am Design (neue/entfernte Anpassung-Bloecke) beruecksichtigt werden. */
export function buildCustomizerBodyHtml(workspace: WorkspaceSvg): string {
  const modules = collectCustomizerModules(workspace)
  if (modules.length === 0) {
    return `<p class="customizer-empty">${t('customizer.empty')}</p>`
  }
  return modules
    .map(
      (module) => `
        <div class="customizer-module">
          <h3 class="customizer-module-title">${escapeHtml(module.moduleName)}</h3>
          ${module.comment ? `<p class="customizer-module-comment">${escapeHtml(module.comment)}</p>` : ''}
          ${module.calls
            .map(
              (call) => `
                <div class="customizer-call">
                  ${call.label ? `<div class="customizer-call-label">${t('customizer.call')} ${call.label}</div>` : ''}
                  ${call.fields
                    .map(
                      (field) => `
                        <label class="customizer-field">
                          <span class="customizer-field-label">${fieldLabelHtml(field)}</span>
                          <span class="customizer-field-control">${fieldControlHtml(field)}</span>
                        </label>
                      `,
                    )
                    .join('')}
                </div>
              `,
            )
            .join('')}
        </div>
      `,
    )
    .join('')
}

// KEIN "instanceof HTMLInputElement" hier: das Overlay im Viewer-Panel kann
// in ein ausgelagertes Popup-Fenster verschoben werden (siehe popout.ts) -
// per innerHTML NEU erzeugte <input>-Elemente gehoeren dann zum DOCUMENT
// DES POPUPS, also einer ANDEREN JS-Realitaet mit eigenem HTMLInputElement-
// Konstruktor. "instanceof" prueft gegen DIESES Moduls (Hauptfenster-)
// Konstruktor und schlaegt fuer im Popup erzeugte Elemente faelschlich fehl
// - Regler dort haetten sonst gar keine Wirkung (kein Re-Render). tagName
// ist ein einfacher String und funktioniert realitaets-unabhaengig.
function isInputElement(node: EventTarget | null): node is HTMLInputElement {
  return !!node && (node as HTMLElement).tagName === 'INPUT'
}

/** Verdrahtet die Regler/Felder in `body` (per Event-Delegation, da der
 *  Inhalt bei jedem Anzeigen komplett neu aufgebaut wird) so, dass eine
 *  Aenderung direkt in den betroffenen Literal-Block zurueckschreibt. Das
 *  normale Auto-Render (workspace.addChangeListener in viewerPanel.ts)
 *  reagiert zwar AUCH darauf wie auf jede andere Blockly-Feldaenderung -
 *  dieser Pfad verlaesst sich aber zusaetzlich auf `onChange`, das den
 *  Render-Trigger OHNE Timer/Debounce direkt aufruft (exakt wie das
 *  Ausrichten-Werkzeug es nach dem Einfuegen eines Korrektur-Blocks bereits
 *  tut - siehe handleAlignPick() in viewerPanel.ts): ein per setTimeout()
 *  geplanter Debounce kann in einem durch ein maximiertes Popup-Fenster
 *  VERDECKTEN Hauptfenster von Chrome stark gedrosselt werden ("Occlusion
 *  Throttling") und dann erst viel spaeter (oder gar nicht) feuern - waehrend
 *  ein direkter, synchroner Aufruf davon unberuehrt bleibt. Nur EINMAL pro
 *  `body`-Element aufrufen (z.B. direkt nach dem Erzeugen). */
export function wireCustomizerBody(
  body: HTMLElement,
  workspace: WorkspaceSvg,
  onChange?: () => void,
): void {
  // Ein Zahlen-Feld hat ZWEI Eingaben (Regler + Zahlenfeld), die denselben
  // Block treffen - bei Aenderung an einer die andere synchron nachziehen,
  // damit beide immer denselben Wert zeigen.
  body.addEventListener('input', (event) => {
    const input = event.target
    if (!isInputElement(input)) return
    const blockId = input.dataset.blockId
    const kind = input.dataset.kind
    if (!blockId || !kind) return
    const block = workspace.getBlockById(blockId)
    if (!block) return

    if (kind === 'number') {
      // ".value" statt ".valueAsNumber": Letzteres existiert nur fuer
      // type="number"/"range", das Zahlenfeld ist aber bewusst type="text"
      // (siehe fieldControlHtml) - Komma wird hier vor dem Parsen auf Punkt
      // normalisiert, damit sowohl "2.5" als auch die im Deutschen uebliche
      // Schreibweise "2,5" funktionieren. Auf min/max begrenzt (aber NICHT
      // mehr auf ganze Zahlen gerundet): Browser setzen min/max nur optisch
      // als ":invalid" um, nicht als tatsaechliche Eingabe-Schranke.
      const rawValue = Number.parseFloat(input.value.replace(',', '.'))
      if (!Number.isFinite(rawValue)) return
      const min = Number(input.min)
      const max = Number(input.max)
      const value = Math.min(max, Math.max(min, rawValue))
      block.setFieldValue(String(value), 'NUM')
      const pair = body.querySelectorAll<HTMLInputElement>(`[data-block-id="${blockId}"]`)
      pair.forEach((el) => {
        if (el !== input) el.value = String(value)
      })
    } else if (kind === 'text') {
      block.setFieldValue(input.value, 'TEXT')
    } else if (kind === 'boolean') {
      block.setFieldValue(input.checked ? 'TRUE' : 'FALSE', 'BOOL')
    }
    onChange?.()
  })

  // Der obige "input"-Handler laesst das GERADE bearbeitete Zahlenfeld
  // waehrend des Tippens bewusst unangetastet (siehe "if (el !== input)"),
  // damit z.B. eine Tippfolge wie "1" -> "10" nicht durch einen
  // zwischenzeitlich zurueckgeschriebenen Wert gestoert wird. Erst beim
  // Verlassen des Feldes (Blur/Enter -> "change") wird die Anzeige auf den
  // tatsaechlich uebernommenen, auf min/max begrenzten Wert zurueckgesetzt -
  // ein eingetipptes "0.5" bei Gueltigkeit 1-10 zeigt danach wieder "1"
  // statt weiterhin des ungueltigen Rohwerts.
  body.addEventListener('change', (event) => {
    const input = event.target
    if (!isInputElement(input) || input.dataset.kind !== 'number') return
    const blockId = input.dataset.blockId
    if (!blockId) return
    const block = workspace.getBlockById(blockId)
    const currentValue = block?.getFieldValue('NUM')
    if (currentValue === null || currentValue === undefined) return
    body.querySelectorAll<HTMLInputElement>(`[data-block-id="${blockId}"]`).forEach((el) => {
      el.value = String(currentValue)
    })
  })
}
