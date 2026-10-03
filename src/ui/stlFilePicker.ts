import { t } from '../i18n'
import { mountMessageDialog } from './messageDialog'
import { mountConfirmDialog } from './confirmDialog'

// Kleinste plausible binaere STL-Groesse: 80-Byte-Header + 4-Byte
// Dreieckszahl (auch bei 0 Dreiecken vorhanden).
const MIN_BINARY_STL_BYTES = 84

// Ab hier warnen statt stillschweigend importieren: das daraus im
// WASM-Speicher aufgebaute Dreiecksnetz kann beim Rendern ein Vielfaches der
// Rohdateigroesse belegen, Base64-Kodierung/-Dekodierung (siehe base64.ts)
// wird spuerbar langsam (mehrere Sekunden Hauptthread-Blockade).
const STL_SIZE_WARNING_BYTES = 30 * 1024 * 1024

/** Grobe Plausibilitaetspruefung: ASCII-STL beginnt mit "solid", binaere
 *  STL hat keine zuverlaessige Signatur — hier nur eine Mindestgroesse. */
function looksLikeStl(bytes: Uint8Array): boolean {
  if (bytes.length >= MIN_BINARY_STL_BYTES) return true
  const head = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase()
  return head === 'solid'
}

/** Baut denselben "Datei auswaehlen -> validieren"-Ablauf wie
 *  svgFilePicker.ts, aber fuer (meist binaere) STL-Dateien: `onValid`
 *  bekommt die rohen Bytes plus Dateinamen. Gibt eine Funktion zurueck, die
 *  den nativen Dateiauswahl-Dialog oeffnet. */
export function createStlFilePicker(
  onValid: (data: Uint8Array, filename: string) => void,
): () => void {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'model/stl,.stl'
  fileInput.hidden = true
  document.body.appendChild(fileInput)

  const errorDialog = mountMessageDialog(
    t('load_error.title'),
    t('load_error.message'),
    t('load_error.close'),
  )

  let pendingImport: { data: Uint8Array; filename: string } | null = null
  const sizeWarningDialog = mountConfirmDialog(
    {
      title: t('stl_size_warning.title'),
      message: t('stl_size_warning.message'),
      cancelLabel: t('stl_size_warning.cancel'),
      confirmLabel: t('stl_size_warning.confirm'),
    },
    () => {
      if (!pendingImport) return
      onValid(pendingImport.data, pendingImport.filename)
      pendingImport = null
    },
  )

  async function handleFile(file: File): Promise<void> {
    const data = new Uint8Array(await file.arrayBuffer())
    if (!looksLikeStl(data)) {
      console.warn('[stlFilePicker] Datei sieht nicht nach STL aus:', file.name)
      errorDialog.open()
      return
    }
    if (data.length > STL_SIZE_WARNING_BYTES) {
      pendingImport = { data, filename: file.name }
      sizeWarningDialog.open()
      return
    }
    onValid(data, file.name)
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // erlaubt erneutes Waehlen derselben Datei
    if (file) void handleFile(file)
  })

  return () => fileInput.click()
}
