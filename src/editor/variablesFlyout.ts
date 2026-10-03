import * as Blockly from 'blockly'

const CATEGORY_KEY = 'VARIABLE'
const BUTTON_KEY = 'CREATE_VARIABLE'

/** Blocklys eingebautes Blockly.Variables.flyoutCategory() erzeugt fest die
 *  eingebauten Bloecke variables_set/variables_get/math_change — diese App
 *  nutzt aber eigene, OpenSCAD-passende Bloecke (os_variable_set/
 *  os_variable_get). Daher eine eigene, gleich aufgebaute Kategorie-Flyout-
 *  Funktion: "Neue Variable"-Knopf, dann je Variable ein set- und ein
 *  get-Block (alphabetisch sortiert wie im Blockly-Original). */
function variablesFlyoutCategory(
  workspace: Blockly.WorkspaceSvg,
): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const variableModels = [...workspace.getVariableMap().getAllVariables()].sort(
    Blockly.Variables.compareByName,
  )

  const items: Blockly.utils.toolbox.FlyoutItemInfoArray = [
    { kind: 'button', text: '%{BKY_NEW_VARIABLE}', callbackkey: BUTTON_KEY },
  ]
  for (const model of variableModels) {
    items.push({
      kind: 'block',
      type: 'os_variable_set',
      gap: 8,
      fields: { VAR: { name: model.getName(), type: model.getType() } },
    })
  }
  for (const model of variableModels) {
    items.push({
      kind: 'block',
      type: 'os_variable_get',
      gap: 8,
      fields: { VAR: { name: model.getName(), type: model.getType() } },
    })
  }
  return items
}

/** Registriert die dynamische "Variablen"-Toolbox-Kategorie (custom:
 *  'VARIABLE' in toolbox.ts) samt "Neue Variable"-Knopf — ohne das wuerde
 *  die Kategorie leer bleiben bzw. neu angelegte/importierte Variablen nie
 *  in der Toolbox auftauchen. */
export function registerVariablesFlyout(workspace: Blockly.WorkspaceSvg): void {
  workspace.registerToolboxCategoryCallback(CATEGORY_KEY, variablesFlyoutCategory)
  workspace.registerButtonCallback(BUTTON_KEY, () => {
    Blockly.Variables.createVariableButtonHandler(workspace)
  })
}
