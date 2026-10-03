import * as Blockly from 'blockly'
import { generateReadableId, CLEAN_ID_RE } from './generateReadableId'

/**
 * Sorgt dafuer, dass neu erzeugte Variablen rein alphanumerische IDs (A-Z
 * a-z 0-9) bekommen, statt Blocklys kryptischer Standard-IDs — analog zu
 * installReadableBlockIds() fuer Bloecke (siehe dort fuer die Begruendung,
 * warum ein direkter Monkey-Patch von Blockly.utils.idGenerator.genUid
 * nicht zuverlaessig greift).
 *
 * Deckt damit alle Erzeugungswege ab, die letztlich ueber
 * VariableMap.createVariable() laufen: den "Neue Variable"-Knopf im
 * Toolbox-Flyout (editor/variablesFlyout.ts), programmatische Aufrufe
 * (z.B. ui/importProject.ts) sowie Blocklys eigene Deserialisierung beim
 * Wiederherstellen/Laden eines Workspace-Zustands.
 *
 * Ersetzt wird nur, wenn die uebergebene ID NICHT bereits rein
 * alphanumerisch ist — laesst bereits saubere IDs unangetastet (Autosave-
 * Wiederherstellung, Undo/Redo-Replay), heilt aber alte kryptische IDs aus
 * vor diesem Fix gespeicherten Projekten beim naechsten Laden automatisch aus.
 */
export function installReadableVariableIds(workspace: Blockly.WorkspaceSvg): void {
  const variableMap = workspace.getVariableMap()
  const original = variableMap.createVariable.bind(variableMap)
  variableMap.createVariable = ((name: string, opt_type?: string, opt_id?: string) => {
    const id = opt_id && CLEAN_ID_RE.test(opt_id) ? opt_id : generateReadableId()
    return original(name, opt_type, id)
  }) as typeof variableMap.createVariable
}
