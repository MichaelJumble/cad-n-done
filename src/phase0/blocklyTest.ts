import * as Blockly from 'blockly'
import { setStatus } from './status'

export function runBlocklyTest(): void {
  try {
    const workspace = Blockly.inject('blockly-div', {
      toolbox: { kind: 'flyoutToolbox', contents: [] },
    })
    const ok = workspace.id != null
    setStatus(
      'blockly',
      ok,
      ok ? 'Blockly-Workspace erfolgreich gerendert.' : 'Workspace hat keine ID erhalten.',
    )
  } catch (err) {
    setStatus('blockly', false, `Fehler: ${String(err)}`)
  }
}
