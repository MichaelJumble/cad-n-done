/** Ergebnis der Uebersetzung eines Blockly-Workspace in OpenSCAD-Quelltext. */
export interface BlockToCodeResult {
  code: string
  warnings: CodegenWarning[]
}

/** Hinweis auf einen Block, der sich nicht (vollstaendig) uebersetzen liess. */
export interface CodegenWarning {
  blockId: string
  message: string
}
