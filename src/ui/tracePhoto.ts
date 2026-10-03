import type { WorkspaceSvg } from 'blockly'
import { createPhotoFilePicker } from './photoFilePicker'
import { loadAndDownscalePhoto } from './photoDownscale'
import { mountTracePhotoDialog } from './tracePhotoDialog'
import { setTraceEditorOpener } from '../editor/blocks/tracePhoto'

/** Verdrahtet den Menuepunkt "Foto nachzeichnen…" — analog zu
 *  ui/importSvg.ts, nur dass der Dateiinhalt hier erst durch den
 *  Nachzeichnen-Dialog laeuft, bevor daraus ein os_trace_photo-Block wird. */
export function wireTracePhoto(workspace: WorkspaceSvg, triggerBtn: HTMLButtonElement): void {
  const dialog = mountTracePhotoDialog(workspace)
  setTraceEditorOpener((block, state) => dialog.openForEdit(block, state))

  const pickPhoto = createPhotoFilePicker((file) => {
    void loadAndDownscalePhoto(file).then(({ dataUrl, width, height }) => {
      dialog.openForNew({ photoDataUrl: dataUrl, width, height })
    })
  })
  triggerBtn.addEventListener('click', pickPhoto)
}
