import * as Blockly from 'blockly'

/**
 * Blocklys eingebautes Mutator-Feld fuer Modul-Parameternamen (im
 * "Einstellungen"-Zahnrad von procedures_defnoreturn) legt bei JEDEM
 * Tastendruck sofort eine neue Variable an (VAR_CREATE), statt die zuvor
 * angelegte umzubenennen — beim Eintippen von "tiefe" bleiben so "t", "ti",
 * "tie" und "tief" als nie wieder benutzte Karteileichen in der
 * Variablen-Liste zurueck. Das passiert tief in Blockly selbst, nicht in
 * dieser Codebase, und wird beim Schliessen des Mutators auch nicht von
 * Blockly selbst aufgeraeumt (mit einem synthetischen Reproduktionsversuch
 * per Puppeteer bestaetigt).
 *
 * Fix: waehrend das Mutator-Fenster (bubbleType 'mutator') offen ist, werden
 * alle in dieser Zeit neu angelegten Variablen-IDs gesammelt. Beim Schliessen
 * wird jede davon geloescht, die zu diesem Zeitpunkt von keinem Block mehr
 * referenziert wird (Blockly.Variables.allUsedVarModels) — die tatsaechlich
 * final gewaehlte Variable bleibt dabei unangetastet, da sie ja am Block
 * haengt; nur die Zwischenstaende beim Tippen fallen weg. Beschraenkt sich
 * bewusst auf waehrend des OFFENEN Mutators neu erzeugte IDs, damit
 * anderswo (Toolbox-Flyout, Import, KI-Agent) bewusst angelegte, noch
 * ungenutzte Variablen nicht angetastet werden.
 */
export function installMutatorVariableCleanup(workspace: Blockly.WorkspaceSvg): void {
  let trackedVarIds: Set<string> | null = null

  workspace.addChangeListener((event) => {
    if (event instanceof Blockly.Events.BubbleOpen) {
      if (event.bubbleType !== 'mutator') return
      if (event.isOpen) {
        trackedVarIds = new Set()
        return
      }
      if (!trackedVarIds) return
      const usedIds = new Set(
        Blockly.Variables.allUsedVarModels(workspace).map((model) => model.getId()),
      )
      const variableMap = workspace.getVariableMap()
      for (const varId of trackedVarIds) {
        if (usedIds.has(varId)) continue
        const model = variableMap.getVariableById(varId)
        if (model) variableMap.deleteVariable(model)
      }
      trackedVarIds = null
      return
    }
    if (trackedVarIds && event instanceof Blockly.Events.VarCreate && event.varId) {
      trackedVarIds.add(event.varId)
    }
  })
}
