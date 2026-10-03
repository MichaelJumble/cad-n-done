import type { WorkspaceSvg } from 'blockly'
import { createBlockscadFilePicker } from './blockscadFilePicker'
import { importBlockscadXml } from '../blockscad/convertBlockscadXml'
import { t } from '../i18n'

/** Wie messageDialog.ts, aber der Text wird erst bei open() gesetzt statt
 *  fix beim Mounten -- hier noetig, da die Warnliste je Importdatei anders
 *  ausfaellt (welche Blocktypen uebersprungen wurden). */
function mountDynamicMessageDialog(
  title: string,
  closeLabel: string,
): {
  open: (message: string) => void
} {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog message-dialog'
  const messageEl = document.createElement('p')
  dialog.innerHTML = `<h2>${title}</h2>`
  dialog.appendChild(messageEl)
  const form = document.createElement('form')
  form.method = 'dialog'
  form.innerHTML = `<button type="submit" class="btn">${closeLabel}</button>`
  dialog.appendChild(form)
  document.body.appendChild(dialog)

  return {
    open(message: string): void {
      messageEl.textContent = message
      dialog.showModal()
    },
  }
}

/** Verdrahtet den Menuepunkt "BlockSCAD importieren…": im Unterschied zu
 *  "Importieren…" (Cadium-eigene Projekt-JSON) liest dieser Menuepunkt alte
 *  BlockSCAD-Projektdateien (blockscad3d.com, XML) ein und wandelt ihre
 *  Bloecke in Cadium-Bloecke um (siehe blockscad/convertBlockscadXml.ts).
 *  Nicht uebertragbare Bloecke (z.B. rotate_extrude, das es in Cadium noch
 *  nicht gibt) werden uebersprungen und als Warnung gemeldet — die
 *  wichtigsten 2D-Grundformen (circle/square + linearextrude) werden dagegen
 *  auf os_circle/os_square/os_linear_extrude abgebildet, siehe dort. */
export function wireImportBlockscad(workspace: WorkspaceSvg, triggerBtn: HTMLButtonElement): void {
  const warningDialog = mountDynamicMessageDialog(
    t('blockscad_import.warning_title'),
    t('svg_text_warning.close'),
  )

  const pickFile = createBlockscadFilePicker((xml) => {
    const { importedCount, warnings } = importBlockscadXml(xml, workspace)

    if (warnings.length > 0) {
      const list = warnings.join(', ')
      const message =
        importedCount > 0
          ? `${t('blockscad_import.warning_intro')} ${list}`
          : `${t('blockscad_import.nothing_imported')} ${list}`
      warningDialog.open(message)
    }
  })

  triggerBtn.addEventListener('click', pickFile)
}
