/** Eigener Top-Level-Key in der gespeicherten JSON-Datei fuer Metadaten, die
 *  nicht Teil des Blockly-Workspace-Zustands sind (Projektname, laufende
 *  Nummer). Blocklys Loader liest nur "blocks"/"variables" und ignoriert
 *  unbekannte Top-Level-Keys, daher stoert dieser zusaetzliche Key das
 *  normale Laden/Importieren nicht. */
export const METADATA_KEY = 'cadium'

export interface ProjectMetadata {
  projectName: string
  counter: string
}

export function readProjectMetadata(state: object): ProjectMetadata | undefined {
  const metadata = (state as Record<string, unknown>)[METADATA_KEY]
  if (!metadata || typeof metadata !== 'object') return undefined
  const { projectName, counter } = metadata as Record<string, unknown>
  if (typeof projectName !== 'string' || typeof counter !== 'string') return undefined
  return { projectName, counter }
}
