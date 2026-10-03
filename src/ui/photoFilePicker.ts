import { t } from '../i18n'
import { mountMessageDialog } from './messageDialog'

/** Baut denselben "Datei auswaehlen -> validieren"-Ablauf wie
 *  svgFilePicker.ts/stlFilePicker.ts, aber fuer Fotos: `onValid` bekommt die
 *  rohe Datei (nicht Text/Bytes, da das Downscaling in photoDownscale.ts
 *  ueber Image+Canvas laeuft und dafuer eine echte Bildquelle braucht). Gibt
 *  eine Funktion zurueck, die den nativen Dateiauswahl-Dialog oeffnet. */
export function createPhotoFilePicker(onValid: (file: File) => void): () => void {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.hidden = true
  document.body.appendChild(fileInput)

  const errorDialog = mountMessageDialog(
    t('load_error.title'),
    t('load_error.message'),
    t('load_error.close'),
  )

  function handleFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      console.warn('[photoFilePicker] Datei sieht nicht nach einem Bild aus:', file.name)
      errorDialog.open()
      return
    }
    onValid(file)
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // erlaubt erneutes Waehlen derselben Datei
    if (file) handleFile(file)
  })

  return () => fileInput.click()
}
