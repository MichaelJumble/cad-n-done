import * as Blockly from 'blockly'
import { generateReadableId, CLEAN_ID_RE } from './generateReadableId'

/**
 * Sorgt dafuer, dass neu erzeugte Bloecke rein alphanumerische IDs (A-Z a-z
 * 0-9) statt Blocklys kryptischer Standard-IDs (Sonderzeichen wie $%{}~)
 * bekommen — auch beim Herausziehen aus der Toolbox-Flyout.
 *
 * Blocklys eigener ID-Generator (Blockly.utils.idGenerator.genUid) laesst
 * sich in dieser gebauten/gebuendelten Fassung NICHT zuverlaessig per
 * Monkey-Patch ueberschreiben (verifiziert: Patch greift beim direkten
 * Aufruf, aber nicht bei tatsaechlicher Blockerzeugung — vermutlich
 * inlined/gebunden beim Bundling). Stattdessen wird workspace.newBlock()
 * gewrappt: Block.prototype.constructor nutzt eine uebergebene ID 1:1,
 * wenn sie gesetzt und in diesem Workspace noch frei ist
 * (`opt_id && !workspace.getBlockById(opt_id) ? opt_id : genUid()`) — beim
 * Herausziehen aus der Flyout wird genau so eine (kryptische, von der
 * Flyout-eigenen Vorschauinstanz stammende) ID explizit durchgereicht.
 *
 * Ersetzt wird nur, wenn die uebergebene ID NICHT bereits rein
 * alphanumerisch ist ("sieht kryptisch aus") — das deckt sowohl fehlende
 * IDs (programmatische Erzeugung) als auch von der Flyout durchgereichte
 * kryptische IDs ab, laesst aber bereits sauber vergebene IDs unangetastet
 * (z.B. beim Wiederherstellen aus dem Autosave oder bei Undo/Redo-Replay
 * innerhalb derselben Sitzung), damit deren Identitaet konsistent bleibt.
 */
export function installReadableBlockIds(workspace: Blockly.WorkspaceSvg): void {
  const original = workspace.newBlock.bind(workspace)
  workspace.newBlock = ((type: string, opt_id?: string) => {
    const id = opt_id && CLEAN_ID_RE.test(opt_id) ? opt_id : generateReadableId()
    return original(type, id)
  }) as typeof workspace.newBlock
}
