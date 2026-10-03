import * as Blockly from 'blockly'

const CATEGORY_KEY = 'PROCEDURE'

/** Blocklys eingebautes Blockly.Procedures.flyoutCategory() liefert neben den
 *  beiden Definitions-Vorlagen ("etwas tun"/"gib zurück") und den
 *  dynamisch aus vorhandenen Definitionen erzeugten Aufruf-Bloecken auch
 *  "gib zurück falls" (procedures_ifreturn) — der ist fuer einen bedingten
 *  Fruehausstieg MIT Anweisungs-Rumpf gedacht, den es in OpenSCAD-Funktionen
 *  (reine Ausdruecke, siehe codegen/blocks/procedures.ts) nicht gibt, daher
 *  hier herausgefiltert. */
function proceduresFlyoutCategory(
  workspace: Blockly.WorkspaceSvg,
): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const items = Blockly.Procedures.flyoutCategory(workspace, false)
  const mapped = items
    .filter((item) => !('type' in item && item.type === 'procedures_ifreturn'))
    .map((item) => {
      // "gib zurück" (procedures_defreturn) bringt standardmaessig einen
      // Anweisungs-Rumpf (STACK) mit — OpenSCAD-Funktionen sind aber reine
      // Ausdruecke (function f(x) = ...;, kein { }-Block wie bei module).
      // Die Vorlage in der Toolbox daher gleich ohne Rumpf anbieten, damit
      // die Form von Anfang an zur echten OpenSCAD-Syntax passt.
      if ('type' in item && item.type === 'procedures_defreturn') {
        return { ...item, extraState: { hasStatements: false } }
      }
      return item
    })
  // Zwei reine Dokumentations-Bloecke (keine eigene Geometrie, siehe
  // codegen/blocks/modules.ts) direkt in dieser Kategorie mit anbieten -
  // inhaltlich gehoeren sie zu Modulen (Kommentar/Parameter-Beschreibung
  // fuer ein spaeteres Anpass-Panel), eine eigene Toolbox-Kategorie nur
  // dafuer waere unnoetig.
  return [
    ...mapped,
    { kind: 'block', type: 'os_comment' },
    { kind: 'block', type: 'os_customizer_text' },
    { kind: 'block', type: 'os_customizer_number' },
    { kind: 'block', type: 'os_customizer_boolean' },
  ]
}

/** Registriert die dynamische "Module"-Toolbox-Kategorie (custom: 'PROCEDURE'
 *  in toolbox.ts) — ohne das wuerde die Kategorie leer bleiben bzw. neu
 *  definierte module/function-Bloecke nie einen passenden Aufruf-Block in
 *  der Toolbox bekommen. */
export function registerProceduresFlyout(workspace: Blockly.WorkspaceSvg): void {
  workspace.registerToolboxCategoryCallback(CATEGORY_KEY, proceduresFlyoutCategory)
}
