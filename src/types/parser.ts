/** Ein Knoten im OpenSCAD-AST, wie ihn tree-sitter liefert. */
export interface ParsedNode {
  type: string
  text: string
  startPosition: { row: number; column: number }
  endPosition: { row: number; column: number }
  children: ParsedNode[]
}

/** Ergebnis der Abbildung eines geparsten AST-(Teil-)Baums auf Blockly-Bloecke. */
export interface AstToBlockResult {
  /** Blockly-Block-/Workspace-State (JSON), siehe Blockly.serialization. */
  blockState: unknown
  /** AST-Knoten, die nicht abgebildet werden konnten und auf den Raw-Code-Block fielen. */
  unmapped: ParsedNode[]
}
