import { t } from '../i18n'
import { mountMessageDialog } from './messageDialog'

/** Datei-Picker fuer alte BlockSCAD-Projekte (blockscad3d.com) — dieselbe
 *  "auswaehlen -> plausibel? -> weiterreichen"-Struktur wie
 *  svgFilePicker.ts, aber fuer XML statt SVG-Text. Eine BlockSCAD-Datei ist
 *  selbst Blockly-XML (`<xml ...><block type="...">...`), daher reicht ein
 *  einfacher Inhaltscheck ohne vollstaendiges Parsen. */
export function createBlockscadFilePicker(
  onValid: (xml: string, filename: string) => void,
): () => void {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.xml,text/xml,application/xml'
  fileInput.hidden = true
  document.body.appendChild(fileInput)

  const errorDialog = mountMessageDialog(
    t('load_error.title'),
    t('load_error.message'),
    t('load_error.close'),
  )

  async function handleFile(file: File): Promise<void> {
    const text = await file.text()
    if (!text.includes('<xml') || !text.includes('<block')) {
      console.warn('[blockscadFilePicker] Datei sieht nicht nach BlockSCAD-XML aus:', file.name)
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
