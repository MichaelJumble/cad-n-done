import './ui/layout.css'
import { initTheme } from './ui/theme'
import { renderAppShell } from './ui/app'
import { initEditor, clearWorkspace } from './editor'
import { mountCodePanel } from './ui/codePanel'
import { mountViewerPanel } from './ui/viewerPanel'
import { mountAgentPanel } from './ui/agentPanel'
import { wireUndoRedo } from './ui/undoRedo'
import { mountConfirmDialog } from './ui/confirmDialog'
import { wireLoadProject } from './ui/loadProject'
import { mountSamplesDialog } from './ui/samplesDialog'
import { wireImportProject } from './ui/importProject'
import { wireImportSvg } from './ui/importSvg'
import { wireTracePhoto } from './ui/tracePhoto'
import { wireImportStl } from './ui/importStl'
import { wireImportBlockscad } from './ui/importBlockscad'
import { getProjectName } from './ui/projectName'
import { saveProjectFile } from './ui/saveProject'
import { exportWorkspacePng } from './editor/exportPng'
import { setSplashProgress, setSplashStatus, hideSplash } from './ui/splash'
import { t } from './i18n'

initTheme()

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app root element not found')

setSplashProgress(35)
setSplashStatus(t('splash.setup_window'))

const {
  editorRoot,
  codeRoot,
  viewerRoot,
  agentRoot,
  undoBtn,
  redoBtn,
  openDesignBtn,
  samplesBtn,
  importDesignBtn,
  importSvgBtn,
  importTracePhotoBtn,
  importStlBtn,
  importBlockscadBtn,
  arrangeBlocksBtn,
  exportPngBtn,
  saveDesignBtn,
  saveDesignIconBtn,
  deleteDesignBtn,
  viewerPopout,
  setProjectNameValue,
  setCounterValue,
} = renderAppShell(root)

setSplashProgress(55)
setSplashStatus(t('splash.setup_environment'))

void initEditor(editorRoot).then((workspace) => {
  setSplashProgress(85)
  setSplashStatus(t('splash.start_3d_engine'))
  mountCodePanel(codeRoot, workspace)
  mountViewerPanel(viewerRoot, workspace, viewerPopout)
  const agentPanel = mountAgentPanel(agentRoot, workspace)
  wireUndoRedo(workspace, undoBtn, redoBtn)

  function resetDesign(): void {
    void clearWorkspace(workspace)
    setProjectNameValue('')
    setCounterValue(0)
    // Eine laufende/vergangene Agenten-Konversation bezieht sich auf jetzt
    // geloeschte Bloecke — soll nicht stehen bleiben.
    agentPanel.clear()
  }

  const deleteDialog = mountConfirmDialog(
    {
      title: t('delete_dialog.title'),
      message: t('delete_dialog.message'),
      cancelLabel: t('delete_dialog.cancel'),
      confirmLabel: t('delete_dialog.confirm'),
      danger: true,
    },
    resetDesign,
  )
  deleteDesignBtn.addEventListener('click', () => deleteDialog.open())

  wireLoadProject(workspace, openDesignBtn, (metadata) => {
    setProjectNameValue(metadata.projectName)
    setCounterValue(Number.parseInt(metadata.counter, 10))
  })
  const samplesDialog = mountSamplesDialog(workspace, (metadata) => {
    setProjectNameValue(metadata.projectName)
    setCounterValue(Number.parseInt(metadata.counter, 10))
  })
  samplesBtn.addEventListener('click', () => samplesDialog.open())
  wireImportProject(workspace, importDesignBtn)
  wireImportSvg(workspace, importSvgBtn)
  wireTracePhoto(workspace, importTracePhotoBtn)
  wireImportStl(workspace, importStlBtn)
  wireImportBlockscad(workspace, importBlockscadBtn)

  // Ordnet alle Top-Level-Bloecke in einer sauberen Spalte an (Blocklys
  // eigenes workspace.cleanUp() — dasselbe, was auch im Rechtsklick-
  // Kontextmenue "Clean up Blocks" auf dem Workspace steckt).
  arrangeBlocksBtn.addEventListener('click', () => workspace.cleanUp())

  exportPngBtn.addEventListener('click', () => {
    const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
    void exportWorkspacePng(workspace, getProjectName(), counterValue)
  })

  function saveDesign(): void {
    const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
    saveProjectFile(workspace, getProjectName(), counterValue)
  }
  saveDesignBtn.addEventListener('click', saveDesign)
  saveDesignIconBtn.addEventListener('click', saveDesign)

  setSplashStatus(t('splash.check_permissions'))
  hideSplash()
})
