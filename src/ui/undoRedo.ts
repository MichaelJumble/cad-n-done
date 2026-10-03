import type { WorkspaceSvg } from 'blockly'

/** Verdrahtet Undo-/Redo-Buttons mit dem Workspace (Blocklys eigener Undo-Stack). */
export function wireUndoRedo(
  workspace: WorkspaceSvg,
  undoBtn: HTMLButtonElement,
  redoBtn: HTMLButtonElement,
): void {
  function updateButtons(): void {
    undoBtn.disabled = workspace.getUndoStack().length === 0
    redoBtn.disabled = workspace.getRedoStack().length === 0
  }

  undoBtn.addEventListener('click', () => workspace.undo(false))
  redoBtn.addEventListener('click', () => workspace.undo(true))
  workspace.addChangeListener(updateButtons)
  updateButtons()
}
