import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { t } from '../i18n'
import { METADATA_KEY, type ProjectMetadata } from './projectMetadata'
import { COMMENT_COLORS_KEY, collectCommentColors } from '../editor/commentColors'

function sanitizeFilenamePart(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return cleaned || t('project.default_name')
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Speichert den aktuellen Workspace als JSON-Datei zum Download. Der
 *  Dateiname setzt sich aus Projektname + "_" + laufender Nummer zusammen
 *  (z.B. "MeinModell_007.json"), passend zur im Header sichtbaren Zaehlung.
 *  Projektname und Zaehler werden zusaetzlich als Metadaten IN der Datei
 *  gespeichert (siehe projectMetadata.ts), damit "Laden" sie im Header
 *  wiederherstellen kann. Blockly-IDs sind bereits rein alphanumerisch
 *  (siehe editor/readableIds.ts, greift schon bei der Blockerzeugung
 *  selbst), hier ist keine zusaetzliche Nachbearbeitung noetig. */
export function saveProjectFile(
  workspace: WorkspaceSvg,
  projectName: string,
  counterValue: string,
): void {
  const state = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>
  const metadata: ProjectMetadata = { projectName, counter: counterValue }
  state[METADATA_KEY] = metadata
  state[COMMENT_COLORS_KEY] = collectCommentColors(workspace)
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const filename = `${sanitizeFilenamePart(projectName)}_${counterValue}.json`
  downloadBlob(blob, filename)
}
