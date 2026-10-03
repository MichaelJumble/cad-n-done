import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { t } from '../i18n'
import { mountConfirmDialog } from './confirmDialog'
import { createProjectFilePicker } from './projectFilePicker'
import { rerenderAllBlocks } from '../editor'
import { readProjectMetadata, type ProjectMetadata } from './projectMetadata'
import { restoreCommentColors } from '../editor/commentColors'

/** Baut den "Laden"-Ablauf: Bestaetigung (ersetzt das aktuelle Design) ->
 *  Dateiauswahl -> Parsen/Validieren -> erst dann Workspace leeren & laden.
 *  Enthaelt die Datei Projektname/Zaehler-Metadaten (siehe
 *  projectMetadata.ts, von saveProject.ts geschrieben), werden sie ueber
 *  `onMetadata` im Header wiederhergestellt. */
export function wireLoadProject(
  workspace: WorkspaceSvg,
  triggerBtn: HTMLButtonElement,
  onMetadata: (metadata: ProjectMetadata) => void,
): void {
  const pickFile = createProjectFilePicker((state) => {
    workspace.clear()
    Blockly.serialization.workspaces.load(state, workspace)
    rerenderAllBlocks(workspace)
    restoreCommentColors(workspace, state)
    const metadata = readProjectMetadata(state)
    if (metadata) onMetadata(metadata)
  })

  const confirmDialog = mountConfirmDialog(
    {
      title: t('load_dialog.title'),
      message: t('load_dialog.message'),
      cancelLabel: t('load_dialog.cancel'),
      confirmLabel: t('load_dialog.confirm'),
      danger: true,
    },
    pickFile,
  )

  triggerBtn.addEventListener('click', () => confirmDialog.open())
}
