export interface ConfirmDialogHandle {
  open(): void
}

export interface ConfirmDialogConfig {
  title: string
  message: string
  cancelLabel: string
  confirmLabel: string
  /** Roter Bestaetigen-Button fuer riskante/destruktive Aktionen. */
  danger?: boolean
}

/** Generischer Bestaetigungsdialog (Abbrechen/Bestaetigen), z.B. fuer
 *  "Design löschen" oder "Design laden" (ersetzt das aktuelle Design). */
export function mountConfirmDialog(
  config: ConfirmDialogConfig,
  onConfirm: () => void,
): ConfirmDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog confirm-dialog'
  dialog.innerHTML = `
    <h2>${config.title}</h2>
    <p>${config.message}</p>
    <form method="dialog" class="confirm-dialog-actions">
      <button type="submit" class="btn" value="cancel">${config.cancelLabel}</button>
      <button type="submit" class="btn${config.danger ? ' btn-danger' : ''}" value="confirm">${config.confirmLabel}</button>
    </form>
  `
  document.body.appendChild(dialog)

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') onConfirm()
  })

  return {
    open(): void {
      dialog.returnValue = ''
      dialog.showModal()
    },
  }
}
