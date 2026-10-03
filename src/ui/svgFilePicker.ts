import { t } from '../i18n'
import { mountMessageDialog } from './messageDialog'

/** Baut denselben "Datei auswaehlen -> validieren"-Ablauf wie
 *  projectFilePicker.ts, aber fuer rohen SVG-Text statt Projekt-JSON:
 *  `onValid` bekommt den Dateiinhalt nur, wenn er plausibel nach SVG
 *  aussieht; bei Fehlern erscheint automatisch ein Fehlerdialog. Gibt eine
 *  Funktion zurueck, die den nativen Dateiauswahl-Dialog oeffnet. */
export function createSvgFilePicker(onValid: (svg: string, filename: string) => void): () => void {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/svg+xml,.svg'
  fileInput.hidden = true
  document.body.appendChild(fileInput)

  const errorDialog = mountMessageDialog(
    t('load_error.title'),
    t('load_error.message'),
    t('load_error.close'),
  )

  async function handleFile(file: File): Promise<void> {
    const text = await file.text()
    if (!text.includes('<svg')) {
      console.warn('[svgFilePicker] Datei sieht nicht nach SVG aus:', file.name)
      errorDialog.open()
      return
    }
    onValid(text, file.name)
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // erlaubt erneutes Waehlen derselben Datei
    if (file) void handleFile(file)
  })

  return () => fileInput.click()
}
