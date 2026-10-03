import * as Blockly from 'blockly'

/**
 * Wandelt einen Shadow-Block (blasser Standardwert, z.B. das vorbelegte "1"
 * in einem Mathe-Block oder "0" bei X/Y/Z) in einen normalen Block um,
 * sobald der Nutzer seinen Feldwert tatsaechlich per Hand aendert — sonst
 * bliebe das Kaestchen dauerhaft blass, obwohl es keinen Standardwert mehr
 * zeigt, sondern eine bewusst eingetippte Zahl. Gilt einheitlich fuer JEDEN
 * Shadow in der App (X/Y/Z bei Wuerfel/Verschieben, Mathe-Bloecke, ...), da
 * hier auf reine Blockly-Events reagiert wird statt auf einzelne Feldtypen.
 *
 * Feuert NUR bei tatsaechlichen Feldaenderungen (Blockly.Events.BLOCK_CHANGE
 * mit element "field") — die anfaengliche Vorbelegung eines Shadows (ueber
 * connection.setShadowState() bzw. die Toolbox-"inputs"-Definition) passiert
 * beim Erzeugen des Blocks direkt im JSON-Zustand, nicht ueber ein
 * nachtraegliches Change-Event, bleibt also unberuehrt.
 */
export function installPromoteEditedShadows(workspace: Blockly.WorkspaceSvg): void {
  workspace.addChangeListener((event) => {
    if (event.type !== Blockly.Events.BLOCK_CHANGE) return
    const changeEvent = event as Blockly.Events.BlockChange
    if (changeEvent.element !== 'field') return
    if (!changeEvent.blockId) return
    const block = workspace.getBlockById(changeEvent.blockId)
    if (block?.isShadow()) block.setShadow(false)
  })
}
