import * as Blockly from 'blockly'

/**
 * Rendert jeden Block im Workspace einzeln neu — nicht nur die Top-Level-
 * Bloecke, deren eigenes render() offenbar nicht zuverlaessig auf alle
 * Nachfahren durchschlaegt. Nach jeder Batch-Erzeugung von Bloecken (Laden
 * aus localStorage, "Laden"/"Importieren" aus Datei) bleiben sonst
 * manchmal verschachtelte Kind-Bloecke (z.B. die math_number-Shadow-
 * Bloecke in X/Y/Z-Eingaengen eines Transform-Blocks, der selbst kein
 * Top-Level-Block ist) mit einer veralteten/leeren Layout-Groesse haengen
 * — sichtbar leere Eingabe-Boxen, obwohl Wert und Verbindung intern korrekt
 * sind.
 *
 * Zusaetzlich zu block.render() (Groesse/Layout) wird pro Feld auch
 * field.forceRerender() aufgerufen: bei bestimmten Konstellationen (z.B.
 * der ERSTE Block direkt im STACK-Eingang eines Moduls nach Duplizieren)
 * bleibt sonst der reine ANZEIGETEXT eines Zahlenfelds leer, obwohl Wert,
 * generierter Code und sogar die Block-Groesse bereits korrekt sind — nur
 * das Feld selbst hat seinen Text nie gezeichnet.
 */
function rerenderBlock(block: Blockly.Block): void {
  if (!block.rendered) return
  for (const field of block.getFields()) field.forceRerender()
  ;(block as Blockly.BlockSvg).render()
}

export function rerenderAllBlocks(workspace: Blockly.WorkspaceSvg): void {
  for (const block of workspace.getAllBlocks(false)) rerenderBlock(block)
}

/**
 * Wie rerenderAllBlocks(), aber beschraenkt auf einen einzelnen Block-Baum
 * (z.B. einen frisch eingefuegten/duplizierten Block samt aller
 * Nachfahren). Wichtig, damit unbeteiligte, bereits vorhandene Bloecke
 * NICHT mitgerendert werden — block.render() haengt den Block dabei intern
 * neu im SVG-DOM ein, was seine Zeichenreihenfolge (Z-Order) veraendert.
 * Ein Aufruf von rerenderAllBlocks() nach jedem Duplizieren/Einfuegen wuerde
 * daher die Stapelreihenfolge des gesamten Workspace nach der internen
 * getAllBlocks()-Reihenfolge neu mischen und unbeteiligte Bloecke optisch
 * hinter das neue Duplikat zuruecksetzen.
 */
export function rerenderBlockSubtree(root: Blockly.Block): void {
  for (const block of root.getDescendants(false)) rerenderBlock(block)
}
