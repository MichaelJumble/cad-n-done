import * as Blockly from 'blockly'
import { t } from '../i18n'
import { mountMessageDialog } from './messageDialog'

/** Prueft `state` probeweise in einem unsichtbaren Wegwerf-Workspace, um
 *  kaputte/fremde Dateien zu erkennen. Blocklys Loader wirft bei voellig
 *  fremdem JSON (z.B. ohne "blocks"-Key) nicht immer einen Fehler, sondern
 *  interpretiert es teils stillschweigend als leeren Workspace — daher
 *  zusaetzlich zum reinen Lade-Versuch auch ein "blocks"-Key als
 *  Mindestanforderung pruefen. */
function isLoadableState(state: object): boolean {
  if (!('blocks' in state)) return false
  const probe = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(state, probe)
    return true
  } catch {
    return false
  } finally {
    probe.dispose()
  }
}

/** Baut einen wiederverwendbaren "Datei auswaehlen -> als JSON parsen ->
 *  als Blockly-Workspace-Zustand validieren"-Ablauf: `onValid` bekommt den
 *  geparsten Zustand nur, wenn er tatsaechlich ladbar ist; bei Fehlern
 *  (kein JSON, kein "blocks"-Key, von Blockly zurueckgewiesene Struktur)
 *  erscheint automatisch ein Fehlerdialog. Gibt eine Funktion zurueck, die
 *  den nativen Dateiauswahl-Dialog oeffnet. */
export function createProjectFilePicker(onValid: (state: object) => void): () => void {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'application/json,.json'
  fileInput.hidden = true
  document.body.appendChild(fileInput)

  const errorDialog = mountMessageDialog(
    t('load_error.title'),
    t('load_error.message'),
    t('load_error.close'),
  )

  async function handleFile(file: File): Promise<void> {
    let state: object
    try {
      state = JSON.parse(await file.text()) as object
    } catch (err) {
      console.warn('[projectFilePicker] Datei ist kein gueltiges JSON:', err)
      errorDialog.open()
      return
    }

    if (!isLoadableState(state)) {
      errorDialog.open()
      return
    }

    onValid(state)
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // erlaubt erneutes Waehlen derselben Datei
    if (file) void handleFile(file)
  })

  return () => fileInput.click()
}
